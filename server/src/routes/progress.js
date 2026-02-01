import { Router } from 'express';
import path from 'path';
import { getDb } from '../database/init.js';
import { authenticateToken } from '../middleware/auth.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';

export const progressRouter = Router();

// GET /api/progress - User's progress for all books
progressRouter.get('/', authenticateToken, (req, res, next) => {
  try {
    const db = getDb();
    const progress = db.prepare(`
      SELECT
        up.*,
        b.title,
        b.author,
        b.cover_path,
        b.duration_seconds as book_duration
      FROM user_progress up
      JOIN books b ON up.book_id = b.id
      WHERE up.user_id = ?
      ORDER BY up.updated_at DESC
    `).all(req.user.id);

    res.json(progress.map(p => ({
      book_id: p.book_id,
      title: p.title,
      author: p.author,
      cover_path: p.cover_path,
      cover_url: p.cover_path ? `/covers/${path.basename(p.cover_path)}` : null,
      current_chapter: p.current_chapter,
      position_seconds: p.position_seconds,
      completed: Boolean(p.completed),
      percentage: p.book_duration > 0
        ? Math.round((p.position_seconds / p.book_duration) * 10000) / 100
        : 0,
      started_at: p.started_at,
      completed_at: p.completed_at,
      updated_at: p.updated_at
    })));
  } catch (error) {
    next(error);
  }
});

// GET /api/progress/recent - Recently played books
progressRouter.get('/recent', authenticateToken, (req, res, next) => {
  try {
    const db = getDb();
    const limit = parseInt(req.query.limit) || 10;

    const recent = db.prepare(`
      SELECT
        up.*,
        b.id as book_id,
        b.title,
        b.author,
        b.narrator,
        b.cover_path,
        b.duration_seconds as book_duration,
        s.name as series_name
      FROM user_progress up
      JOIN books b ON up.book_id = b.id
      LEFT JOIN series s ON b.series_id = s.id
      WHERE up.user_id = ?
        AND up.position_seconds > 0
        AND (up.completed = 0 OR up.completed IS NULL)
      ORDER BY up.updated_at DESC
      LIMIT ?
    `).all(req.user.id, limit);

    res.json(recent.map(p => ({
      book_id: p.book_id,
      title: p.title,
      author: p.author,
      narrator: p.narrator,
      series_name: p.series_name,
      cover_path: p.cover_path,
      cover_url: p.cover_path ? `/covers/${path.basename(p.cover_path)}` : null,
      current_chapter: p.current_chapter,
      position_seconds: p.position_seconds,
      book_duration: p.book_duration,
      percentage: p.book_duration > 0
        ? Math.round((p.position_seconds / p.book_duration) * 10000) / 100
        : 0,
      time_remaining: p.book_duration - p.position_seconds,
      updated_at: p.updated_at
    })));
  } catch (error) {
    next(error);
  }
});

// GET /api/progress/:bookId - Progress for specific book
progressRouter.get('/:bookId', authenticateToken, (req, res, next) => {
  try {
    const db = getDb();
    const { bookId } = req.params;

    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
    if (!book) {
      throw new NotFoundError('Book not found');
    }

    const progress = db.prepare(`
      SELECT * FROM user_progress
      WHERE user_id = ? AND book_id = ?
    `).get(req.user.id, bookId);

    if (!progress) {
      return res.json({
        book_id: parseInt(bookId),
        current_chapter: 0,
        position_seconds: 0,
        completed: false,
        percentage: 0,
        started_at: null,
        completed_at: null,
        updated_at: null
      });
    }

    res.json({
      book_id: progress.book_id,
      current_chapter: progress.current_chapter,
      position_seconds: progress.position_seconds,
      completed: Boolean(progress.completed),
      percentage: book.duration_seconds > 0
        ? Math.round((progress.position_seconds / book.duration_seconds) * 10000) / 100
        : 0,
      started_at: progress.started_at,
      completed_at: progress.completed_at,
      updated_at: progress.updated_at
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/progress/:bookId - Update progress
progressRouter.put('/:bookId', authenticateToken, (req, res, next) => {
  try {
    const db = getDb();
    const { bookId } = req.params;
    const { position_seconds, current_chapter, completed } = req.body;

    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
    if (!book) {
      throw new NotFoundError('Book not found');
    }

    if (position_seconds !== undefined && (typeof position_seconds !== 'number' || position_seconds < 0)) {
      throw new ValidationError('Invalid position_seconds');
    }

    const existingProgress = db.prepare(`
      SELECT * FROM user_progress WHERE user_id = ? AND book_id = ?
    `).get(req.user.id, bookId);

    const isCompleted = completed !== undefined ? completed :
      (position_seconds >= book.duration_seconds * 0.95);

    if (existingProgress) {
      // Update existing progress
      const listenedDelta = position_seconds !== undefined
        ? Math.max(0, position_seconds - existingProgress.position_seconds)
        : 0;

      db.prepare(`
        UPDATE user_progress SET
          position_seconds = COALESCE(?, position_seconds),
          current_chapter = COALESCE(?, current_chapter),
          completed = ?,
          completed_at = CASE WHEN ? = 1 AND completed = 0 THEN CURRENT_TIMESTAMP ELSE completed_at END,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND book_id = ?
      `).run(
        position_seconds,
        current_chapter,
        isCompleted ? 1 : 0,
        isCompleted ? 1 : 0,
        req.user.id,
        bookId
      );

      // Update user stats
      if (listenedDelta > 0) {
        updateUserStats(db, req.user.id, listenedDelta, isCompleted && !existingProgress.completed);
      }
    } else {
      // Create new progress
      db.prepare(`
        INSERT INTO user_progress (user_id, book_id, position_seconds, current_chapter, completed, started_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        req.user.id,
        bookId,
        position_seconds || 0,
        current_chapter || 0,
        isCompleted ? 1 : 0
      );

      // Update user stats
      if (position_seconds > 0) {
        updateUserStats(db, req.user.id, position_seconds, isCompleted);
      }
    }

    const updatedProgress = db.prepare(`
      SELECT * FROM user_progress WHERE user_id = ? AND book_id = ?
    `).get(req.user.id, bookId);

    res.json({
      book_id: updatedProgress.book_id,
      current_chapter: updatedProgress.current_chapter,
      position_seconds: updatedProgress.position_seconds,
      completed: Boolean(updatedProgress.completed),
      percentage: book.duration_seconds > 0
        ? Math.round((updatedProgress.position_seconds / book.duration_seconds) * 10000) / 100
        : 0,
      started_at: updatedProgress.started_at,
      completed_at: updatedProgress.completed_at,
      updated_at: updatedProgress.updated_at
    });
  } catch (error) {
    next(error);
  }
});

// Helper function to update user stats
function updateUserStats(db, userId, listenedSeconds, bookCompleted) {
  const existingStats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId);

  if (existingStats) {
    db.prepare(`
      UPDATE user_stats SET
        total_listening_seconds = total_listening_seconds + ?,
        books_completed = books_completed + ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(listenedSeconds, bookCompleted ? 1 : 0, userId);
  } else {
    db.prepare(`
      INSERT INTO user_stats (user_id, total_listening_seconds, books_completed)
      VALUES (?, ?, ?)
    `).run(userId, listenedSeconds, bookCompleted ? 1 : 0);
  }
}
