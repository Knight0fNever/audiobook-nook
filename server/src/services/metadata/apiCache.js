import { getDb } from '../../database/init.js';
import crypto from 'crypto';

/**
 * API Metadata Cache Service
 * Provides in-memory and SQLite persistence for API responses
 */

// In-memory cache for current session
const memoryCache = new Map();

// Default TTL: 30 days
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Generate cache key from ISBN or title+author
 * @param {string} isbn - ISBN or null
 * @param {string} title - Book title
 * @param {string} author - Book author
 * @returns {string} - Cache key
 */
function generateCacheKey(isbn, title, author) {
  if (isbn) {
    return `isbn:${isbn}`;
  }

  // Create hash from title+author for search-based lookups
  const searchString = `${title}|${author}`.toLowerCase();
  const hash = crypto.createHash('md5').update(searchString).digest('hex');
  return `search:${hash}`;
}

/**
 * Get cached API response
 * @param {string} isbn - ISBN or null
 * @param {string} title - Book title
 * @param {string} author - Book author
 * @returns {Object|null} - Cached response or null
 */
export function getCachedResponse(isbn, title, author) {
  const cacheKey = generateCacheKey(isbn, title, author);

  // Check in-memory cache first
  if (memoryCache.has(cacheKey)) {
    const cached = memoryCache.get(cacheKey);
    if (new Date(cached.expiresAt) > new Date()) {
      return cached.data;
    } else {
      memoryCache.delete(cacheKey);
    }
  }

  // Check SQLite cache
  try {
    const db = getDb();
    const cached = db.prepare(`
      SELECT response_data, source, expires_at
      FROM api_metadata_cache
      WHERE cache_key = ? AND expires_at > datetime('now')
    `).get(cacheKey);

    if (cached) {
      const data = JSON.parse(cached.response_data);

      // Populate in-memory cache
      memoryCache.set(cacheKey, {
        data,
        expiresAt: cached.expires_at
      });

      return data;
    }
  } catch (error) {
    console.error('Error reading from cache:', error.message);
  }

  return null;
}

/**
 * Store API response in cache
 * @param {string} isbn - ISBN or null
 * @param {string} title - Book title
 * @param {string} author - Book author
 * @param {Object} data - API response data
 * @param {string} source - API source (openlibrary/googlebooks)
 * @param {number} ttlMs - Time to live in milliseconds
 */
export function setCachedResponse(isbn, title, author, data, source, ttlMs = DEFAULT_TTL_MS) {
  const cacheKey = generateCacheKey(isbn, title, author);
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  // Store in memory
  memoryCache.set(cacheKey, {
    data,
    expiresAt
  });

  // Store in SQLite
  try {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO api_metadata_cache (cache_key, response_data, source, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(cacheKey, JSON.stringify(data), source, expiresAt);
  } catch (error) {
    console.error('Error writing to cache:', error.message);
  }
}

/**
 * Clear all cached responses
 */
export function clearCache() {
  // Clear in-memory cache
  memoryCache.clear();

  // Clear SQLite cache
  try {
    const db = getDb();
    db.prepare('DELETE FROM api_metadata_cache').run();
    console.log('API cache cleared');
  } catch (error) {
    console.error('Error clearing cache:', error.message);
  }
}

/**
 * Remove expired cache entries
 */
export function cleanupExpiredCache() {
  try {
    const db = getDb();
    const result = db.prepare(`
      DELETE FROM api_metadata_cache
      WHERE expires_at <= datetime('now')
    `).run();

    if (result.changes > 0) {
      console.log(`Cleaned up ${result.changes} expired cache entries`);
    }
  } catch (error) {
    console.error('Error cleaning up cache:', error.message);
  }
}

/**
 * Get cache statistics
 * @returns {Object} - Cache stats
 */
export function getCacheStats() {
  try {
    const db = getDb();
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN expires_at > datetime('now') THEN 1 ELSE 0 END) as valid,
        SUM(CASE WHEN expires_at <= datetime('now') THEN 1 ELSE 0 END) as expired
      FROM api_metadata_cache
    `).get();

    return {
      memory: memoryCache.size,
      database: stats.total || 0,
      valid: stats.valid || 0,
      expired: stats.expired || 0
    };
  } catch (error) {
    console.error('Error getting cache stats:', error.message);
    return {
      memory: memoryCache.size,
      database: 0,
      valid: 0,
      expired: 0
    };
  }
}
