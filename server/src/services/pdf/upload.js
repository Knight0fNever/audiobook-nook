import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from '../../config/index.js';

// Ensure PDFs directory exists
if (!fs.existsSync(config.pdfs.path)) {
  fs.mkdirSync(config.pdfs.path, { recursive: true });
}

// Configure storage - files stored as {bookId}/{userId}.pdf
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const bookDir = path.join(config.pdfs.path, req.params.bookId);
    if (!fs.existsSync(bookDir)) {
      fs.mkdirSync(bookDir, { recursive: true });
    }
    cb(null, bookDir);
  },
  filename: (req, file, cb) => {
    // Store as userId.pdf to enforce one PDF per user per book
    cb(null, `${req.user.id}.pdf`);
  }
});

// File filter - only accept PDFs
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
};

// Create multer instance
export const uploadPdf = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.pdfs.maxFileSize
  }
});

// Helper to get PDF file path
export function getPdfPath(bookId, userId) {
  return path.join(config.pdfs.path, String(bookId), `${userId}.pdf`);
}

// Helper to check if PDF exists
export function pdfExists(bookId, userId) {
  const filePath = getPdfPath(bookId, userId);
  return fs.existsSync(filePath);
}

// Helper to delete PDF file
export function deletePdfFile(bookId, userId) {
  const filePath = getPdfPath(bookId, userId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}
