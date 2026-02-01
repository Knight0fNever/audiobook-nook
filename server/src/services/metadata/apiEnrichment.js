import fs from 'fs';
import path from 'path';
import { extractISBN } from './isbnExtractor.js';
import { getCachedResponse, setCachedResponse } from './apiCache.js';
import { getDb } from '../../database/init.js';
import { config } from '../../config/index.js';

/**
 * API Metadata Enrichment Service
 * Queries Open Library and Google Books to enrich audiobook metadata
 */

const OPEN_LIBRARY_BASE = 'https://openlibrary.org';
const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1';
const REQUEST_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * Main enrichment function
 * @param {Object} book - Book record from database
 * @param {Object} metadata - Audio metadata from first file
 * @param {Object} options - Enrichment options
 * @returns {Object|null} - Enriched metadata or null
 */
export async function enrichBookMetadata(book, metadata = null, options = {}) {
  const db = getDb();

  // Check if enrichment is enabled
  const enabledSetting = db.prepare("SELECT value FROM settings WHERE key = 'api_enrichment_enabled'").get();
  if (enabledSetting?.value !== 'true' && !options.force) {
    return null;
  }

  try {
    // Extract ISBN from folder path, filename, or metadata
    const isbn = extractISBN(book.folder_path, '', metadata);

    // Check cache first
    const cached = getCachedResponse(isbn, book.title, book.author);
    if (cached && !options.skipCache) {
      console.log(`Using cached metadata for: ${book.title}`);
      return cached;
    }

    // Get rate limit delay
    const rateLimitSetting = db.prepare("SELECT value FROM settings WHERE key = 'api_enrichment_rate_limit_delay'").get();
    const rateLimitDelay = parseInt(rateLimitSetting?.value || '600', 10);

    // Apply rate limiting
    if (rateLimitDelay > 0) {
      await sleep(rateLimitDelay);
    }

    let apiData = null;

    // Try Open Library first
    if (isbn) {
      apiData = await queryOpenLibraryByISBN(isbn);
    }

    // Fallback to Open Library search
    if (!apiData && book.title && book.author) {
      apiData = await queryOpenLibraryBySearch(book.title, book.author);
    }

    // Fallback to Google Books
    if (!apiData) {
      apiData = await queryGoogleBooks(isbn, book.title, book.author);
    }

    if (apiData) {
      // Cache the result
      setCachedResponse(isbn, book.title, book.author, apiData, apiData.source);
      return apiData;
    }

    return null;
  } catch (error) {
    console.error(`Error enriching metadata for ${book.title}:`, error.message);
    return null;
  }
}

/**
 * Query Open Library by ISBN
 * @param {string} isbn - ISBN-13 or ISBN-10
 * @returns {Object|null} - Metadata or null
 */
