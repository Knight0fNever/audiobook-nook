import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDb } from '../database/init.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import { scanLibrary, getScanStatus } from '../services/scanner/index.js';
import { enrichBookMetadata, updateBookWithEnrichedData, searchMultipleResults } from '../services/metadata/apiEnrichment.js';
import { clearCache, getCacheStats } from '../services/metadata/apiCache.js';
import { extractMetadata } from '../services/metadata/index.js';
import { getTranscriptionStatus, resetBackendDetection } from '../services/transcription/transcription.js';
import { config } from '../config/index.js';
import path from 'path';
import fs from 'fs';

export const adminRouter = Router();

// All admin routes require authentication and admin role
adminRouter.use(authenticateToken, requireAdmin);

// ==================== USER MANAGEMENT ====================

// GET /api/admin/users - List users
adminRouter.get('/users', (req, res, next) => {
  try {
    const db = getDb();
    const users = db.prepare(`
      SELECT
        u.id, u.username, u.role, u.created_at, u.updated_at,
        us.total_listening_seconds, us.books_completed
      FROM users u
      LEFT JOIN user_stats us ON u.id = us.user_id
      ORDER BY u.created_at ASC
    `).all();

    res.json(users.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      created_at: u.created_at,
      updated_at: u.updated_at,
      stats: {
        total_listening_seconds: u.total_listening_seconds || 0,
        books_completed: u.books_completed || 0
      }
    })));
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/users - Create user
adminRouter.post('/users', async (req, res, next) => {
  try {
    const db = getDb();
    const { username, password, role = 'user' } = req.body;

    if (!username || username.trim() === '') {
      throw new ValidationError('Username is required');
    }

    if (!password || password.length < 4) {
      throw new ValidationError('Password must be at least 4 characters');
    }

    if (!['admin', 'user'].includes(role)) {
      throw new ValidationError('Invalid role. Must be "admin" or "user"');
    }

    // Check if username exists
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
    if (existingUser) {
      throw new ValidationError('Username already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = db.prepare(`
      INSERT INTO users (username, password_hash, role)
      VALUES (?, ?, ?)
    `).run(username.trim(), passwordHash, role);

    const user = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?')
      .get(result.lastInsertRowid);

    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/users/:id - Update user
adminRouter.put('/users/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { username, role } = req.body;

    const existingUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existingUser) {
      throw new NotFoundError('User not found');
    }

    if (username) {
      const duplicate = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?')
        .get(username.trim(), id);
      if (duplicate) {
        throw new ValidationError('Username already exists');
      }
    }

    if (role && !['admin', 'user'].includes(role)) {
      throw new ValidationError('Invalid role');
    }

    db.prepare(`
      UPDATE users SET
        username = COALESCE(?, username),
        role = COALESCE(?, role),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(username ? username.trim() : null, role, id);

    const user = db.prepare('SELECT id, username, role, created_at, updated_at FROM users WHERE id = ?')
      .get(id);

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/users/:id/password - Reset user password
adminRouter.put('/users/:id/password', async (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { password } = req.body;

    const existingUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existingUser) {
      throw new NotFoundError('User not found');
    }

    if (!password || password.length < 4) {
      throw new ValidationError('Password must be at least 4 characters');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    db.prepare(`
      UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(passwordHash, id);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/users/:id - Delete user
adminRouter.delete('/users/:id', (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const existingUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existingUser) {
      throw new NotFoundError('User not found');
    }

    // Prevent deleting yourself
    if (parseInt(id) === req.user.id) {
      throw new ValidationError('Cannot delete your own account');
    }

    // Prevent deleting the last admin
    if (existingUser.role === 'admin') {
      const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get();
      if (adminCount.count <= 1) {
        throw new ValidationError('Cannot delete the last admin user');
      }
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// ==================== LIBRARY MANAGEMENT ====================

// POST /api/admin/library/scan - Trigger scan
adminRouter.post('/library/scan', async (req, res, next) => {
  try {
    const status = getScanStatus();
    if (status.scanning) {
      return res.status(409).json({
        error: 'Scan in progress',
        status
      });
    }

    // Start scan in background
    scanLibrary().catch(err => {
      console.error('Library scan error:', err);
    });

    res.json({
      message: 'Library scan started',
      status: getScanStatus()
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/library/status - Scan status
adminRouter.get('/library/status', (req, res, next) => {
  try {
    const db = getDb();

    const bookCount = db.prepare('SELECT COUNT(*) as count FROM books').get();
    const chapterCount = db.prepare('SELECT COUNT(*) as count FROM chapters').get();

    const libraryPath = db.prepare("SELECT value FROM settings WHERE key = 'library_path'").get();

    res.json({
      scan: getScanStatus(),
      library: {
        path: libraryPath?.value || config.library.path,
        book_count: bookCount.count,
        chapter_count: chapterCount.count
      }
    });
  } catch (error) {
    next(error);
  }
});

// ==================== SETTINGS ====================

// GET /api/admin/settings - Get settings
adminRouter.get('/settings', (req, res, next) => {
  try {
    const db = getDb();
    const settings = db.prepare('SELECT * FROM settings').all();

    const settingsObj = {};
    for (const s of settings) {
      settingsObj[s.key] = s.value;
    }

    res.json(settingsObj);
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/settings - Update settings
adminRouter.put('/settings', (req, res, next) => {
  try {
    const db = getDb();
    const {
      library_path,
      scan_schedule,
      openlibrary_enabled,
      api_enrichment_enabled,
      api_enrichment_prefer_api_covers,
      api_enrichment_rate_limit_delay,
      google_books_api_key,
      transcription_backend,
      transcription_model,
      transcription_language
    } = req.body;

    const updateSetting = db.prepare(`
      INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
    `);

    if (library_path !== undefined) {
      updateSetting.run('library_path', library_path);
    }
    if (scan_schedule !== undefined) {
      updateSetting.run('scan_schedule', scan_schedule);
    }
    if (openlibrary_enabled !== undefined) {
      updateSetting.run('openlibrary_enabled', String(openlibrary_enabled));
    }
    if (api_enrichment_enabled !== undefined) {
      updateSetting.run('api_enrichment_enabled', String(api_enrichment_enabled));
    }
    if (api_enrichment_prefer_api_covers !== undefined) {
      updateSetting.run('api_enrichment_prefer_api_covers', String(api_enrichment_prefer_api_covers));
    }
    if (api_enrichment_rate_limit_delay !== undefined) {
      updateSetting.run('api_enrichment_rate_limit_delay', String(api_enrichment_rate_limit_delay));
    }
    if (google_books_api_key !== undefined) {
      updateSetting.run('google_books_api_key', google_books_api_key);
    }
    if (transcription_backend !== undefined) {
      updateSetting.run('transcription_backend', transcription_backend);
      resetBackendDetection();
    }
    if (transcription_model !== undefined) {
      updateSetting.run('transcription_model', transcription_model);
      resetBackendDetection();
    }
    if (transcription_language !== undefined) {
      updateSetting.run('transcription_language', transcription_language);
    }

    // Return updated settings
    const settings = db.prepare('SELECT * FROM settings').all();
    const settingsObj = {};
    for (const s of settings) {
      settingsObj[s.key] = s.value;
    }

    res.json(settingsObj);
  } catch (error) {
    next(error);
  }
});

// ==================== TRANSCRIPTION ====================

// GET /api/admin/transcription/status - Get transcription backend status
adminRouter.get('/transcription/status', (req, res, next) => {
  try {
    const status = getTranscriptionStatus();
    res.json(status);
  } catch (error) {
    next(error);
  }
});

// ==================== BOOKS MANAGEMENT ====================

// DELETE /api/admin/books/:id - Delete book from database (not files)
adminRouter.delete('/books/:id', (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id);
    if (!book) {
      throw new NotFoundError('Book not found');
    }

    db.prepare('DELETE FROM books WHERE id = ?').run(id);

    res.json({ message: 'Book removed from library' });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/books/:id/enrich - Enrich single book metadata
adminRouter.post('/books/:id/enrich', async (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id);
    if (!book) {
      throw new NotFoundError('Book not found');
    }

    // Get audio metadata from first chapter
    const firstChapter = db.prepare(`
      SELECT file_path FROM chapters WHERE book_id = ? ORDER BY order_index LIMIT 1
    `).get(id);

    let audioMetadata = null;
    if (firstChapter && fs.existsSync(firstChapter.file_path)) {
      audioMetadata = await extractMetadata(firstChapter.file_path);
    }

    // Enrich metadata
    const enrichedData = await enrichBookMetadata(book, audioMetadata, { force: true, skipCache: false });

    if (!enrichedData) {
      return res.status(404).json({
        success: false,
        message: 'No metadata found from APIs'
      });
    }

    // Update book with enriched data
    const updatedBook = await updateBookWithEnrichedData(id, enrichedData);

    // Determine which fields were enriched
    const enrichedFields = [];
    if (enrichedData.isbn) enrichedFields.push('isbn');
    if (enrichedData.publisher) enrichedFields.push('publisher');
    if (enrichedData.description) enrichedFields.push('api_description');
    if (enrichedData.coverUrl) enrichedFields.push('api_cover_url');

    res.json({
      success: true,
      book: updatedBook,
      source: enrichedData.source,
      enrichedFields
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/books/:id/search-metadata - Search for multiple metadata results
adminRouter.post('/books/:id/search-metadata', async (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { limit = 5 } = req.body;

    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id);
    if (!book) {
      throw new NotFoundError('Book not found');
    }

    // Get audio metadata from first chapter
    const firstChapter = db.prepare(`
      SELECT file_path FROM chapters WHERE book_id = ? ORDER BY order_index LIMIT 1
    `).get(id);

    let audioMetadata = null;
    if (firstChapter && fs.existsSync(firstChapter.file_path)) {
      audioMetadata = await extractMetadata(firstChapter.file_path);
    }

    // Search for multiple results
    const searchResults = await searchMultipleResults(book, audioMetadata, { limit });

    if (!searchResults || searchResults.results.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No metadata found from APIs',
        results: []
      });
    }

    // If only one result, auto-apply it
    if (searchResults.results.length === 1) {
      const updatedBook = await updateBookWithEnrichedData(id, searchResults.results[0]);
      return res.json({
        success: true,
        autoApplied: true,
        book: updatedBook,
        source: searchResults.source
      });
    }

    // Return multiple results for user selection
    res.json({
      success: true,
      autoApplied: false,
      results: searchResults.results,
      source: searchResults.source
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/books/:id/apply-metadata - Apply selected metadata
adminRouter.post('/books/:id/apply-metadata', async (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { metadata } = req.body;

    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id);
    if (!book) {
      throw new NotFoundError('Book not found');
    }

    if (!metadata) {
      throw new ValidationError('Metadata is required');
    }

    // Update book with selected metadata
    const updatedBook = await updateBookWithEnrichedData(id, metadata);

    res.json({
      success: true,
      book: updatedBook,
      source: metadata.source
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/books/batch-enrich - Enrich all books
adminRouter.post('/books/batch-enrich', async (req, res, next) => {
  try {
    const db = getDb();

    // Get all books
    const books = db.prepare('SELECT * FROM books').all();

    // Start enrichment in background
    const enrichmentPromise = (async () => {
      const results = {
        total: books.length,
        succeeded: 0,
        failed: 0,
        skipped: 0
      };

      for (const book of books) {
        try {
          // Skip if already enriched (unless force is requested)
          if (book.metadata_enriched_at && !req.body.force) {
            results.skipped++;
            continue;
          }

          // Get audio metadata from first chapter
          const firstChapter = db.prepare(`
            SELECT file_path FROM chapters WHERE book_id = ? ORDER BY order_index LIMIT 1
          `).get(book.id);

          let audioMetadata = null;
          if (firstChapter && fs.existsSync(firstChapter.file_path)) {
            audioMetadata = await extractMetadata(firstChapter.file_path);
          }

          // Enrich metadata
          const enrichedData = await enrichBookMetadata(book, audioMetadata, { force: true });

          if (enrichedData) {
            await updateBookWithEnrichedData(book.id, enrichedData);
            results.succeeded++;
            console.log(`Enriched: ${book.title} (${results.succeeded}/${books.length})`);
          } else {
            results.failed++;
          }
        } catch (error) {
          console.error(`Error enriching ${book.title}:`, error.message);
          results.failed++;
        }
      }

      console.log('Batch enrichment complete:', results);
      return results;
    })();

    // Don't await - let it run in background
    enrichmentPromise.catch(err => console.error('Batch enrichment error:', err));

    res.json({
      message: 'Batch enrichment started',
      total: books.length
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/metadata/cache-stats - Get cache statistics
adminRouter.get('/metadata/cache-stats', (req, res, next) => {
  try {
    const stats = getCacheStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/metadata/cache - Clear metadata cache
adminRouter.delete('/metadata/cache', (req, res, next) => {
  try {
    clearCache();
    res.json({ message: 'Cache cleared successfully' });
  } catch (error) {
    next(error);
  }
});
