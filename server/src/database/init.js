import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';

let db = null;

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

function runMigrations(database) {
  // Get current schema version
  const userVersion = database.pragma('user_version', { simple: true });

  console.log(`Current database version: ${userVersion}`);

  // Migration 1: Add API metadata fields
  if (userVersion < 1) {
    console.log('Running migration 1: Adding API metadata fields...');

    try {
      // Check if columns already exist to avoid errors
      const tableInfo = database.pragma('table_info(books)');
      const columnNames = tableInfo.map(col => col.name);

      if (!columnNames.includes('isbn')) {
        database.exec(`
          ALTER TABLE books ADD COLUMN isbn TEXT;
          ALTER TABLE books ADD COLUMN publisher TEXT;
          ALTER TABLE books ADD COLUMN api_description TEXT;
          ALTER TABLE books ADD COLUMN api_cover_url TEXT;
          ALTER TABLE books ADD COLUMN metadata_source TEXT;
          ALTER TABLE books ADD COLUMN metadata_enriched_at DATETIME;
        `);
        console.log('Added API metadata columns to books table');
      } else {
        console.log('API metadata columns already exist');
      }

      database.pragma('user_version = 1');
      console.log('Migration 1 complete');
    } catch (error) {
      console.error('Migration 1 failed:', error.message);
    }
  }

  // Migration 2: Add PDF follow-along tables
  if (userVersion < 2) {
    console.log('Running migration 2: Adding PDF follow-along tables...');

    try {
      database.exec(`
        -- PDF Documents table
        CREATE TABLE IF NOT EXISTS pdf_documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          filename TEXT NOT NULL,
          file_path TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          page_count INTEGER,
          is_scanned BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(book_id, user_id)
        );

        -- PDF Processing Jobs table
        CREATE TABLE IF NOT EXISTS pdf_jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pdf_id INTEGER NOT NULL REFERENCES pdf_documents(id) ON DELETE CASCADE,
          status TEXT DEFAULT 'pending' CHECK(status IN ('pending','transcribing','extracting','aligning','completed','failed')),
          progress INTEGER DEFAULT 0,
          error_message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Audio Transcriptions cache (per book, reusable across users)
        CREATE TABLE IF NOT EXISTS audio_transcriptions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
          chapter_index INTEGER NOT NULL,
          sentence_timestamps JSON NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(book_id, chapter_index)
        );

        -- PDF Alignment Data
        CREATE TABLE IF NOT EXISTS pdf_alignment (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pdf_id INTEGER NOT NULL REFERENCES pdf_documents(id) ON DELETE CASCADE,
          alignment_data JSON NOT NULL,
          quality REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Indexes for PDF tables
        CREATE INDEX IF NOT EXISTS idx_pdf_documents_book ON pdf_documents(book_id);
        CREATE INDEX IF NOT EXISTS idx_pdf_documents_user ON pdf_documents(user_id);
        CREATE INDEX IF NOT EXISTS idx_pdf_jobs_pdf ON pdf_jobs(pdf_id);
        CREATE INDEX IF NOT EXISTS idx_pdf_jobs_status ON pdf_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_book ON audio_transcriptions(book_id);
        CREATE INDEX IF NOT EXISTS idx_pdf_alignment_pdf ON pdf_alignment(pdf_id);
      `);

      database.pragma('user_version = 2');
      console.log('Migration 2 complete: PDF follow-along tables created');
    } catch (error) {
      console.error('Migration 2 failed:', error.message);
    }
  }

  // Migration 3: Replace PDF tables with transcription_jobs
  if (userVersion < 3) {
    console.log('Running migration 3: Replacing PDF tables with transcription jobs...');

    try {
      database.exec(`
        DROP TABLE IF EXISTS pdf_alignment;
        DROP TABLE IF EXISTS pdf_jobs;
        DROP TABLE IF EXISTS pdf_documents;

        CREATE TABLE IF NOT EXISTS transcription_jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
          status TEXT DEFAULT 'pending' CHECK(status IN ('pending','transcribing','completed','failed','cancelled')),
          progress INTEGER DEFAULT 0,
          error_message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(book_id)
        );

        CREATE INDEX IF NOT EXISTS idx_transcription_jobs_book ON transcription_jobs(book_id);
        CREATE INDEX IF NOT EXISTS idx_transcription_jobs_status ON transcription_jobs(status);
      `);

      database.pragma('user_version = 3');
      console.log('Migration 3 complete: PDF tables removed, transcription_jobs created');
    } catch (error) {
      console.error('Migration 3 failed:', error.message);
    }
  }

  // Migration 4: Add status_message to transcription_jobs
  if (userVersion < 4) {
    console.log('Running migration 4: Adding status_message to transcription_jobs...');

    try {
      const tableInfo = database.pragma('table_info(transcription_jobs)');
      const columnNames = tableInfo.map(col => col.name);

      if (!columnNames.includes('status_message')) {
        database.exec(`ALTER TABLE transcription_jobs ADD COLUMN status_message TEXT`);
      }

      database.pragma('user_version = 4');
      console.log('Migration 4 complete: status_message column added');
    } catch (error) {
      console.error('Migration 4 failed:', error.message);
    }
  }
}

