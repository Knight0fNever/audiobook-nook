import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { initializeDatabase } from './database/init.js';
import { authRouter } from './routes/auth.js';
import { booksRouter } from './routes/books.js';
import { progressRouter } from './routes/progress.js';
import { seriesRouter } from './routes/series.js';
import { adminRouter } from './routes/admin.js';
import { statsRouter } from './routes/stats.js';
import { pdfRouter } from './routes/pdf.js';
import { errorHandler } from './middleware/errorHandler.js';
import { resumePendingJobs } from './services/pdf/jobQueue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? false
    : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));
app.use(express.json());

// Static files for covers
app.use('/covers', express.static(config.covers.path));

// Static files for PDFs (authenticated via route, not static)
app.use('/pdfs', express.static(config.pdfs.path));

// Serve client build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../client/dist')));
}

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/books', booksRouter);
app.use('/api/progress', progressRouter);
app.use('/api/series', seriesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/stats', statsRouter);
app.use('/api/pdf', pdfRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve client for all other routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  });
}

// Error handler
app.use(errorHandler);

// Initialize database and start server
async function start() {
  try {
    await initializeDatabase();
    console.log('Database initialized');

    // Resume any pending PDF processing jobs
    resumePendingJobs();

    app.listen(config.port, () => {
      console.log(`Audioshelf server running on port ${config.port}`);
      console.log(`Environment: ${config.nodeEnv}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
