# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Audioshelf is a self-hosted audiobook management and listening web application. It provides a shared library for multiple users with individual progress tracking.

## Commands

### Development
```bash
npm run install:all     # Install all dependencies (root, server, client)
npm run dev             # Start both server and client in development mode
npm run dev:server      # Start only the backend server (port 3000)
npm run dev:client      # Start only the Vue frontend (port 5173)
```

### Production
```bash
npm run build           # Build the Vue frontend
npm start               # Start the production server
```

### Server-specific (from /server directory)
```bash
npm run migrate         # Run database migrations
```

## Architecture

### Monorepo Structure
- `/client` - Vue.js 3 frontend with PrimeVue v4 components
- `/server` - Node.js/Express.js backend with SQLite database

### Backend (ES Modules)

**Entry Point:** `server/src/index.js` - Express app setup, route mounting, database initialization

**Database:** SQLite via `better-sqlite3` (synchronous API)
- Schema defined in `server/src/database/init.js`
- Access via `getDb()` singleton
- Tables: users, books, chapters, series, user_progress, user_stats, settings

**API Routes** (`server/src/routes/`):
- `auth.js` - JWT authentication (login, logout, password change)
- `books.js` - Book listing, details, chapters, audio streaming
- `progress.js` - Per-user playback progress tracking
- `series.js` - Series CRUD
- `admin.js` - User management, library scanning, settings (admin-only)
- `stats.js` - User statistics

**Key Services** (`server/src/services/`):
- `scanner/index.js` - Library folder scanning, detects `Author/BookTitle` structure
- `metadata/index.js` - Audio metadata extraction via `music-metadata` package
- `metadata/apiEnrichment.js` - Open Library & Google Books API integration for metadata
- `metadata/isbnExtractor.js` - ISBN extraction from filenames/folders/metadata
- `metadata/apiCache.js` - Dual-layer caching (in-memory + SQLite) for API responses

**Auth:** JWT tokens with Bearer header; also accepts `?token=` query param for audio streaming

### API Metadata Enrichment
- Automatic enrichment during library scans (when enabled in settings)
- Manual enrichment via Admin → Book Detail → "Enrich Metadata" button
- Batch enrichment via Admin → Library Management → "Enrich All Books"
- ISBN extraction from folder patterns: `Author/Book [ISBN-9780123456789]/file.mp3`
- API priority: Open Library (primary) → Google Books (fallback)
- 30-day response caching to minimize API calls
- New book fields: `isbn`, `publisher`, `api_description`, `api_cover_url`, `metadata_source`

### Frontend (Vue 3 Composition API)

**State Management:** Pinia stores in `client/src/stores/`
- `auth.js` - User authentication state
- `player.js` - Audio playback state, chapter navigation, progress sync
- `library.js` - Book listing with filters/pagination

**Routing:** Vue Router in `client/src/router/index.js`
- Auth guards check `requiresAuth` and `requiresAdmin` meta fields

**API Layer:** `client/src/services/api.js` - Centralized API client with token management

**UI Components:** PrimeVue v4 with Aura theme, PrimeFlex for layout

### Audio Playback Flow
1. `player.js` store manages HTML5 Audio element
2. Chapters loaded via `/api/books/:id/chapters`
3. Audio streamed via `/api/books/:id/stream/:chapterIndex` with JWT in query string
4. Progress saved to server every 10 seconds and on pause

### Library Scanning
- Expects folder structure: `/{library-root}/Author Name/Book Title/*.mp3`
- Extracts metadata from first audio file, falls back to folder names
- Detects chapter titles vs book titles (ignores "Chapter 01 - ..." patterns for book title)
- Supported formats: MP3, M4A, M4B
- Optional API enrichment runs after book processing (non-blocking)

## Environment Configuration

Server config in `server/.env`:
- `LIBRARY_PATH` - Path to audiobook folder
- `JWT_SECRET` - Token signing secret
- `DATABASE_PATH` - SQLite file location (default: `./data/database.sqlite`)
- `GOOGLE_BOOKS_API_KEY` - Optional API key for higher rate limits
- `API_ENRICHMENT_TIMEOUT` - API request timeout (default: 10000ms)

## Default Credentials

Initial admin account: `admin` / `admin`

## Development Notes

### Windows-Specific Patterns
- Use `path.basename()` for extracting filenames (handles both `/` and `\` separators)
- Database paths use backslashes on Windows - normalize when constructing URLs
- Cover URLs must use forward slashes: `/covers/filename.jpg`

### Database Migrations
- Migrations in `server/src/database/init.js` via `runMigrations()`
- Version tracked with `pragma user_version`
- Migrations run automatically on server startup
- Use table introspection to avoid re-adding columns

### Testing API Changes
- Server restart required (no hot reload): `npm run dev`
- Browser hard refresh needed after API changes: `Ctrl+Shift+R` (Windows) / `Cmd+Shift+R` (Mac)
- Test endpoints: `curl http://localhost:3000/api/health`
- Authentication: Use admin/admin credentials for testing

### Static File Serving
- `/covers` route serves `server/data/covers/` directory
- API covers stored in `server/data/covers/api/` subdirectory
- Vite dev proxy configured for `/covers` and `/api` routes
