import { getDb } from '../../database/init.js';
import { config } from '../../config/index.js';
import natural from 'natural';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load .env before accessing env vars (needed because this module loads early)
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Add whisper-node's binary directory to PATH so whisper-cli.exe can be found
// This must be done BEFORE importing/calling the whisper module
// Supports WHISPER_WIN_FLAVOR env var: 'cpu' (default), 'blas' (OpenBLAS), 'cublas-11.8', 'cublas-12.4'
if (process.platform === 'win32') {
  const whisperBaseDir = path.join(__dirname, '../../../node_modules/@lumen-labs-dev/whisper-node/lib/whisper.cpp');
  const flavor = (process.env.WHISPER_WIN_FLAVOR || 'cpu').toLowerCase();

  const flavorDirs = {
    'cpu': 'Win64',
    'blas': 'BlasWin64',
    'cublas-11.8': 'CublasWin64-11.8',
    'cublas-12.4': 'CublasWin64-12.4'
  };

  const binDirName = flavorDirs[flavor] || 'Win64';
  const whisperBinDir = path.join(whisperBaseDir, binDirName);

  if (fs.existsSync(whisperBinDir)) {
    const currentPath = process.env.PATH || '';
    if (!currentPath.includes(whisperBinDir)) {
      process.env.PATH = whisperBinDir + path.delimiter + currentPath;
      console.log(`[Transcription] Using whisper flavor: ${flavor}`);
      console.log('[Transcription] Added whisper binary directory to PATH:', whisperBinDir);
    }
  } else {
    console.warn(`[Transcription] Whisper binary directory not found for flavor '${flavor}': ${whisperBinDir}`);
    // Fallback to CPU
    const fallbackDir = path.join(whisperBaseDir, 'Win64');
    if (fs.existsSync(fallbackDir)) {
      process.env.PATH = fallbackDir + path.delimiter + (process.env.PATH || '');
      console.log('[Transcription] Falling back to CPU flavor');
    }
  }
}

const tokenizer = new natural.SentenceTokenizer();

// Whisper availability flag - set after first check
let whisperModule = null;
let whisperChecked = false;

/**
 * Dynamically load the whisper module
 * Using dynamic import to handle potential initialization errors
 */
async function getWhisper() {
  if (whisperChecked) {
    return whisperModule;
  }

  try {
    const module = await import('@lumen-labs-dev/whisper-node');
    // The package exports { whisper } as a named export
    whisperModule = module.whisper;
    console.log('[Transcription] Whisper module loaded successfully, type:', typeof whisperModule);
  } catch (error) {
    console.error('[Transcription] Failed to load whisper module:', error.message);
    whisperModule = null;
  }

  whisperChecked = true;
  return whisperModule;
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

  // Try to get whisper module
  const whisper = await getWhisper();

  if (!whisper) {
    console.log('[Transcription] Whisper not available, using fallback');
    return createSyntheticTranscription(audioPath);
  }

  try {
    console.log(`[Transcription] Running whisper on: ${audioPath}`);

    // Use @lumen-labs-dev/whisper-node which auto-converts MP3 to WAV
    // Returns array of { start, end, speech }
    const result = await whisper(audioPath, {
      modelName: config.pdfs.whisperModel || 'base',
      whisperOptions: {
        language: 'en'
      }
    });

    console.log(`[Transcription] Whisper returned ${result?.length || 0} segments`);

    // Convert whisper output to our sentence format
    const sentences = parseWhisperOutput(result);

    return {
      duration: sentences.length > 0 ? sentences[sentences.length - 1].end : 0,
      sentences
    };
  } catch (error) {
    console.error('[Transcription] Whisper error:', error.message);

    // Fallback: create synthetic transcription data for testing
    console.log('[Transcription] Using fallback synthetic transcription');
    return createSyntheticTranscription(audioPath);
  }
}

/**
 * Parse whisper output into sentence-level segments
 * Input format: [{ start: "00:00:14.310", end: "00:00:16.480", speech: "howdy" }]
 */
function parseWhisperOutput(whisperResult) {
  if (!whisperResult || !Array.isArray(whisperResult)) {
    return [];
  }

  const sentences = [];
  let currentSentence = {
    text: '',
    start: 0,
    end: 0
  };

  for (const segment of whisperResult) {
    const text = segment.speech || '';
    const startSeconds = parseTimestamp(segment.start);
    const endSeconds = parseTimestamp(segment.end);

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
 * Parse timestamp string "HH:MM:SS.mmm" to seconds
 */
function parseTimestamp(timestamp) {
  if (typeof timestamp === 'number') {
    return timestamp;
  }

  if (!timestamp || typeof timestamp !== 'string') {
    return 0;
  }

  const parts = timestamp.split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]) || 0;
    const minutes = parseFloat(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return parseFloat(timestamp) || 0;
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
