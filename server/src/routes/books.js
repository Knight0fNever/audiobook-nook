import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import mime from 'mime-types';
import { getDb } from '../database/init.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import { config } from '../config/index.js';

export const booksRouter = Router();

// GET /api/books - List books with search/filter
booksRouter.get('/', authenticateToken, (req, res, next) => {
  try {
    const db = getDb();
    const {
      search,
      author,
      series,
      genre,
      status,
      sort = 'title',
      order = 'asc',
      limit = 50,
      offset = 0
    } = req.query;

    let query = `
      SELECT b.*,
        s.name as series_name,
        up.position_seconds,
        up.current_chapter,
        up.completed,
        up.updated_at as progress_updated_at
      FROM books b
      LEFT JOIN series s ON b.series_id = s.id
      LEFT JOIN user_progress up ON b.id = up.book_id AND up.user_id = ?
      WHERE 1=1
    `;
    const params = [req.user.id];

    // Search filter
    if (search) {
      query += ` AND (b.title LIKE ? OR b.author LIKE ? OR b.narrator LIKE ? OR b.description LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Author filter
    if (author) {
      query += ` AND b.author LIKE ?`;
      params.push(`%${author}%`);
    }

    // Series filter
    if (series) {
      query += ` AND b.series_id = ?`;
      params.push(parseInt(series));
    }

    // Genre filter
    if (genre) {
      query += ` AND b.genre LIKE ?`;
      params.push(`%${genre}%`);
    }

    // Status filter (in_progress, completed, not_started)
    if (status === 'in_progress') {
      query += ` AND up.position_seconds > 0 AND (up.completed = 0 OR up.completed IS NULL)`;
    } else if (status === 'completed') {
      query += ` AND up.completed = 1`;
    } else if (status === 'not_started') {
      query += ` AND (up.position_seconds IS NULL OR up.position_seconds = 0)`;
    }

    // Sorting
    const validSortColumns = ['title', 'author', 'created_at', 'duration_seconds', 'publication_year'];
    const sortColumn = validSortColumns.includes(sort) ? `b.${sort}` : 'b.title';
    const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    if (sort === 'progress') {
      query += ` ORDER BY COALESCE(up.position_seconds / NULLIF(b.duration_seconds, 0), 0) ${sortOrder}`;
    } else {
      query += ` ORDER BY ${sortColumn} ${sortOrder}`;
    }

    query += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const books = db.prepare(query).all(...params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM books b
      LEFT JOIN user_progress up ON b.id = up.book_id AND up.user_id = ?
      WHERE 1=1
    `;
    const countParams = [req.user.id];

    if (search) {
      countQuery += ` AND (b.title LIKE ? OR b.author LIKE ? OR b.narrator LIKE ? OR b.description LIKE ?)`;
      const searchTerm = `%${search}%`;
      countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    if (author) {
      countQuery += ` AND b.author LIKE ?`;
      countParams.push(`%${author}%`);
    }
    if (series) {
      countQuery += ` AND b.series_id = ?`;
      countParams.push(parseInt(series));
    }
    if (genre) {
      countQuery += ` AND b.genre LIKE ?`;
      countParams.push(`%${genre}%`);
    }
    if (status === 'in_progress') {
      countQuery += ` AND up.position_seconds > 0 AND (up.completed = 0 OR up.completed IS NULL)`;
    } else if (status === 'completed') {
      countQuery += ` AND up.completed = 1`;
    } else if (status === 'not_started') {
      countQuery += ` AND (up.position_seconds IS NULL OR up.position_seconds = 0)`;
    }

    const { total } = db.prepare(countQuery).get(...countParams);

    res.json({
      books: books.map(formatBook),
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/books/:id - Book details
booksRouter.get('/:id', authenticateToken, (req, res, next) => {
  try {
    const db = getDb();
    const book = db.prepare(`
      SELECT b.*,
        s.name as series_name,
        up.position_seconds,
        up.current_chapter,
        up.completed,
        up.started_at,
        up.completed_at,
        up.updated_at as progress_updated_at
      FROM books b
      LEFT JOIN series s ON b.series_id = s.id
      LEFT JOIN user_progress up ON b.id = up.book_id AND up.user_id = ?
      WHERE b.id = ?
    `).get(req.user.id, req.params.id);

    if (!book) {
      throw new NotFoundError('Book not found');
    }

    res.json(formatBook(book));
  } catch (error) {
    next(error);
  }
});

// PUT /api/books/:id - Update book (admin)
booksRouter.put('/:id', authenticateToken, requireAdmin, (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const {
      title,
      author,
      narrator,
      description,
      publication_year,
      genre,
      series_id,
      series_order
    } = req.body;

    const existingBook = db.prepare('SELECT * FROM books WHERE id = ?').get(id);
    if (!existingBook) {
      throw new NotFoundError('Book not found');
    }

    db.prepare(`
      UPDATE books SET
        title = COALESCE(?, title),
        author = COALESCE(?, author),
        narrator = COALESCE(?, narrator),
        description = COALESCE(?, description),
        publication_year = COALESCE(?, publication_year),
        genre = COALESCE(?, genre),
        series_id = ?,
        series_order = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title,
      author,
      narrator,
      description,
      publication_year,
      genre,
      series_id || null,
      series_order || null,
      id
    );

    const updatedBook = db.prepare(`
      SELECT b.*, s.name as series_name
      FROM books b
      LEFT JOIN series s ON b.series_id = s.id
      WHERE b.id = ?
    `).get(id);

    res.json(formatBook(updatedBook));
  } catch (error) {
    next(error);
  }
});

// GET /api/books/:id/chapters - List chapters
booksRouter.get('/:id/chapters', authenticateToken, (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id);
    if (!book) {
      throw new NotFoundError('Book not found');
    }

    const chapters = db.prepare(`
      SELECT id, title, start_seconds, duration_seconds, order_index
      FROM chapters
      WHERE book_id = ?
      ORDER BY order_index ASC
    `).all(id);

    res.json(chapters);
  } catch (error) {
    next(error);
  }
});

// GET /api/books/:id/stream/:chapterIndex - Stream audio
booksRouter.get('/:id/stream/:chapterIndex', authenticateToken, (req, res, next) => {
  try {
    const db = getDb();
    const { id, chapterIndex } = req.params;

    const chapter = db.prepare(`
      SELECT * FROM chapters
      WHERE book_id = ? AND order_index = ?
    `).get(id, parseInt(chapterIndex));

    if (!chapter) {
      throw new NotFoundError('Chapter not found');
    }

    const filePath = chapter.file_path;
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('Audio file not found');
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const mimeType = mime.lookup(filePath) || 'audio/mpeg';
    const range = req.headers.range;

    if (range) {
      // Handle range requests for seeking
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType
      });

      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes'
      });

      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    next(error);
  }
});

// Helper function to format book response
function formatBook(book) {
  const progress = book.duration_seconds > 0 && book.position_seconds
    ? (book.position_seconds / book.duration_seconds) * 100
    : 0;

  // Determine cover URL (prefer API cover if available, otherwise local cover)
  let coverUrl = null;
  if (book.api_cover_url) {
    // API cover is stored in api subfolder
    coverUrl = `/covers/api/${path.basename(book.api_cover_url)}`;
  } else if (book.cover_path) {
    coverUrl = `/covers/${path.basename(book.cover_path)}`;
  }

  return {
    id: book.id,
    title: book.title,
    author: book.author,
    narrator: book.narrator,
    description: book.description,
    duration_seconds: book.duration_seconds,
    publication_year: book.publication_year,
    genre: book.genre,
    series_id: book.series_id,
    series_name: book.series_name || null,
    series_order: book.series_order,
    cover_path: book.cover_path,
    cover_url: coverUrl,
    isbn: book.isbn || null,
    publisher: book.publisher || null,
    api_description: book.api_description || null,
    metadata_source: book.metadata_source || null,
    metadata_enriched_at: book.metadata_enriched_at || null,
    created_at: book.created_at,
    updated_at: book.updated_at,
    progress: {
      position_seconds: book.position_seconds || 0,
      current_chapter: book.current_chapter || 0,
      completed: Boolean(book.completed),
      percentage: Math.round(progress * 100) / 100,
      started_at: book.started_at,
      completed_at: book.completed_at,
      updated_at: book.progress_updated_at
    }
  };
}
