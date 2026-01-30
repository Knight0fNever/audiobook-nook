# Audioshelf

A self-hosted audiobook management and listening web application with a shared library experience for multiple users.

## Features

- **Library Management**: Scan and organize audiobooks from your file system
- **Multi-User Support**: Shared library with individual progress tracking per user
- **Audio Playback**: HTML5 audio player with chapter navigation, seeking, and progress sync
- **Responsive Design**: Works on desktop and mobile devices
- **Admin Panel**: User management, library scanning, and settings configuration

## Tech Stack

- **Frontend**: Vue.js 3 + PrimeVue v4
- **Backend**: Node.js + Express.js
- **Database**: SQLite

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Installation

1. Clone the repository and install dependencies:

```bash
npm run install:all
```

2. Configure the server by copying the example environment file:

```bash
cp server/.env.example server/.env
```

3. Edit `server/.env` and set your configuration:

```env
PORT=3000
JWT_SECRET=your-secure-secret-key
LIBRARY_PATH=/path/to/your/audiobooks
```

4. Start the development servers:

```bash
npm run dev
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

### Default Login

- Username: `admin`
- Password: `admin`

**Important**: Change the admin password after first login.

## Library Structure

Audioshelf expects audiobooks to be organized in the following structure:

```
/library-root/
├── Author Name/
│   ├── Book Title/
│   │   ├── 01 - Chapter One.mp3
│   │   ├── 02 - Chapter Two.mp3
│   │   └── cover.jpg (optional)
│   └── Another Book/
│       └── audiobook.m4b
└── Another Author/
    └── Book Title/
        └── ...
```

### Supported Audio Formats

- MP3
- M4A
- M4B (with chapter support)

## Building for Production

1. Build the frontend:

```bash
npm run build
```

2. Start the production server:

```bash
npm start
```

## API Documentation

### Authentication

All API endpoints (except `/api/auth/login`) require a Bearer token in the Authorization header:

```
Authorization: Bearer <token>
```

### Endpoints

#### Auth
- `POST /api/auth/login` - Login with username/password
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

#### Books
- `GET /api/books` - List books (supports search, filter, pagination)
- `GET /api/books/:id` - Get book details
- `PUT /api/books/:id` - Update book (admin only)
- `GET /api/books/:id/chapters` - List chapters
- `GET /api/books/:id/stream/:chapterIndex` - Stream audio

#### Progress
- `GET /api/progress` - Get progress for all books
- `GET /api/progress/recent` - Get recently played books
- `GET /api/progress/:bookId` - Get progress for specific book
- `PUT /api/progress/:bookId` - Update progress

#### Series
- `GET /api/series` - List all series
- `GET /api/series/:id` - Get series with books

#### Admin
- `GET /api/admin/users` - List users
- `POST /api/admin/users` - Create user
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user
- `POST /api/admin/library/scan` - Trigger library scan
- `GET /api/admin/library/status` - Get scan status

#### Stats
- `GET /api/stats` - Get user statistics

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment (development/production) | development |
| `JWT_SECRET` | Secret key for JWT tokens | (required) |
| `LIBRARY_PATH` | Path to audiobook library | ./audiobooks |
| `DATABASE_PATH` | Path to SQLite database | ./data/database.sqlite |
| `OPENLIBRARY_ENABLED` | Enable OpenLibrary metadata | false |

## License

MIT
