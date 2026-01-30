import fs from 'fs';
import path from 'path';
import { getDb } from '../../database/init.js';
import { extractMetadata, extractCoverArt } from '../metadata/index.js';
import { config } from '../../config/index.js';

// Scan status tracking
let scanStatus = {
  scanning: false,
  progress: 0,
  total: 0,
  current: '',
  errors: [],
  lastScan: null,
  results: {
    added: 0,
    updated: 0,
    removed: 0
  }
};

const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.m4b'];

export function getScanStatus() {
  return { ...scanStatus };
}

export async function scanLibrary() {
  if (scanStatus.scanning) {
    throw new Error('Scan already in progress');
  }

  const db = getDb();
  const libraryPath = db.prepare("SELECT value FROM settings WHERE key = 'library_path'").get()?.value
    || config.library.path;

  if (!fs.existsSync(libraryPath)) {
    throw new Error(`Library path does not exist: ${libraryPath}`);
  }

  // Reset scan status
  scanStatus = {
    scanning: true,
    progress: 0,
    total: 0,
    current: '',
    errors: [],
    lastScan: null,
    results: {
      added: 0,
      updated: 0,
      removed: 0
    }
  };

  try {
    // Find all book folders (Author/BookTitle structure)
    const bookFolders = findBookFolders(libraryPath);
    scanStatus.total = bookFolders.length;

    console.log(`Found ${bookFolders.length} potential audiobook folders`);

    // Track existing books for removal detection
    const existingBooks = new Set(
      db.prepare('SELECT folder_path FROM books').all().map(b => b.folder_path)
    );

    // Process each book folder
    for (let i = 0; i < bookFolders.length; i++) {
      const folderPath = bookFolders[i];
      scanStatus.progress = i + 1;
      scanStatus.current = path.basename(folderPath);

      try {
        await processBookFolder(db, folderPath, existingBooks);
      } catch (error) {
        console.error(`Error processing ${folderPath}:`, error.message);
        scanStatus.errors.push({
          folder: folderPath,
          error: error.message
        });
      }
    }

    // Mark missing books (folders that no longer exist)
    for (const folderPath of existingBooks) {
      if (!fs.existsSync(folderPath)) {
        db.prepare('DELETE FROM books WHERE folder_path = ?').run(folderPath);
        scanStatus.results.removed++;
        console.log(`Removed missing book: ${folderPath}`);
      }
    }

    scanStatus.lastScan = new Date().toISOString();
    console.log(`Scan completed. Added: ${scanStatus.results.added}, Updated: ${scanStatus.results.updated}, Removed: ${scanStatus.results.removed}`);

  } finally {
    scanStatus.scanning = false;
    scanStatus.current = '';
  }

  return scanStatus.results;
}

function findBookFolders(libraryPath) {
  const bookFolders = [];

  // Scan for Author/BookTitle structure
  const authors = fs.readdirSync(libraryPath, { withFileTypes: true })
    .filter(d => d.isDirectory());

  for (const author of authors) {
    const authorPath = path.join(libraryPath, author.name);
    const books = fs.readdirSync(authorPath, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const book of books) {
      const bookPath = path.join(authorPath, book.name);
      // Check if folder contains audio files
      if (hasAudioFiles(bookPath)) {
        bookFolders.push(bookPath);
      }
    }

    // Also check if author folder itself contains audio (flat structure)
    if (hasAudioFiles(authorPath)) {
      bookFolders.push(authorPath);
    }
  }

  return bookFolders;
}

function hasAudioFiles(folderPath) {
  try {
    const files = fs.readdirSync(folderPath);
    return files.some(f => AUDIO_EXTENSIONS.includes(path.extname(f).toLowerCase()));
  } catch {
    return false;
  }
}