async function queryOpenLibraryByISBN(isbn) {
  try {
    const url = `${OPEN_LIBRARY_BASE}/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
    const response = await fetchWithRetry(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const bookKey = `ISBN:${isbn}`;

    if (data[bookKey]) {
      const bookData = data[bookKey];

      // If we have a work key, fetch the full work details for description
      if (bookData.works && bookData.works.length > 0) {
        const workKey = bookData.works[0].key; // e.g., "/works/OL45804W"
        const workDetails = await fetchOpenLibraryWork(workKey);

        if (workDetails) {
          // Merge work details with book data
          return parseOpenLibraryData(bookData, isbn, workDetails);
        }
      }

      return parseOpenLibraryData(bookData, isbn);
    }

    return null;
  } catch (error) {
    console.error('Open Library ISBN query error:', error.message);
    return null;
  }
}

/**
 * Fetch Open Library work details
 * @param {string} workKey - Work key (e.g., "/works/OL45804W")
 * @returns {Object|null} - Work details or null
 */
async function fetchOpenLibraryWork(workKey) {
  try {
    const url = `${OPEN_LIBRARY_BASE}${workKey}.json`;
    const response = await fetchWithRetry(url);

    if (!response.ok) {
      return null;
    }

    const work = await response.json();
    return work;
  } catch (error) {
    console.error('Open Library work fetch error:', error.message);
    return null;
  }
}

/**
 * Fetch Open Library edition details
 * @param {string} editionKey - Edition key (e.g., "OL51708686M")
 * @returns {Object|null} - Edition details or null
 */
async function fetchOpenLibraryEdition(editionKey) {
  try {
    // Remove /books/ prefix if present
    const cleanKey = editionKey.replace('/books/', '');
    const url = `${OPEN_LIBRARY_BASE}/books/${cleanKey}.json`;
    const response = await fetchWithRetry(url);

    if (!response.ok) {
      return null;
    }

    const edition = await response.json();
    return edition;
  } catch (error) {
    console.error('Open Library edition fetch error:', error.message);
    return null;
  }
}

/**
 * Query Open Library by title and author search
 * @param {string} title - Book title
 * @param {string} author - Author name
 * @returns {Object|null} - Metadata or null
 */
async function queryOpenLibraryBySearch(title, author) {
  try {
    const searchParams = new URLSearchParams({
      title: title,
      author: author,
      limit: 1
    });

    const url = `${OPEN_LIBRARY_BASE}/search.json?${searchParams}`;
    const response = await fetchWithRetry(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (data.docs && data.docs.length > 0) {
      const result = data.docs[0];

      let workDetails = null;
      let editionDetails = null;

      // Fetch work details for description
      if (result.key) {
        workDetails = await fetchOpenLibraryWork(result.key);
      }

      // Fetch edition details for ISBN/publisher
      if (result.cover_edition_key) {
        editionDetails = await fetchOpenLibraryEdition(result.cover_edition_key);
      }

      return parseOpenLibrarySearchData(result, workDetails, editionDetails);
    }

    return null;
  } catch (error) {
    console.error('Open Library search error:', error.message);
    return null;
  }
}

/**
 * Query Google Books API
 * @param {string} isbn - ISBN or null
 * @param {string} title - Book title
 * @param {string} author - Author name
 * @returns {Object|null} - Metadata or null
 */
async function queryGoogleBooks(isbn, title, author) {
  try {
    const db = getDb();
    const apiKeySetting = db.prepare("SELECT value FROM settings WHERE key = 'google_books_api_key'").get();
    const apiKey = apiKeySetting?.value || '';

    let query;
    if (isbn) {
      query = `isbn:${isbn}`;
    } else if (title && author) {
      query = `intitle:${title}+inauthor:${author}`;
    } else {
      return null;
    }

    const searchParams = new URLSearchParams({ q: query });
    if (apiKey) {
      searchParams.append('key', apiKey);
    }

    const url = `${GOOGLE_BOOKS_BASE}/volumes?${searchParams}`;
    const response = await fetchWithRetry(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (data.items && data.items.length > 0) {
      return parseGoogleBooksData(data.items[0]);
    }

    return null;
  } catch (error) {
    console.error('Google Books query error:', error.message);
    return null;
  }
}

/**
 * Parse Open Library API response (books API)
 * @param {Object} data - API response
 * @param {string} isbn - ISBN
 * @param {Object} workDetails - Optional work details from Works API
 * @returns {Object} - Parsed metadata
 */
function parseOpenLibraryData(data, isbn, workDetails = null) {
  // Extract description from work details if available
  let description = null;
  if (workDetails && workDetails.description) {
    // Description can be a string or an object with a "value" property
    description = typeof workDetails.description === 'string'
      ? workDetails.description
      : workDetails.description.value;
  }

  // Fallback to book data if no work description
  if (!description) {
    description = data.notes || data.subtitle || null;
  }

  return {
    source: 'openlibrary',
    isbn: isbn || data.identifiers?.isbn_13?.[0] || data.identifiers?.isbn_10?.[0] || null,
    publisher: data.publishers?.[0]?.name || null,
    description: description,
    coverUrl: data.cover?.large || data.cover?.medium || null,
    publicationYear: data.publish_date ? extractYear(data.publish_date) : null
  };
}

/**
 * Parse Open Library search response
 * @param {Object} data - Search result
 * @param {Object} workDetails - Optional work details from Works API
 * @param {Object} editionDetails - Optional edition details for ISBN/publisher
 * @returns {Object} - Parsed metadata
 */
function parseOpenLibrarySearchData(data, workDetails = null, editionDetails = null) {
  // Try to get ISBN from multiple sources
  let isbn = null;
  if (editionDetails) {
    // Edition details have the most reliable ISBN data
    isbn = editionDetails.isbn_13?.[0] || editionDetails.isbn_10?.[0] || null;
  }
  if (!isbn) {
    isbn = data.isbn?.[0] || null;
  }

  // Try to get publisher from multiple sources
  let publisher = null;
  if (editionDetails) {
    publisher = editionDetails.publishers?.[0] || null;
  }
  if (!publisher) {
    publisher = data.publisher?.[0] || null;
  }

  // Extract description from work details if available
  let description = null;
  if (workDetails && workDetails.description) {
    // Description can be a string or an object with a "value" property
    description = typeof workDetails.description === 'string'
      ? workDetails.description
      : workDetails.description.value;
  }

  // Fallback to first sentence if no work description
  if (!description) {
    description = data.first_sentence?.[0] || null;
  }

  return {
    source: 'openlibrary',
    title: data.title || null,
    author: data.author_name?.[0] || null,
    isbn: isbn,
    publisher: publisher,
    description: description,
    coverUrl: isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg` : null,
    publicationYear: data.first_publish_year || null
  };
}