export async function initializeDatabase() {
  // Ensure data directory exists
  const dataDir = path.dirname(config.database.path);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Ensure covers directory exists
  if (!fs.existsSync(config.covers.path)) {
    fs.mkdirSync(config.covers.path, { recursive: true });
  }

  db = new Database(config.database.path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migrations first
  runMigrations(db);

  // Create tables
  db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Series table
    CREATE TABLE IF NOT EXISTS series (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Books table
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT,
      narrator TEXT,
      description TEXT,
      duration_seconds INTEGER DEFAULT 0,
      publication_year INTEGER,
      genre TEXT,
      series_id INTEGER REFERENCES series(id) ON DELETE SET NULL,
      series_order REAL,
      cover_path TEXT,
      folder_path TEXT UNIQUE NOT NULL,
      isbn TEXT,
      publisher TEXT,
      api_description TEXT,
      api_cover_url TEXT,
      metadata_source TEXT,
      metadata_enriched_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Chapters table
    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      title TEXT,
      start_seconds REAL DEFAULT 0,
      duration_seconds REAL DEFAULT 0,
      file_path TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      UNIQUE(book_id, order_index)
    );

    -- User Progress table
    CREATE TABLE IF NOT EXISTS user_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      current_chapter INTEGER DEFAULT 0,
      position_seconds REAL DEFAULT 0,
      completed INTEGER DEFAULT 0,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, book_id)
    );

    -- User Statistics table
    CREATE TABLE IF NOT EXISTS user_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      total_listening_seconds INTEGER DEFAULT 0,
      books_completed INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Library Settings table
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- API Metadata Cache table
    CREATE TABLE IF NOT EXISTS api_metadata_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cache_key TEXT UNIQUE NOT NULL,
      response_data TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);
    CREATE INDEX IF NOT EXISTS idx_books_series ON books(series_id);
    CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn);
    CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id);
    CREATE INDEX IF NOT EXISTS idx_progress_user ON user_progress(user_id);
    CREATE INDEX IF NOT EXISTS idx_progress_book ON user_progress(book_id);
    CREATE INDEX IF NOT EXISTS idx_cache_key ON api_metadata_cache(cache_key);
    CREATE INDEX IF NOT EXISTS idx_cache_expires ON api_metadata_cache(expires_at);
  `);

  // Create default admin user if no users exist
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const passwordHash = await bcrypt.hash('admin', 10);
    db.prepare(`
      INSERT INTO users (username, password_hash, role)
      VALUES (?, ?, 'admin')
    `).run('admin', passwordHash);
    console.log('Created default admin user (username: admin, password: admin)');
  }

  // Initialize default settings
  const defaultSettings = {
    library_path: config.library.path,
    scan_schedule: '',
    openlibrary_enabled: 'false',
    api_enrichment_enabled: 'true',
    api_enrichment_prefer_api_covers: 'true',
    api_enrichment_rate_limit_delay: '600',
    google_books_api_key: '',
    transcription_backend: 'auto',
    transcription_model: 'base.en',
    transcription_language: 'en'
  };

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
  `);

  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, value);
  }

  return db;
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}
