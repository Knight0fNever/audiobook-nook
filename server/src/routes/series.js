import { Router } from 'express';
import { getDb } from '../database/init.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';

export const seriesRouter = Router();

// GET /api/series - List all series
seriesRouter.get('/', authenticateToken, (req, res, next) => {
  try {
    const db = getDb();
    const series = db.prepare(`
      SELECT
        s.*,
        COUNT(b.id) as book_count,
        SUM(b.duration_seconds) as total_duration
      FROM series s
      LEFT JOIN books b ON s.id = b.series_id
      GROUP BY s.id
      ORDER BY s.name ASC
    `).all();

    res.json(series.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      book_count: s.book_count,
      total_duration: s.total_duration || 0,
      created_at: s.created_at
    })));
  } catch (error) {
    next(error);
  }
});

// GET /api/series/:id - Series with books
seriesRouter.get('/:id', authenticateToken, (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const series = db.prepare('SELECT * FROM series WHERE id = ?').get(id);
    if (!series) {
      throw new NotFoundError('Series not found');
    }

    const books = db.prepare(`
      SELECT
        b.*,
        up.position_seconds,
        up.current_chapter,
        up.completed
      FROM books b
      LEFT JOIN user_progress up ON b.id = up.book_id AND up.user_id = ?
      WHERE b.series_id = ?
      ORDER BY b.series_order ASC, b.title ASC
    `).all(req.user.id, id);

    res.json({
      id: series.id,
      name: series.name,
      description: series.description,
      created_at: series.created_at,
      books: books.map(b => ({
        id: b.id,
        title: b.title,
        author: b.author,
        narrator: b.narrator,
        series_order: b.series_order,
        duration_seconds: b.duration_seconds,
        cover_path: b.cover_path,
        cover_url: b.cover_path ? `/covers/${b.cover_path.split('/').pop()}` : null,
        progress: {
          position_seconds: b.position_seconds || 0,
          current_chapter: b.current_chapter || 0,
          completed: Boolean(b.completed),
          percentage: b.duration_seconds > 0 && b.position_seconds
            ? Math.round((b.position_seconds / b.duration_seconds) * 10000) / 100
            : 0
        }
      }))
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/series - Create series (admin)
seriesRouter.post('/', authenticateToken, requireAdmin, (req, res, next) => {
  try {
    const db = getDb();
    const { name, description } = req.body;

    if (!name || name.trim() === '') {
      throw new ValidationError('Series name is required');
    }

    const result = db.prepare(`
      INSERT INTO series (name, description)
      VALUES (?, ?)
    `).run(name.trim(), description || null);

    const series = db.prepare('SELECT * FROM series WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      id: series.id,
      name: series.name,
      description: series.description,
      created_at: series.created_at
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/series/:id - Update series (admin)
seriesRouter.put('/:id', authenticateToken, requireAdmin, (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { name, description } = req.body;

    const existingSeries = db.prepare('SELECT * FROM series WHERE id = ?').get(id);
    if (!existingSeries) {
      throw new NotFoundError('Series not found');
    }

    db.prepare(`
      UPDATE series SET
        name = COALESCE(?, name),
        description = ?
      WHERE id = ?
    `).run(
      name ? name.trim() : null,
      description !== undefined ? description : existingSeries.description,
      id
    );

    const series = db.prepare('SELECT * FROM series WHERE id = ?').get(id);

    res.json({
      id: series.id,
      name: series.name,
      description: series.description,
      created_at: series.created_at
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/series/:id - Delete series (admin)
seriesRouter.delete('/:id', authenticateToken, requireAdmin, (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const existingSeries = db.prepare('SELECT * FROM series WHERE id = ?').get(id);
    if (!existingSeries) {
      throw new NotFoundError('Series not found');
    }

    // Remove series reference from books (don't delete books)
    db.prepare('UPDATE books SET series_id = NULL, series_order = NULL WHERE series_id = ?').run(id);

    // Delete series
    db.prepare('DELETE FROM series WHERE id = ?').run(id);

    res.json({ message: 'Series deleted successfully' });
  } catch (error) {
    next(error);
  }
});
