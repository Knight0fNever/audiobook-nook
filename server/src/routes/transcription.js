import { Router } from 'express';
import { getDb } from '../database/init.js';
import { authenticateToken } from '../middleware/auth.js';
import { NotFoundError } from '../middleware/errorHandler.js';
import { addJob, cancelJob } from '../services/transcription/jobQueue.js';

export const transcriptionRouter = Router();

// All routes require authentication
transcriptionRouter.use(authenticateToken);

// POST /api/transcription/books/:bookId/start - Start transcription
transcriptionRouter.post('/books/:bookId/start', (req, res, next) => {
  try {
    const db = getDb();
    const bookId = parseInt(req.params.bookId);

    // Verify book exists
    const book = db.prepare('SELECT id FROM books WHERE id = ?').get(bookId);
    if (!book) {
      throw new NotFoundError('Book not found');
    }

    // Check if job already exists
    const existingJob = db.prepare(
      `SELECT id, status, progress FROM transcription_jobs WHERE book_id = ?`
    ).get(bookId);

    if (existingJob) {
      if (existingJob.status === 'pending' || existingJob.status === 'transcribing') {
        return res.json({ jobId: existingJob.id, status: existingJob.status, progress: existingJob.progress });
      }

      // Reset existing job for re-run
      db.prepare(`
        UPDATE transcription_jobs SET status = 'pending', progress = 0, error_message = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(existingJob.id);

      addJob(existingJob.id, bookId);
      return res.json({ jobId: existingJob.id, status: 'pending' });
    }

    // Create new job
    const result = db.prepare(`
      INSERT INTO transcription_jobs (book_id, status, progress)
      VALUES (?, 'pending', 0)
    `).run(bookId);

    addJob(result.lastInsertRowid, bookId);

    res.status(201).json({ jobId: result.lastInsertRowid, status: 'pending' });
  } catch (error) {
    next(error);
  }
});

// GET /api/transcription/books/:bookId/status - Get transcription status
transcriptionRouter.get('/books/:bookId/status', (req, res, next) => {
  try {
    const db = getDb();
    const bookId = parseInt(req.params.bookId);

    const job = db.prepare(
      'SELECT id, status, progress, error_message, updated_at FROM transcription_jobs WHERE book_id = ?'
    ).get(bookId);

    // Count chapters and transcribed chapters
    const chapterCount = db.prepare(
      'SELECT COUNT(*) as count FROM chapters WHERE book_id = ?'
    ).get(bookId).count;

    const transcribedCount = db.prepare(
      'SELECT COUNT(*) as count FROM audio_transcriptions WHERE book_id = ?'
    ).get(bookId).count;

    const hasTranscription = chapterCount > 0 && transcribedCount >= chapterCount;

    res.json({
      status: job?.status || null,
      progress: job?.progress || 0,
      error: job?.error_message || null,
      hasTranscription,
      chapterCount,
      transcribedCount
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/transcription/books/:bookId/data - Get transcription data
transcriptionRouter.get('/books/:bookId/data', (req, res, next) => {
  try {
    const db = getDb();
    const bookId = parseInt(req.params.bookId);

    // Get all chapters with their durations for global offset calculation
    const chapters = db.prepare(`
      SELECT order_index, duration_seconds
      FROM chapters
      WHERE book_id = ?
      ORDER BY order_index ASC
    `).all(bookId);

    // Get all transcriptions
    const transcriptions = db.prepare(`
      SELECT chapter_index, sentence_timestamps
      FROM audio_transcriptions
      WHERE book_id = ?
      ORDER BY chapter_index ASC
    `).all(bookId);

    if (transcriptions.length === 0) {
      return res.json({ sentences: [] });
    }

    // Build cumulative time offsets per chapter
    const chapterOffsets = {};
    let cumulativeTime = 0;
    for (const chapter of chapters) {
      chapterOffsets[chapter.order_index] = cumulativeTime;
      cumulativeTime += chapter.duration_seconds || 0;
    }

    // Build sentences with global timestamps
    const sentences = [];
    for (const tx of transcriptions) {
      const data = JSON.parse(tx.sentence_timestamps);
      const offset = chapterOffsets[tx.chapter_index] || 0;

      for (const sentence of data.sentences) {
        sentences.push({
          text: sentence.text,
          start: sentence.start,
          end: sentence.end,
          chapterIndex: tx.chapter_index,
          globalStart: offset + sentence.start,
          globalEnd: offset + sentence.end
        });
      }
    }

    res.json({ sentences });
  } catch (error) {
    next(error);
  }
});

// POST /api/transcription/books/:bookId/cancel - Cancel transcription
transcriptionRouter.post('/books/:bookId/cancel', (req, res, next) => {
  try {
    const db = getDb();
    const bookId = parseInt(req.params.bookId);

    const job = db.prepare(
      `SELECT id FROM transcription_jobs WHERE book_id = ? AND status IN ('pending', 'transcribing')`
    ).get(bookId);

    if (!job) {
      return res.json({ message: 'No active transcription job to cancel' });
    }

    cancelJob(job.id);

    db.prepare(`
      UPDATE transcription_jobs SET status = 'cancelled', error_message = 'Cancelled by user', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(job.id);

    res.json({ message: 'Transcription cancelled' });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/transcription/books/:bookId - Delete transcription data
transcriptionRouter.delete('/books/:bookId', (req, res, next) => {
  try {
    const db = getDb();
    const bookId = parseInt(req.params.bookId);

    const txResult = db.prepare('DELETE FROM audio_transcriptions WHERE book_id = ?').run(bookId);
    db.prepare('DELETE FROM transcription_jobs WHERE book_id = ?').run(bookId);

    console.log(`[Transcription] Deleted ${txResult.changes} transcriptions for book ${bookId}`);

    res.json({ message: 'Transcription data deleted' });
  } catch (error) {
    next(error);
  }
});