/**
 * Parse Google Books API response
 * @param {Object} item - Volume item
 * @returns {Object} - Parsed metadata
 */
function parseGoogleBooksData(item) {
  const volumeInfo = item.volumeInfo || {};
  const isbn = volumeInfo.industryIdentifiers?.find(id => id.type === 'ISBN_13')?.identifier
    || volumeInfo.industryIdentifiers?.find(id => id.type === 'ISBN_10')?.identifier
    || null;

  return {
    source: 'googlebooks',
    title: volumeInfo.title || null,
    author: volumeInfo.authors?.[0] || null,
    isbn: isbn,
    publisher: volumeInfo.publisher || null,
    description: volumeInfo.description || null,
    coverUrl: volumeInfo.imageLinks?.thumbnail || volumeInfo.imageLinks?.smallThumbnail || null,
    publicationYear: volumeInfo.publishedDate ? extractYear(volumeInfo.publishedDate) : null
  };
}

/**
 * Download cover image from URL
 * @param {string} url - Cover image URL
 * @param {number} bookId - Book ID
 * @returns {string|null} - Local file path or null
 */
export async function downloadCoverImage(url, bookId) {
  if (!url) return null;

  try {
    // Ensure API covers directory exists
    const apiCoversDir = path.join(config.covers.path, 'api');
    if (!fs.existsSync(apiCoversDir)) {
      fs.mkdirSync(apiCoversDir, { recursive: true });
    }

    const coverPath = path.join(apiCoversDir, `${bookId}.jpg`);

    // Download image
    const response = await fetchWithRetry(url);
    if (!response.ok) {
      return null;
    }

    // Validate content type
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      console.warn(`Invalid content type for cover: ${contentType}`);
      return null;
    }

    // Save image
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(coverPath, Buffer.from(buffer));

    console.log(`Downloaded API cover for book ${bookId}`);
    return coverPath;
  } catch (error) {
    console.error(`Error downloading cover from ${url}:`, error.message);
    return null;
  }
}

/**
 * Update book record with enriched metadata
 * @param {number} bookId - Book ID
 * @param {Object} apiData - Enriched metadata
 * @returns {Object} - Updated book data
 */
