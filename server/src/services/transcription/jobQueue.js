import { getDb } from '../../database/init.js';
import { transcribeBook } from './transcription.js';

// In-memory queue
const jobQueue = [];
let isProcessing = false;
const cancelledJobs = new Set();

// Add a job to the queue
export function addJob(jobId, bookId) {
  jobQueue.push({ jobId, bookId });
  console.log(`[JobQueue] Added job ${jobId} for book ${bookId}`);
  processNext();
}

// Cancel a job
export function cancelJob(jobId) {
  cancelledJobs.add(jobId);

  const queueIndex = jobQueue.findIndex(j => j.jobId === jobId);
  if (queueIndex !== -1) {
    jobQueue.splice(queueIndex, 1);
    console.log(`[JobQueue] Removed job ${jobId} from queue`);
  }

  console.log(`[JobQueue] Job ${jobId} marked for cancellation`);
}

function isJobCancelled(jobId) {
  return cancelledJobs.has(jobId);
}

// Update job status in database
function updateJobStatus(jobId, status, progress = null, errorMessage = null, statusMessage = null) {
  const db = getDb();
  if (errorMessage) {
    db.prepare(`
      UPDATE transcription_jobs SET
        status = ?,
        progress = COALESCE(?, progress),
        error_message = ?,
        status_message = COALESCE(?, status_message),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, progress, errorMessage, statusMessage, jobId);
  } else {
    db.prepare(`
      UPDATE transcription_jobs SET
        status = ?,
        progress = COALESCE(?, progress),
        status_message = COALESCE(?, status_message),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, progress, statusMessage, jobId);
  }
  console.log(`[JobQueue] Job ${jobId} status: ${status} (${progress}%)${statusMessage ? ` - ${statusMessage}` : ''}`);
}

// Process next job in queue
async function processNext() {
  if (isProcessing || jobQueue.length === 0) {
    return;
  }

  isProcessing = true;
  const job = jobQueue.shift();
  const { jobId, bookId } = job;

  console.log(`[JobQueue] Starting job ${jobId}`);

  try {
    if (isJobCancelled(jobId)) {
      console.log(`[JobQueue] Job ${jobId} was cancelled before starting`);
      cancelledJobs.delete(jobId);
      return;
    }

    // Start transcription
    updateJobStatus(jobId, 'transcribing', 5, null, 'Preparing...');

    const transcription = await transcribeBook(bookId, (progress, statusMessage) => {
      if (isJobCancelled(jobId)) return;
      // Map transcription progress (0-100) to job progress (5-95)
      const jobProgress = 5 + Math.round(progress * 0.9);
      updateJobStatus(jobId, 'transcribing', jobProgress, null, statusMessage || null);
    });

    if (isJobCancelled(jobId)) {
      console.log(`[JobQueue] Job ${jobId} cancelled during transcription`);
      cancelledJobs.delete(jobId);
      return;
    }

    updateJobStatus(jobId, 'completed', 100);
    console.log(`[JobQueue] Job ${jobId} completed successfully (${transcription.sentences.length} sentences)`);

  } catch (error) {
    console.error(`[JobQueue] Job ${jobId} failed:`, error.message);
    updateJobStatus(jobId, 'failed', null, error.message);
  } finally {
    isProcessing = false;
    processNext();
  }
}

// Resume pending jobs on server restart
export function resumePendingJobs() {
  try {
    const db = getDb();
    const pendingJobs = db.prepare(`
      SELECT id as job_id, book_id
      FROM transcription_jobs
      WHERE status IN ('pending', 'transcribing')
      ORDER BY created_at ASC
    `).all();

    for (const job of pendingJobs) {
      db.prepare(`
        UPDATE transcription_jobs SET status = 'pending', progress = 0, error_message = NULL
        WHERE id = ?
      `).run(job.job_id);

      addJob(job.job_id, job.book_id);
    }

    if (pendingJobs.length > 0) {
      console.log(`[JobQueue] Resumed ${pendingJobs.length} pending job(s)`);
    }
  } catch (error) {
    console.error('[JobQueue] Error resuming pending jobs:', error.message);
  }
}
