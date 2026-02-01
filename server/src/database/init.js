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
    google_books_api_key: ''
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