export async function updateBookWithEnrichedData(bookId, apiData) {
  const db = getDb();

  // Download cover if available
  let apiCoverPath = null;
  if (apiData.coverUrl) {
    const coverPath = await downloadCoverImage(apiData.coverUrl, bookId);
    if (coverPath) {
      apiCoverPath = coverPath;
    }
  }

  // Update book record (API enrichment takes precedence over existing data)
  db.prepare(`
    UPDATE books SET
      isbn = ?,
      publisher = ?,
      api_description = ?,
      api_cover_url = ?,
      metadata_source = ?,
      metadata_enriched_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    apiData.isbn,
    apiData.publisher,
    apiData.description,
    apiCoverPath,
    apiData.source,
    bookId
  );

  // Return updated book
  return db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
}

/**
 * Fetch with retry logic
 * @param {string} url - URL to fetch
 * @param {number} retries - Number of retries
 * @returns {Response} - Fetch response
 */
async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      return response;
    } catch (error) {
      if (i === retries - 1) throw error;

      // Exponential backoff
      await sleep(RETRY_DELAY * Math.pow(2, i));
    }
  }

  throw new Error('Max retries exceeded');
}

/**
 * Extract year from date string
 * @param {string} dateStr - Date string
 * @returns {number|null} - Year or null
 */
function extractYear(dateStr) {
  if (!dateStr) return null;

  const yearMatch = dateStr.match(/\d{4}/);
  return yearMatch ? parseInt(yearMatch[0], 10) : null;
}

/**
 * Sleep utility
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Query Open Library search with multiple results
 * @param {string} title - Book title
 * @param {string} author - Author name
 * @param {number} limit - Max results to return
 * @returns {Array<Object>} - Array of metadata objects
 */
async function queryOpenLibrarySearchMultiple(title, author, limit = 5) {
  try {
    const searchParams = new URLSearchParams({
      title: title,
      author: author,
      limit: limit
    });

    const url = `${OPEN_LIBRARY_BASE}/search.json?${searchParams}`;
    const response = await fetchWithRetry(url);

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    if (data.docs && data.docs.length > 0) {
      const results = [];

      // Process up to limit results
      for (const result of data.docs.slice(0, limit)) {
        let workDetails = null;
        let editionDetails = null;

        // Fetch work details for description
        if (result.key) {
          workDetails = await fetchOpenLibraryWork(result.key);
        }

        // Fetch edition details for ISBN/publisher
        if (result.cover_edition_key) {
          editionDetails = await fetchOpenLibraryEdition(result.cover_edition_key);
        }

        const parsed = parseOpenLibrarySearchData(result, workDetails, editionDetails);
        results.push(parsed);
      }

      return results;
    }

    return [];
  } catch (error) {
    console.error('Open Library multi-search error:', error.message);
    return [];
  }
}

/**
 * Query Google Books with multiple results
 * @param {string} isbn - ISBN or null
 * @param {string} title - Book title
 * @param {string} author - Author name
 * @param {number} limit - Max results to return
 * @returns {Array<Object>} - Array of metadata objects
 */
async function queryGoogleBooksMultiple(isbn, title, author, limit = 5) {
  try {
    const db = getDb();
    const apiKeySetting = db.prepare("SELECT value FROM settings WHERE key = 'google_books_api_key'").get();
    const apiKey = apiKeySetting?.value || '';

    let query;
    if (isbn) {
      query = `isbn:${isbn}`;
    } else if (title && author) {
      query = `intitle:${title}+inauthor:${author}`;
    } else {
      return [];
    }

    const searchParams = new URLSearchParams({ q: query, maxResults: limit });
    if (apiKey) {
      searchParams.append('key', apiKey);
    }

    const url = `${GOOGLE_BOOKS_BASE}/volumes?${searchParams}`;
    const response = await fetchWithRetry(url);

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    if (data.items && data.items.length > 0) {
      return data.items.map(item => parseGoogleBooksData(item));
    }

    return [];
  } catch (error) {
    console.error('Google Books multi-query error:', error.message);
    return [];
  }
}

/**
 * Search for multiple metadata results (for user selection)
 * @param {Object} book - Book record from database
 * @param {Object} metadata - Audio metadata from first file
 * @param {Object} options - Search options
 * @returns {Object|null} - { results: [...], source: 'openlibrary'|'googlebooks' } or null
 */
export async function searchMultipleResults(book, metadata = null, options = {}) {
  const { limit = 5 } = options;

  try {
    // Extract ISBN
    const isbn = extractISBN(book.folder_path, '', metadata);

    let results = [];
    let source = null;

    // Try Open Library by ISBN first (single result)
    if (isbn) {
      const singleResult = await queryOpenLibraryByISBN(isbn);
      if (singleResult) {
        return { results: [singleResult], source: 'openlibrary' };
      }
    }

    // Try Open Library search (multiple results)
    if (book.title && book.author) {
      results = await queryOpenLibrarySearchMultiple(book.title, book.author, limit);
      if (results.length > 0) {
        source = 'openlibrary';
      }
    }

    // Fallback to Google Books (multiple results)
    if (results.length === 0) {
      results = await queryGoogleBooksMultiple(isbn, book.title, book.author, limit);
      if (results.length > 0) {
        source = 'googlebooks';
      }
    }

    if (results.length === 0) {
      return null;
    }

    return { results, source };
  } catch (error) {
    console.error(`Error searching multiple results for ${book.title}:`, error.message);
    return null;
  }
}
