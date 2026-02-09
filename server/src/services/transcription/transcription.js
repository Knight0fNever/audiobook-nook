import { getDb } from '../../database/init.js';
import { config } from '../../config/index.js';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cached backend detection result
let detectedBackend = null;

// Persistent whisper context (reused across transcriptions)
let whisperContext = null;
let whisperContextModel = null;

/**
 * Detect the best available transcription backend
 * Reads transcription_backend setting from DB ('auto', 'metal', 'cuda', 'vulkan', 'cpu')
 * @returns {{ name: string, gpu: boolean, variant: string|null, reason: string }}
 */
function detectBackend() {
  if (detectedBackend) return detectedBackend;

  const db = getDb();
  const setting = db.prepare("SELECT value FROM settings WHERE key = 'transcription_backend'").get();
  const preference = setting?.value || 'auto';

  const platform = process.platform;
  const arch = process.arch;

  console.log(`[Transcription] Platform: ${platform}-${arch}`);
  console.log(`[Transcription] Backend preference: ${preference}`);

  if (preference === 'auto') {
    detectedBackend = autoDetectBackend(platform, arch);
  } else {
    detectedBackend = manualBackend(preference, platform, arch);
  }

  console.log(`[Transcription] Backend: ${detectedBackend.name} (${detectedBackend.reason})`);
  console.log(`[Transcription] GPU: ${detectedBackend.gpu ? 'enabled' : 'disabled'}`);

  return detectedBackend;
}

/**
 * Auto-detect the best backend for the current platform
 */
function autoDetectBackend(platform, arch) {
  if (platform === 'darwin' && arch === 'arm64') {
    return { name: 'metal', gpu: true, variant: null, reason: 'auto-detected (macOS Apple Silicon)' };
  }

  if (platform === 'darwin' && arch === 'x64') {
    return { name: 'cpu', gpu: false, variant: null, reason: 'auto-detected (macOS Intel - no Metal)' };
  }

  // Windows/Linux: try CUDA, then Vulkan, then CPU
  if (platform === 'win32' || platform === 'linux') {
    // Try CUDA variant
    if (canImportVariant('cuda')) {
      return { name: 'cuda', gpu: true, variant: 'cuda', reason: 'auto-detected (CUDA available)' };
    }

    // Try Vulkan variant
    if (canImportVariant('vulkan')) {
      return { name: 'vulkan', gpu: true, variant: 'vulkan', reason: 'auto-detected (Vulkan available)' };
    }

    return { name: 'cpu', gpu: false, variant: null, reason: 'auto-detected (no GPU variant found)' };
  }

  return { name: 'cpu', gpu: false, variant: null, reason: 'auto-detected (unknown platform)' };
}

/**
 * Use manually specified backend
 */
function manualBackend(preference, platform, arch) {
  switch (preference) {
    case 'metal':
      return { name: 'metal', gpu: true, variant: null, reason: 'manual override' };
    case 'cuda':
      return { name: 'cuda', gpu: true, variant: 'cuda', reason: 'manual override' };
    case 'vulkan':
      return { name: 'vulkan', gpu: true, variant: 'vulkan', reason: 'manual override' };
    case 'cpu':
    default:
      return { name: 'cpu', gpu: false, variant: null, reason: 'manual override' };
  }
}

/**
 * Check if a whisper variant package can be imported
 * Package naming: @fugood/node-whisper-{platform}-{arch}-{variant}
 */
