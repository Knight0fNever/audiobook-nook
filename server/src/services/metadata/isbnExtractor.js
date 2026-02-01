import isbn3 from 'isbn3';

/**
 * ISBN Extraction Service
 * Extracts and validates ISBNs from filenames, folder names, and audio metadata
 */

// Common ISBN patterns in filenames and folders
const ISBN_PATTERNS = [
  /\[ISBN[:\s-]*(\d{9,13}[0-9Xx])\]/i,           // [ISBN-1234567890] or [ISBN: 1234567890]
  /\(ISBN[:\s-]*(\d{9,13}[0-9Xx])\)/i,           // (ISBN 1234567890)
  /ISBN[:\s-]+(\d{9,13}[0-9Xx])/i,               // ISBN: 1234567890 or ISBN 1234567890
  /\b(978\d{10}|979\d{10})\b/,                   // 13-digit ISBN starting with 978 or 979
  /\b(\d{9}[0-9Xx])\b/,                          // 10-digit ISBN (last char can be X)
];

/**
 * Extract ISBN from a string (filename or folder name)
 * @param {string} text - Text to search for ISBN
 * @returns {string|null} - Validated ISBN-13 or null
 */
export function extractISBNFromText(text) {
  if (!text) return null;

  for (const pattern of ISBN_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const possibleISBN = match[1] || match[0];
      const cleanedISBN = cleanISBN(possibleISBN);

      if (validateISBN(cleanedISBN)) {
        return normalizeToISBN13(cleanedISBN);
      }
    }
  }

  return null;
}

/**
 * Extract ISBN from audio file metadata
 * @param {Object} metadata - Metadata object from music-metadata
 * @returns {string|null} - Validated ISBN-13 or null
 */
export function extractISBNFromMetadata(metadata) {
  if (!metadata || !metadata.common) return null;

  // Check common fields where ISBN might be stored
  const fields = [
    metadata.common.comment,
    metadata.common.description,
    metadata.common.isbn,
    metadata.common.label,
  ];

  for (const field of fields) {
    if (!field) continue;

    const text = Array.isArray(field) ? field.join(' ') : String(field);
    const isbn = extractISBNFromText(text);
    if (isbn) return isbn;
  }

  return null;
}

/**
 * Extract ISBN from folder path, filename, or metadata
 * @param {string} folderPath - Book folder path
 * @param {string} filename - Audio filename
 * @param {Object} audioMetadata - Audio file metadata
 * @returns {string|null} - Validated ISBN-13 or null
 */
export function extractISBN(folderPath, filename, audioMetadata) {
  // Try folder path first (most reliable)
  const folderISBN = extractISBNFromText(folderPath);
  if (folderISBN) return folderISBN;

  // Try filename
  const filenameISBN = extractISBNFromText(filename);
  if (filenameISBN) return filenameISBN;

  // Try audio metadata
  const metadataISBN = extractISBNFromMetadata(audioMetadata);
  if (metadataISBN) return metadataISBN;

  return null;
}

/**
 * Clean ISBN by removing hyphens, spaces, and other formatting
 * @param {string} isbn - ISBN string
 * @returns {string} - Cleaned ISBN
 */
function cleanISBN(isbn) {
  if (!isbn) return '';
  return isbn.replace(/[-\s]/g, '').trim();
}

/**
 * Validate ISBN using checksum
 * @param {string} isbn - ISBN to validate
 * @returns {boolean} - True if valid
 */
function validateISBN(isbn) {
  if (!isbn) return false;

  try {
    // isbn3 library validates both ISBN-10 and ISBN-13
    const parsed = isbn3.parse(isbn);
    return parsed !== null && parsed.isValid;
  } catch (error) {
    return false;
  }
}

/**
 * Normalize ISBN to ISBN-13 format
 * @param {string} isbn - ISBN-10 or ISBN-13
 * @returns {string} - ISBN-13
 */
function normalizeToISBN13(isbn) {
  if (!isbn) return null;

  try {
    const parsed = isbn3.parse(isbn);
    if (!parsed || !parsed.isValid) return null;

    // Return ISBN-13 format (isbn3 provides isbn13 property)
    return parsed.isbn13 || parsed.isbn || isbn;
  } catch (error) {
    return null;
  }
}
