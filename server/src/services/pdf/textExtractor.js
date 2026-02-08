import { PDFParse } from 'pdf-parse';
import fs from 'fs';
import natural from 'natural';

const tokenizer = new natural.SentenceTokenizer();

/**
 * Extract text content from a PDF file
 * @param {string} filePath - Path to the PDF file
 * @returns {Object} Extracted text data with page and sentence information
 */
export async function extractPdfText(filePath) {
  const dataBuffer = fs.readFileSync(filePath);

  // Create parser instance with data buffer
  const parser = new PDFParse({ data: dataBuffer });

  // Get all text using getText() which properly handles page objects
  const textResult = await parser.getText();

  const pageCount = textResult.total || 1;
  const pageTexts = textResult.pages.map(p => p.text || '');

  // Clean up
  parser.destroy();

  // Check if PDF has extractable text
  const allText = pageTexts.join(' ');
  const cleanText = allText.replace(/\s+/g, ' ').trim();
  const hasText = cleanText.length > 100; // Arbitrary threshold

  if (!hasText) {
    return {
      hasText: false,
      pageCount,
      pages: [],
      sentences: []
    };
  }

  // Parse text into pages and sentences
  const pages = pageTexts.map((pageText, index) => {
    const sentences = extractSentences(pageText);
    return {
      pageNumber: index + 1,
      rawText: pageText.trim(),
      sentences
    };
  });

  return {
    hasText: true,
    pageCount,
    pages,
    // Flatten all sentences for alignment
    sentences: pages.flatMap((page, pageIndex) =>
      page.sentences.map((sentence, sentenceIndex) => ({
        id: `p${pageIndex + 1}s${sentenceIndex + 1}`,
        pageNumber: pageIndex + 1,
        text: sentence.text,
        indexInPage: sentenceIndex
      }))
    )
  };
}

/**
 * Extract sentences from text with position tracking
 */
function extractSentences(text) {
  // Clean up text
  const cleanText = text
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanText) {
    return [];
  }

  // Use natural's sentence tokenizer
  const rawSentences = tokenizer.tokenize(cleanText);

  return rawSentences
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 0)
    .map((text, index) => ({
      text,
      index
    }));
}

/**
 * Normalize text for comparison (remove punctuation, lowercase)
 */
export function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