function canImportVariant(variant) {
  try {
    const pkg = `@fugood/node-whisper-${process.platform}-${process.arch}-${variant}`;
    require.resolve(pkg);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure the whisper model file exists, download if missing
 * @param {string} modelName - Model name (e.g., 'base.en', 'small', 'medium')
 * @returns {string} Path to the model file
 */
async function ensureModel(modelName) {
  const modelsDir = config.transcription.modelsPath;
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }

  const modelFile = `ggml-${modelName}.bin`;
  const modelPath = path.join(modelsDir, modelFile);

  if (fs.existsSync(modelPath)) {
    console.log(`[Transcription] Model: ${modelName} → ${modelPath}`);
    return modelPath;
  }

  // Download from Hugging Face
  const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${modelFile}`;
  console.log(`[Transcription] Downloading model ${modelName} from ${url}...`);

  await downloadFile(url, modelPath);
  console.log(`[Transcription] Model downloaded: ${modelPath}`);
  return modelPath;
}

/**
 * Download a file from a URL to a local path (follows redirects)
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const tmpPath = destPath + '.tmp';
    const file = fs.createWriteStream(tmpPath);

    function doRequest(requestUrl) {
      https.get(requestUrl, (response) => {
        // Follow redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          doRequest(response.headers.location);
          return;
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(tmpPath);
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          fs.renameSync(tmpPath, destPath);
          resolve();
        });
      }).on('error', (err) => {
        file.close();
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        reject(err);
      });
    }

    doRequest(url);
  });
}

/**
 * Get or create a persistent whisper context
 * Reuses context across transcriptions to avoid reloading the model
 */
async function getWhisperContext() {
  const backend = detectBackend();

  const db = getDb();
  const modelSetting = db.prepare("SELECT value FROM settings WHERE key = 'transcription_model'").get();
  const modelName = modelSetting?.value || 'base.en';

  // If context exists for the same model, reuse it
  if (whisperContext && whisperContextModel === modelName) {
    return whisperContext;
  }

  // Release old context if model changed
  if (whisperContext) {
    try {
      await whisperContext.release();
    } catch (e) {
      console.warn('[Transcription] Error releasing old context:', e.message);
    }
    whisperContext = null;
    whisperContextModel = null;
  }

  const modelPath = await ensureModel(modelName);

  try {
    const { initWhisper } = await import('@fugood/whisper.node');

    const initOptions = {
      model: modelPath,
      useGpu: backend.gpu
    };

    whisperContext = await initWhisper(initOptions, backend.variant || undefined);
    whisperContextModel = modelName;

    console.log(`[Transcription] Whisper context created (model: ${modelName}, gpu: ${backend.gpu})`);
    return whisperContext;
  } catch (error) {
    console.error('[Transcription] Failed to initialize whisper:', error.message);

    // If GPU failed, try CPU fallback
    if (backend.gpu) {
      console.log('[Transcription] Retrying with CPU fallback...');
      try {
        const { initWhisper } = await import('@fugood/whisper.node');
        whisperContext = await initWhisper({ model: modelPath, useGpu: false });
        whisperContextModel = modelName;
        detectedBackend = { name: 'cpu', gpu: false, variant: null, reason: 'fallback after GPU failure' };
        console.log('[Transcription] CPU fallback successful');
        return whisperContext;
      } catch (fallbackError) {
        console.error('[Transcription] CPU fallback also failed:', fallbackError.message);
      }
    }

    return null;
  }
}

/**
 * Transcribe all chapters of a book
 * Uses cached transcriptions when available
 * @param {number} bookId - Book ID
 * @param {function} onProgress - Progress callback (0-100)
 * @returns {Object} Transcription data with timestamps
 */
export async function transcribeBook(bookId, onProgress = () => {}) {
  const db = getDb();

  // Get all chapters for the book
  const chapters = db.prepare(`
    SELECT id, order_index, file_path, duration_seconds
    FROM chapters
    WHERE book_id = ?
    ORDER BY order_index ASC
  `).all(bookId);

  if (chapters.length === 0) {
    throw new Error('No chapters found for this book');
  }

  const transcriptions = [];
  let cumulativeTime = 0;

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    onProgress(Math.round((i / chapters.length) * 100));

    // Check cache first
    const cached = db.prepare(`
      SELECT sentence_timestamps FROM audio_transcriptions
      WHERE book_id = ? AND chapter_index = ?
    `).get(bookId, chapter.order_index);

    let chapterTranscription;

    if (cached) {
      console.log(`[Transcription] Using cached transcription for chapter ${chapter.order_index}`);
      chapterTranscription = JSON.parse(cached.sentence_timestamps);
    } else {
      console.log(`[Transcription] Transcribing chapter ${chapter.order_index}...`);
      chapterTranscription = await transcribeChapter(chapter.file_path);

      // Cache the transcription
      db.prepare(`
        INSERT INTO audio_transcriptions (book_id, chapter_index, sentence_timestamps)
        VALUES (?, ?, ?)
      `).run(bookId, chapter.order_index, JSON.stringify(chapterTranscription));
    }

    // Add global timestamps (offset by cumulative time)
    const withGlobalTimes = chapterTranscription.sentences.map(sentence => ({
      ...sentence,
      chapterIndex: chapter.order_index,
      globalStart: cumulativeTime + sentence.start,
      globalEnd: cumulativeTime + sentence.end
    }));

    transcriptions.push(...withGlobalTimes);
    cumulativeTime += chapter.duration_seconds || chapterTranscription.duration;
  }

  onProgress(100);

  return {
    bookId,
    totalDuration: cumulativeTime,
    sentences: transcriptions
  };
}

/**
 * Transcribe a single audio file using Whisper
 * @param {string} audioPath - Path to audio file
 * @returns {Object} Transcription with sentence timestamps
 */
async function transcribeChapter(audioPath) {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  // Try to get whisper context
  let context;
  try {
    context = await getWhisperContext();
  } catch (error) {
    console.error('[Transcription] Error getting whisper context:', error.message);
    context = null;
  }

  if (!context) {
    console.log('[Transcription] Whisper not available, using fallback');
    return createSyntheticTranscription(audioPath);
  }

  try {
    console.log(`[Transcription] Running whisper on: ${audioPath}`);

    // Get language setting from DB
    const db = getDb();
    const langSetting = db.prepare("SELECT value FROM settings WHERE key = 'transcription_language'").get();
    const language = langSetting?.value || 'en';

    const { stop, promise } = context.transcribeFile(audioPath, {
      language: language === 'auto' ? undefined : language
    });

    const result = await promise;

    console.log(`[Transcription] Whisper returned ${result?.segments?.length || 0} segments`);

    // Convert whisper output to our sentence format
    const sentences = parseWhisperOutput(result);

    return {
      duration: sentences.length > 0 ? sentences[sentences.length - 1].end : 0,
      sentences
    };
  } catch (error) {
    console.error('[Transcription] Whisper error:', error.message);

    // Fallback: create synthetic transcription data
    console.log('[Transcription] Using fallback synthetic transcription');
    return createSyntheticTranscription(audioPath);
  }
}

/**
 * Parse whisper output into sentence-level segments
 * @fugood/whisper.node returns: { result: string, segments: [{ text, t0, t1 }], ... }
 * where t0 and t1 are timestamps in milliseconds
 */
function parseWhisperOutput(whisperResult) {
  const segments = whisperResult?.segments;
  if (!segments || !Array.isArray(segments)) {
    return [];
  }

  const sentences = [];
  let currentSentence = {
    text: '',
    start: 0,
    end: 0
  };

  for (const segment of segments) {
    const text = (segment.text || '').trim();
    if (!text) continue;

    const startSeconds = segment.t0 / 1000;
    const endSeconds = segment.t1 / 1000;

    // Accumulate text
    if (currentSentence.text === '') {
      currentSentence.start = startSeconds;
    }
    currentSentence.text += (currentSentence.text ? ' ' : '') + text;
    currentSentence.end = endSeconds;

    // Check if this segment ends a sentence
    if (isSentenceEnd(text)) {
      if (currentSentence.text.trim()) {
        sentences.push({
          text: currentSentence.text.trim(),
          start: currentSentence.start,
          end: currentSentence.end
        });
      }
      currentSentence = { text: '', start: 0, end: 0 };
    }
  }

  // Add any remaining text
  if (currentSentence.text.trim()) {
    sentences.push({
      text: currentSentence.text.trim(),
      start: currentSentence.start,
      end: currentSentence.end
    });
  }

  return sentences;
}

/**
 * Check if text ends a sentence
 */
function isSentenceEnd(text) {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ||
         /[.!?]["']$/.test(trimmed) ||
         /[.!?]\)$/.test(trimmed);
}

/**
 * Create synthetic transcription for development/testing
 * This is used when Whisper is not available
 */
async function createSyntheticTranscription(audioPath) {
  // Try to get duration from the database or estimate
  const db = getDb();
  const chapter = db.prepare(
    'SELECT duration_seconds FROM chapters WHERE file_path = ?'
  ).get(audioPath);

  const duration = chapter?.duration_seconds || 300; // Default 5 minutes

  // Create placeholder sentences
  const avgSentenceDuration = 3; // seconds
  const sentenceCount = Math.floor(duration / avgSentenceDuration);
  const sentences = [];

  for (let i = 0; i < sentenceCount; i++) {
    sentences.push({
      text: `[Sentence ${i + 1} - transcription pending]`,
      start: i * avgSentenceDuration,
      end: (i + 1) * avgSentenceDuration
    });
  }

  return {
    duration,
    sentences,
    isSynthetic: true
  };
}

/**
 * Get the current transcription system status
 * @returns {Object} Status including backend, GPU, model, platform info
 */
export function getTranscriptionStatus() {
  let backend;
  try {
    backend = detectBackend();
  } catch {
    backend = { name: 'unavailable', gpu: false, variant: null, reason: 'database not ready' };
  }

  const db = getDb();
  const modelSetting = db.prepare("SELECT value FROM settings WHERE key = 'transcription_model'").get();
  const modelName = modelSetting?.value || 'base.en';

  const modelsDir = config.transcription.modelsPath;
  const modelFile = `ggml-${modelName}.bin`;
  const modelPath = path.join(modelsDir, modelFile);
  const modelDownloaded = fs.existsSync(modelPath);

  let whisperAvailable = false;
  try {
    // Check if the base package is resolvable
    require.resolve('@fugood/whisper.node');
    whisperAvailable = true;
  } catch {
    whisperAvailable = false;
  }

  return {
    available: whisperAvailable,
    backend: backend.name,
    gpu: backend.gpu,
    variant: backend.variant,
    reason: backend.reason,
    model: modelName,
    modelDownloaded,
    modelPath: modelDownloaded ? modelPath : null,
    platform: `${process.platform}-${process.arch}`
  };
}

/**
 * Reset cached backend detection (called when settings change)
 */
export function resetBackendDetection() {
  detectedBackend = null;
  // Also release whisper context so it reinitializes with new settings
  if (whisperContext) {
    whisperContext.release().catch(e => {
      console.warn('[Transcription] Error releasing context on reset:', e.message);
    });
    whisperContext = null;
    whisperContextModel = null;
  }
}