async function processBookFolder(db, folderPath, existingBooks) {
  const audioFiles = fs.readdirSync(folderPath)
    .filter(f => AUDIO_EXTENSIONS.includes(path.extname(f).toLowerCase()))
    .sort(naturalSort);

  if (audioFiles.length === 0) {
    return;
  }

  // Parse folder structure for default metadata
  const parts = folderPath.split(path.sep).filter(p => p.length > 0);
  const bookName = parts[parts.length - 1];
  const authorName = parts[parts.length - 2];

  // Extract metadata from first audio file
  const firstFilePath = path.join(folderPath, audioFiles[0]);
  const metadata = await extractMetadata(firstFilePath);

  console.log(`Processing: ${folderPath}`);
  console.log(`  Book: ${bookName}, Author: ${authorName}`);
  console.log(`  Metadata:`, { title: metadata.title, author: metadata.author, narrator: metadata.narrator });

  // Use folder name for book title (more reliable than chapter metadata)
  // Only use metadata title if it doesn't look like a chapter name
  const isChapterTitle = metadata.title && (
    /^chapter\s+\d+/i.test(metadata.title) ||
    /^\d+\s*[-\.]\s*/i.test(metadata.title)
  );

  const title = (!metadata.title || isChapterTitle) ? bookName : metadata.title;
  const author = metadata.author || authorName;

  // Ensure all metadata values are null instead of undefined
  const narrator = metadata.narrator || null;
  const description = metadata.description || null;
  const year = metadata.year || null;
  const genre = metadata.genre || null;

  // Check if book exists
  const existingBook = db.prepare('SELECT * FROM books WHERE folder_path = ?').get(folderPath);
  existingBooks.delete(folderPath);

  let bookId;

  try {
    if (existingBook) {
      // Update existing book
      console.log(`  Updating book ID ${existingBook.id}`);
      db.prepare(`
        UPDATE books SET
          title = ?,
          author = ?,
          narrator = ?,
          description = ?,
          publication_year = ?,
          genre = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        title,
        author,
        narrator,
        description,
        year,
        genre,
        existingBook.id
      );
      bookId = existingBook.id;
      scanStatus.results.updated++;
    } else {
      // Insert new book
      console.log(`  Inserting new book with params:`, { title, author, narrator, description, year, genre, folderPath });
      const result = db.prepare(`
        INSERT INTO books (title, author, narrator, description, publication_year, genre, folder_path)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        title,
        author,
        narrator,
        description,
        year,
        genre,
        folderPath
      );
      bookId = result.lastInsertRowid;
      scanStatus.results.added++;
    }
  } catch (error) {
    console.error(`  Database error:`, error.message);
    console.error(`  Params:`, { title, author, narrator, description, year, genre });
    throw error;
  }

  // Process chapters (each file = one chapter for multi-file books)
  console.log(`  Processing ${audioFiles.length} chapters`);
  db.prepare('DELETE FROM chapters WHERE book_id = ?').run(bookId);

  let totalDuration = 0;
  let chapterStart = 0;

  for (let i = 0; i < audioFiles.length; i++) {
    const filePath = path.join(folderPath, audioFiles[i]);
    const fileMetadata = await extractMetadata(filePath);

    const chapterTitle = fileMetadata.title || extractChapterTitle(audioFiles[i], i);
    const duration = fileMetadata.duration || 0;

    try {
      db.prepare(`
        INSERT INTO chapters (book_id, title, start_seconds, duration_seconds, file_path, order_index)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(bookId, chapterTitle, chapterStart, duration, filePath, i);
    } catch (error) {
      console.error(`  Chapter ${i} error:`, error.message);
      console.error(`  Chapter params:`, { bookId, chapterTitle, chapterStart, duration, filePath, i });
      throw error;
    }

    chapterStart += duration;
    totalDuration += duration;
  }

  // Update book duration
  db.prepare('UPDATE books SET duration_seconds = ? WHERE id = ?').run(totalDuration, bookId);

  // Extract cover art if not already present
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
  if (!book.cover_path || !fs.existsSync(book.cover_path)) {
    const coverPath = await extractCoverArt(folderPath, audioFiles[0], bookId);
    if (coverPath) {
      db.prepare('UPDATE books SET cover_path = ? WHERE id = ?').run(coverPath, bookId);
    }
  }
}

function extractChapterTitle(filename, index) {
  // Remove extension
  let name = path.basename(filename, path.extname(filename));

  // Try to extract chapter number and title from common patterns
  // Pattern: "01 - Chapter Name" or "01_Chapter Name" or "Chapter 01 - Name"
  const patterns = [
    /^\d+[\s._-]+(.+)$/,           // "01 - Chapter Name"
    /^chapter\s*\d+[\s._-]*(.*)$/i, // "Chapter 01 - Name"
    /^part\s*\d+[\s._-]*(.*)$/i,    // "Part 01 - Name"
  ];

  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match && match[1]) {
      return match[1].trim() || `Chapter ${index + 1}`;
    }
  }

  // If no pattern matches, use filename or default
  return name || `Chapter ${index + 1}`;
}

function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
