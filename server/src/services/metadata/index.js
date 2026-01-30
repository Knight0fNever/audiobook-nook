import * as musicMetadata from 'music-metadata';
import fs from 'fs';
import path from 'path';
import { config } from '../../config/index.js';

export async function extractMetadata(filePath) {
  try {
    const metadata = await musicMetadata.parseFile(filePath);

    // Helper to extract string from various formats
    const extractString = (value) => {
      if (!value) return null;
      if (typeof value === 'string') return value;
      if (Array.isArray(value)) return value.join(', ');
      if (typeof value === 'object' && value.text) return value.text;
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    };

    return {
      title: extractString(metadata.common.title),
      author: extractString(metadata.common.artist || metadata.common.albumartist),
      narrator: extractString(metadata.common.composer),
      album: extractString(metadata.common.album),
      description: extractString(metadata.common.comment?.[0] || metadata.common.description?.[0]),
      year: metadata.common.year || null,
      genre: extractString(metadata.common.genre?.[0]),
      duration: metadata.format.duration || 0,
      chapters: metadata.chapters || []
    };
  } catch (error) {
    console.error(`Error extracting metadata from ${filePath}:`, error.message);
    return {
      title: null,
      author: null,
      narrator: null,
      album: null,
      description: null,
      year: null,
      genre: null,
      duration: 0,
      chapters: []
    };
  }
}

export async function extractCoverArt(bookFolder, audioFile, bookId) {
  const coversDir = config.covers.path;

  // Ensure covers directory exists
  if (!fs.existsSync(coversDir)) {
    fs.mkdirSync(coversDir, { recursive: true });
  }

  const coverFilename = `${bookId}.jpg`;
  const coverPath = path.join(coversDir, coverFilename);

  // Check for existing cover file in book folder
  const existingCoverNames = ['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png', 'album.jpg', 'album.png'];
  for (const coverName of existingCoverNames) {
    const existingCover = path.join(bookFolder, coverName);
    if (fs.existsSync(existingCover)) {
      // Copy to covers directory
      fs.copyFileSync(existingCover, coverPath);
      console.log(`Copied existing cover for book ${bookId}`);
      return coverPath;
    }
  }

  // Try to extract embedded cover art from audio file
  try {
    const audioFilePath = path.join(bookFolder, audioFile);
    const metadata = await musicMetadata.parseFile(audioFilePath);

    if (metadata.common.picture && metadata.common.picture.length > 0) {
      const picture = metadata.common.picture[0];
      fs.writeFileSync(coverPath, picture.data);
      console.log(`Extracted embedded cover for book ${bookId}`);
      return coverPath;
    }
  } catch (error) {
    console.error(`Error extracting cover from audio file:`, error.message);
  }

  // No cover found
  return null;
}

export async function getEmbeddedChapters(filePath) {
  try {
    const metadata = await musicMetadata.parseFile(filePath);

    if (metadata.chapters && metadata.chapters.length > 0) {
      return metadata.chapters.map((chapter, index) => ({
        title: chapter.tags?.title || `Chapter ${index + 1}`,
        startTime: chapter.startTime || 0,
        endTime: chapter.endTime || null
      }));
    }

    return [];
  } catch (error) {
    console.error(`Error extracting chapters from ${filePath}:`, error.message);
    return [];
  }
}
