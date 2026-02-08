import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  jwt: {
    secret: process.env.JWT_SECRET || 'default-dev-secret-change-in-production',
    expiresIn: '7d'
  },

  library: {
    path: process.env.LIBRARY_PATH || path.join(__dirname, '../../../audiobooks')
  },

  database: {
    path: process.env.DATABASE_PATH || path.join(__dirname, '../../data/database.sqlite')
  },

  covers: {
    path: path.join(__dirname, '../../data/covers')
  },

  pdfs: {
    path: path.join(__dirname, '../../data/pdfs'),
    maxFileSize: parseInt(process.env.PDF_MAX_FILE_SIZE || '104857600', 10), // 100MB default
    whisperModel: process.env.WHISPER_MODEL || 'base.en',
    // Windows whisper flavor: 'cpu' (default), 'blas' (OpenBLAS, faster CPU),
    // 'cublas-11.8' or 'cublas-12.4' (NVIDIA GPU, requires CUDA binaries)
    whisperFlavor: process.env.WHISPER_WIN_FLAVOR || 'cpu'
  },

  openlibrary: {
    enabled: process.env.OPENLIBRARY_ENABLED === 'true',
    baseUrl: 'https://openlibrary.org'
  },

  api: {
    googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY || '',
    enrichmentTimeout: parseInt(process.env.API_ENRICHMENT_TIMEOUT || '10000', 10),
    rateLimitDelay: parseInt(process.env.API_ENRICHMENT_RATE_LIMIT_DELAY || '600', 10)
  }
};

export default config;
