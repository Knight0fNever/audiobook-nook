import { Router } from 'express';
import { getDb } from '../database/init.js';
import { authenticateToken } from '../middleware/auth.js';

export const statsRouter = Router();

// GET /api/stats - Current user's statistics
statsRouter.get('/', authenticateToken, (req, res, next) => {
  try {
    const db = getDb();

    // Get or create user stats
    let stats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(req.user.id);

    if (!stats) {
      // Calculate stats from progress if not exists
      const progressStats = db.prepare(`
        SELECT
          COALESCE(SUM(position_seconds), 0) as total_listening,
          COALESCE(SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END), 0) as completed_count
        FROM user_progress
        WHERE user_id = ?
      `).get(req.user.id);

      db.prepare(`
        INSERT INTO user_stats (user_id, total_listening_seconds, books_completed)
        VALUES (?, ?, ?)
      `).run(req.user.id, progressStats.total_listening, progressStats.completed_count);

      stats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(req.user.id);
    }

    // Get additional stats
    const currentlyReading = db.prepare(`
      SELECT COUNT(*) as count
      FROM user_progress
      WHERE user_id = ? AND position_seconds > 0 AND (completed = 0 OR completed IS NULL)
    `).get(req.user.id);

    const totalBooks = db.prepare('SELECT COUNT(*) as count FROM books').get();

    // Get recently completed
    const recentlyCompleted = db.prepare(`
      SELECT
        up.completed_at,
        b.id as book_id,
        b.title,
        b.author,
        b.cover_path
      FROM user_progress up
      JOIN books b ON up.book_id = b.id
      WHERE up.user_id = ? AND up.completed = 1
      ORDER BY up.completed_at DESC
      LIMIT 5
    `).all(req.user.id);

    // Format listening time
    const totalSeconds = stats.total_listening_seconds || 0;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    res.json({
      total_listening_seconds: totalSeconds,
      total_listening_formatted: hours > 0
        ? `${hours}h ${minutes}m`
        : `${minutes}m`,
      books_completed: stats.books_completed || 0,
      currently_reading: currentlyReading.count,
      total_books_in_library: totalBooks.count,
      recently_completed: recentlyCompleted.map(b => ({
        book_id: b.book_id,
        title: b.title,
        author: b.author,
        cover_url: b.cover_path ? `/covers/${b.cover_path.split('/').pop()}` : null,
        completed_at: b.completed_at
      })),
      updated_at: stats.updated_at
    });
  } catch (error) {
    next(error);
  }
});
