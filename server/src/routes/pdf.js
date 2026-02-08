import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { getDb } from '../database/init.js';
import { authenticateToken } from '../middleware/auth.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import { config } from '../config/index.js';
import { uploadPdf, getPdfPath, deletePdfFile } from '../services/pdf/upload.js';
import { addJob, getJobStatus, cancelJob } from '../services/pdf/jobQueue.js';

export const pdfRouter = Router();

// POST /api/pdf/books/:bookId/upload - Upload a PDF for a book
pdfRouter.post('/books/:bookId/upload', authenticateToken, (req, res, next) => {
  uploadPdf.single('pdf')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ValidationError(`File too large. Maximum size is ${config.pdfs.maxFileSize / 1024 / 1024}MB`));
      }
      return next(new ValidationError(err.message));
    }

    if (!req.file) {
      return next(new ValidationError('No PDF file uploaded'));
    }

    try {
      const db = getDb();
      const bookId = parseInt(req.params.bookId);
      const userId = req.user.id;

      // Verify book exists
      const book = db.prepare('SELECT id FROM books WHERE id = ?').get(bookId);
      if (!book) {
        // Delete uploaded file
        fs.unlinkSync(req.file.path);
        throw new NotFoundError('Book not found');
      }

      // Check if user already has a PDF for this book
      const existingPdf = db.prepare(
        'SELECT id FROM pdf_documents WHERE book_id = ? AND user_id = ?'
      ).get(bookId, userId);

      let pdfId;
      if (existingPdf) {
        // Update existing record
        db.prepare(`
          UPDATE pdf_documents SET
            filename = ?,
            file_path = ?,
            file_size = ?,
            page_count = NULL,
            is_scanned = 0,
            created_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(req.file.originalname, req.file.path, req.file.size, existingPdf.id);
        pdfId = existingPdf.id;

        // Delete old job and alignment data
        db.prepare('DELETE FROM pdf_jobs WHERE pdf_id = ?').run(pdfId);
        db.prepare('DELETE FROM pdf_alignment WHERE pdf_id = ?').run(pdfId);
      } else {
        // Insert new record
        const result = db.prepare(`
          INSERT INTO pdf_documents (book_id, user_id, filename, file_path, file_size)
          VALUES (?, ?, ?, ?, ?)
        `).run(bookId, userId, req.file.originalname, req.file.path, req.file.size);
        pdfId = result.lastInsertRowid;
      }

      // Create processing job
      const jobResult = db.prepare(`
        INSERT INTO pdf_jobs (pdf_id, status, progress)
        VALUES (?, 'pending', 0)
      `).run(pdfId);

      // Add to job queue for background processing
      addJob(jobResult.lastInsertRowid, pdfId, bookId);

      res.status(201).json({
        id: pdfId,
        filename: req.file.originalname,
        fileSize: req.file.size,
        status: 'pending',
        message: 'PDF uploaded successfully. Processing will begin shortly.'
      });
    } catch (error) {
      // Clean up file on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      next(error);
    }
  });
});

// GET /api/pdf/books/:bookId - Get PDF info and processing status
pdfRouter.get('/books/:bookId', authenticateToken, (req, res, next) => {
  try {
    const db = getDb();
    const bookId = parseInt(req.params.bookId);
    const userId = req.user.id;

    const pdf = db.prepare(`
      SELECT
        pd.*,
        pj.status as job_status,
        pj.progress as job_progress,
        pj.error_message,
        pj.updated_at as job_updated_at
      FROM pdf_documents pd
      LEFT JOIN pdf_jobs pj ON pd.id = pj.pdf_id
      WHERE pd.book_id = ? AND pd.user_id = ?
      ORDER BY pj.created_at DESC
      LIMIT 1
    `).get(bookId, userId);

    if (!pdf) {
      return res.json({ hasPdf: false });
    }

    // Check if alignment exists
    const alignment = db.prepare(
      'SELECT id, quality FROM pdf_alignment WHERE pdf_id = ?'
    ).get(pdf.id);

    res.json({
      hasPdf: true,
      id: pdf.id,
      filename: pdf.filename,
      fileSize: pdf.file_size,
      pageCount: pdf.page_count,
      isScanned: Boolean(pdf.is_scanned),
      createdAt: pdf.created_at,
      job: {
        status: pdf.job_status || 'unknown',
        progress: pdf.job_progress || 0,
        error: pdf.error_message,
        updatedAt: pdf.job_updated_at
      },
      hasAlignment: Boolean(alignment),
      alignmentQuality: alignment?.quality || null
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/pdf/books/:bookId/alignment - Get alignment data for playback
pdfRouter.get('/books/:bookId/alignment', authenticateToken, (req, res, next) => {
  try {
    const db = getDb();
    const bookId = parseInt(req.params.bookId);
    const userId = req.user.id;

    const pdf = db.prepare(
      'SELECT id FROM pdf_documents WHERE book_id = ? AND user_id = ?'
    ).get(bookId, userId);

    if (!pdf) {
      throw new NotFoundError('No PDF found for this book');
    }

    const alignment = db.prepare(
      'SELECT alignment_data, quality FROM pdf_alignment WHERE pdf_id = ?'
    ).get(pdf.id);

    if (!alignment) {
      throw new NotFoundError('Alignment not yet available. Processing may still be in progress.');
    }

    res.json({
      alignment: JSON.parse(alignment.alignment_data),
      quality: alignment.quality
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/pdf/:pdfId/file - Stream PDF file (for viewing)
pdfRouter.get('/:pdfId/file', authenticateToken, (req, res, next) => {
  try {
    const db = getDb();
    const pdfId = parseInt(req.params.pdfId);
    const userId = req.user.id;

    const pdf = db.prepare(
      'SELECT * FROM pdf_documents WHERE id = ? AND user_id = ?'
    ).get(pdfId, userId);

    if (!pdf) {
      throw new NotFoundError('PDF not found');
    }

    if (!fs.existsSync(pdf.file_path)) {
      throw new NotFoundError('PDF file not found on disk');
    }

    const stat = fs.statSync(pdf.file_path);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `inline; filename="${pdf.filename}"`);

    fs.createReadStream(pdf.file_path).pipe(res);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/pdf/books/:bookId - Delete user's PDF for a book
pdfRouter.delete('/books/:bookId', authenticateToken, (req, res, next) => {
  try {
    const db = getDb();
    const bookId = parseInt(req.params.bookId);
    const userId = req.user.id;

    const pdf = db.prepare(
      'SELECT id FROM pdf_documents WHERE book_id = ? AND user_id = ?'
    ).get(bookId, userId);

    if (!pdf) {
      throw new NotFoundError('No PDF found for this book');
    }

    // Delete file from disk
    deletePdfFile(bookId, userId);

    // Delete from database (cascades to jobs and alignment)
    db.prepare('DELETE FROM pdf_documents WHERE id = ?').run(pdf.id);

    // Clear cached audio transcriptions for this book so re-uploads will re-transcribe
    const transcriptionResult = db.prepare('DELETE FROM audio_transcriptions WHERE book_id = ?').run(bookId);
    console.log(`[PDF] Deleted PDF and ${transcriptionResult.changes} cached transcriptions for book ${bookId}`);

    res.json({ message: 'PDF deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// POST /api/pdf/books/:bookId/cancel - Cancel PDF processing
pdfRouter.post('/books/:bookId/cancel', authenticateToken, (req, res, next) => {
  try {
    const db = getDb();
    const bookId = parseInt(req.params.bookId);
    const userId = req.user.id;

    const pdf = db.prepare(
      'SELECT id FROM pdf_documents WHERE book_id = ? AND user_id = ?'
    ).get(bookId, userId);

    if (!pdf) {
      throw new NotFoundError('No PDF found for this book');
    }

    // Get the active job for this PDF
    const job = db.prepare(
      `SELECT id FROM pdf_jobs WHERE pdf_id = ? AND status NOT IN ('completed', 'failed', 'cancelled')`
    ).get(pdf.id);

    if (!job) {
      return res.json({ message: 'No active processing job to cancel' });
    }

    // Cancel the job
    cancelJob(job.id);

    // Update job status in database
    db.prepare(`
      UPDATE pdf_jobs SET status = 'cancelled', error_message = 'Cancelled by user'
      WHERE id = ?
    `).run(job.id);

    console.log(`[PDF] Cancelled processing job ${job.id} for book ${bookId}`);

    res.json({ message: 'Processing cancelled successfully' });
  } catch (error) {
    next(error);
  }
});
