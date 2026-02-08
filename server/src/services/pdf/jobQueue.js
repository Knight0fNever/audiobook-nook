import { getDb } from '../../database/init.js';
import { extractPdfText } from './textExtractor.js';
import { transcribeBook } from './transcription.js';
import { alignTextToAudio } from './alignment.js';

// In-memory queue
const jobQueue = [];
let isProcessing = false;
const cancelledJobs = new Set(); // Track cancelled job IDs

// Add a job to the queue
export function addJob(jobId, pdfId, bookId) {
  jobQueue.push({ jobId, pdfId, bookId });
  console.log(`[JobQueue] Added job ${jobId} for PDF ${pdfId} (book ${bookId})`);
  processNext();
}

// Get job status from database
export function getJobStatus(jobId) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM pdf_jobs WHERE id = ?'
  ).get(jobId);
}

// Cancel a job
export function cancelJob(jobId) {
  // Add to cancelled set so processing loop can check
  cancelledJobs.add(jobId);

  // Remove from queue if not yet started
  const queueIndex = jobQueue.findIndex(j => j.jobId === jobId);
  if (queueIndex !== -1) {
    jobQueue.splice(queueIndex, 1);
    console.log(`[JobQueue] Removed job ${jobId} from queue`);
  }

  console.log(`[JobQueue] Job ${jobId} marked for cancellation`);
}

// Check if a job has been cancelled
function isJobCancelled(jobId) {
  return cancelledJobs.has(jobId);
}

// Update job status in database
function updateJobStatus(jobId, status, progress = null, errorMessage = null) {
  const db = getDb();
  if (errorMessage) {
    db.prepare(`
      UPDATE pdf_jobs SET
        status = ?,
        progress = COALESCE(?, progress),
        error_message = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, progress, errorMessage, jobId);
  } else {
    db.prepare(`
      UPDATE pdf_jobs SET
        status = ?,
        progress = COALESCE(?, progress),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, progress, jobId);
  }
  console.log(`[JobQueue] Job ${jobId} status: ${status} (${progress}%)`);
}

// Process next job in queue
async function processNext() {
  if (isProcessing || jobQueue.length === 0) {
    return;
  }

  isProcessing = true;
  const job = jobQueue.shift();
  const { jobId, pdfId, bookId } = job;

  console.log(`[JobQueue] Starting job ${jobId}`);

  try {
    const db = getDb();

    // Check if cancelled before starting
    if (isJobCancelled(jobId)) {
      console.log(`[JobQueue] Job ${jobId} was cancelled before starting`);
      cancelledJobs.delete(jobId);
      return;
    }

    // Get PDF info
    const pdf = db.prepare('SELECT * FROM pdf_documents WHERE id = ?').get(pdfId);
    if (!pdf) {
      throw new Error('PDF document not found');
    }

    // Step 1: Extract text from PDF
    updateJobStatus(jobId, 'extracting', 10);
    const pdfText = await extractPdfText(pdf.file_path);

    // Check for cancellation
    if (isJobCancelled(jobId)) {
      console.log(`[JobQueue] Job ${jobId} cancelled during extraction`);
      cancelledJobs.delete(jobId);
      return;
    }

    // Update page count
    db.prepare('UPDATE pdf_documents SET page_count = ? WHERE id = ?')
      .run(pdfText.pageCount, pdfId);

    // Check if PDF has extractable text
    if (!pdfText.hasText) {
      db.prepare('UPDATE pdf_documents SET is_scanned = 1 WHERE id = ?').run(pdfId);
      throw new Error('PDF appears to be scanned/image-based. OCR support coming in Phase 2.');
    }

    updateJobStatus(jobId, 'extracting', 30);

    // Step 2: Transcribe audio (check cache first)
    updateJobStatus(jobId, 'transcribing', 40);
    const transcription = await transcribeBook(bookId, (progress) => {
      // Map transcription progress (0-100) to job progress (40-70)
      const jobProgress = 40 + Math.round(progress * 0.3);
      updateJobStatus(jobId, 'transcribing', jobProgress);
    });

    // Check for cancellation
    if (isJobCancelled(jobId)) {
      console.log(`[JobQueue] Job ${jobId} cancelled during transcription`);
      cancelledJobs.delete(jobId);
      return;
    }

    // Step 3: Align PDF text with transcription
    updateJobStatus(jobId, 'aligning', 75);
    const alignment = await alignTextToAudio(pdfText, transcription);

    // Check for cancellation
    if (isJobCancelled(jobId)) {
      console.log(`[JobQueue] Job ${jobId} cancelled during alignment`);
      cancelledJobs.delete(jobId);
      return;
    }

    updateJobStatus(jobId, 'aligning', 90);

    // Save alignment data
    db.prepare(`
      INSERT INTO pdf_alignment (pdf_id, alignment_data, quality)
      VALUES (?, ?, ?)
    `).run(pdfId, JSON.stringify(alignment.data), alignment.quality);

    // Job complete
    updateJobStatus(jobId, 'completed', 100);
    console.log(`[JobQueue] Job ${jobId} completed successfully (quality: ${alignment.quality})`);

  } catch (error) {
    console.error(`[JobQueue] Job ${jobId} failed:`, error.message);
    updateJobStatus(jobId, 'failed', null, error.message);
  } finally {
    isProcessing = false;
    // Process next job if any
    processNext();
  }
}

// Resume pending jobs on server restart
export function resumePendingJobs() {
  try {
    const db = getDb();
    const pendingJobs = db.prepare(`
      SELECT pj.id as job_id, pj.pdf_id, pd.book_id
      FROM pdf_jobs pj
      JOIN pdf_documents pd ON pj.pdf_id = pd.id
      WHERE pj.status IN ('pending', 'extracting', 'transcribing', 'aligning')
      ORDER BY pj.created_at ASC
    `).all();

    for (const job of pendingJobs) {
      // Reset job status to pending
      db.prepare(`
        UPDATE pdf_jobs SET status = 'pending', progress = 0, error_message = NULL
        WHERE id = ?
      `).run(job.job_id);

      addJob(job.job_id, job.pdf_id, job.book_id);
    }

    if (pendingJobs.length > 0) {
      console.log(`[JobQueue] Resumed ${pendingJobs.length} pending job(s)`);
    }
  } catch (error) {
    console.error('[JobQueue] Error resuming pending jobs:', error.message);
  }
}
