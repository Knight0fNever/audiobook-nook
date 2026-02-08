import natural from 'natural';
import { normalizeText } from './textExtractor.js';

const JaroWinklerDistance = natural.JaroWinklerDistance;

/**
 * Align PDF text with audio transcription
 * Uses fuzzy string matching to find corresponding sentences
 * @param {Object} pdfText - Extracted PDF text data
 * @param {Object} transcription - Audio transcription with timestamps
 * @returns {Object} Alignment data with timing information
 */
export async function alignTextToAudio(pdfText, transcription) {
  console.log(`[Alignment] Aligning ${pdfText.sentences.length} PDF sentences with ${transcription.sentences.length} audio sentences`);

  // Check if transcription is synthetic (placeholder)
  const isSynthetic = transcription.sentences.length > 0 &&
    transcription.sentences[0].text.includes('transcription pending');

  if (isSynthetic) {
    console.log('[Alignment] Detected synthetic transcription - using time-based alignment');
    return createTimeBasedAlignment(pdfText, transcription);
  }

  const alignedPages = [];
  let matchCount = 0;
  let totalConfidence = 0;
  let processedSentences = 0;

  // Build an index of transcription sentences for faster lookup
  const transcriptionIndex = buildTranscriptionIndex(transcription.sentences);

  // Track which transcription sentences have been matched
  const matchedTranscriptions = new Set();

  const totalSentences = pdfText.sentences.length;
  const logInterval = Math.max(1, Math.floor(totalSentences / 20)); // Log every 5%

  // Process each page
  for (const page of pdfText.pages) {
    const alignedSentences = [];

    for (const sentence of page.sentences) {
      processedSentences++;

      if (processedSentences % logInterval === 0) {
        const progress = Math.round((processedSentences / totalSentences) * 100);
        console.log(`[Alignment] Progress: ${progress}% (${processedSentences}/${totalSentences})`);
      }

      const alignment = findBestMatch(
        sentence.text,
        transcription.sentences,
        transcriptionIndex,
        matchedTranscriptions
      );

      if (alignment) {
        matchedTranscriptions.add(alignment.transcriptionIndex);
        matchCount++;
        totalConfidence += alignment.confidence;
      }

      alignedSentences.push({
        id: `p${page.pageNumber}s${sentence.index + 1}`,
        text: sentence.text,
        position: estimatePosition(sentence.index, page.sentences.length),
        audio: alignment ? {
          chapterIndex: alignment.chapterIndex,
          globalStart: alignment.globalStart,
          globalEnd: alignment.globalEnd
        } : null,
        confidence: alignment?.confidence || 0
      });
    }

    alignedPages.push({
      pageNumber: page.pageNumber,
      sentences: alignedSentences
    });
  }

  const quality = pdfText.sentences.length > 0
    ? (matchCount / pdfText.sentences.length) * 100
    : 0;

  const avgConfidence = matchCount > 0
    ? totalConfidence / matchCount
    : 0;

  console.log(`[Alignment] Matched ${matchCount}/${pdfText.sentences.length} sentences (quality: ${quality.toFixed(1)}%, avg confidence: ${avgConfidence.toFixed(2)})`);

  return {
    data: {
      pages: alignedPages,
      metadata: {
        pdfSentenceCount: pdfText.sentences.length,
        audioSentenceCount: transcription.sentences.length,
        matchedCount: matchCount,
        averageConfidence: avgConfidence
      }
    },
    quality: Math.round(quality)
  };
}

/**
 * Create time-based alignment when real transcription isn't available
 * Distributes PDF sentences evenly across the audio duration
 */
function createTimeBasedAlignment(pdfText, transcription) {
  console.log('[Alignment] Creating time-based alignment');

  const totalDuration = transcription.totalDuration || 0;
  const totalSentences = pdfText.sentences.length;
  const avgSentenceDuration = totalDuration / totalSentences;

  const alignedPages = [];
  let sentenceIndex = 0;

  for (const page of pdfText.pages) {
    const alignedSentences = [];

    for (const sentence of page.sentences) {
      const globalStart = sentenceIndex * avgSentenceDuration;
      const globalEnd = (sentenceIndex + 1) * avgSentenceDuration;

      // Find which chapter this falls in
      let chapterIndex = 0;
      let accumulatedTime = 0;
      for (const audioSentence of transcription.sentences) {
        if (audioSentence.globalStart !== undefined) {
          if (globalStart >= audioSentence.globalStart) {
            chapterIndex = audioSentence.chapterIndex || 0;
          }
        }
      }

      alignedSentences.push({
        id: `p${page.pageNumber}s${sentence.index + 1}`,
        text: sentence.text,
        position: estimatePosition(sentence.index, page.sentences.length),
        audio: {
          chapterIndex,
          globalStart,
          globalEnd
        },
        confidence: 0.3 // Low confidence for time-based alignment
      });

      sentenceIndex++;
    }

    alignedPages.push({
      pageNumber: page.pageNumber,
      sentences: alignedSentences
    });
  }

  console.log(`[Alignment] Time-based alignment complete for ${totalSentences} sentences`);

  return {
    data: {
      pages: alignedPages,
      metadata: {
        pdfSentenceCount: totalSentences,
        audioSentenceCount: transcription.sentences.length,
        matchedCount: totalSentences,
        averageConfidence: 0.3,
        alignmentType: 'time-based'
      }
    },
    quality: 30 // Low quality for time-based
  };
}

/**
 * Build an index of normalized transcription text for faster matching
 */
function buildTranscriptionIndex(sentences) {
  const index = new Map();

  sentences.forEach((sentence, idx) => {
    const normalized = normalizeText(sentence.text);
    const words = normalized.split(' ');

    // Index by first few words for quick lookup
    const key = words.slice(0, 3).join(' ');
    if (!index.has(key)) {
      index.set(key, []);
    }
    index.get(key).push(idx);
  });

  return index;
}

/**
 * Find the best matching transcription sentence for a PDF sentence
 */
function findBestMatch(pdfSentence, transcriptionSentences, index, matchedSet) {
  const normalizedPdf = normalizeText(pdfSentence);

  if (normalizedPdf.length < 3) {
    return null;
  }

  const pdfWords = normalizedPdf.split(' ');
  const searchKey = pdfWords.slice(0, 3).join(' ');

  // Get candidates from index
  let candidateIndices = index.get(searchKey) || [];

  // If no candidates from index, limit fallback to avoid O(n²)
  // Only search nearby sentences (within a reasonable window)
  if (candidateIndices.length === 0) {
    // Don't do full search - it's too slow for large documents
    // Instead, skip this sentence (will be interpolated later)
    return null;
  }

  let bestMatch = null;
  let bestScore = 0;
  const threshold = 0.7; // Minimum similarity threshold

  for (const idx of candidateIndices) {
    // Skip already matched sentences
    if (matchedSet.has(idx)) continue;

    const transcriptionSentence = transcriptionSentences[idx];
    const normalizedTranscription = normalizeText(transcriptionSentence.text);

    // Calculate similarity using Jaro-Winkler distance
    const similarity = JaroWinklerDistance(normalizedPdf, normalizedTranscription);

    if (similarity > bestScore && similarity >= threshold) {
      bestScore = similarity;
      bestMatch = {
        transcriptionIndex: idx,
        chapterIndex: transcriptionSentence.chapterIndex,
        globalStart: transcriptionSentence.globalStart,
        globalEnd: transcriptionSentence.globalEnd,
        confidence: similarity
      };
    }
  }

  return bestMatch;
}

/**
 * Estimate visual position of sentence on page
 * This is a rough estimation; accurate positions require PDF.js rendering
 */
function estimatePosition(sentenceIndex, totalSentences) {
  // Assume sentences flow top to bottom on the page
  const pageHeight = 792; // Standard US Letter height in points
  const marginTop = 72;
  const marginBottom = 72;
  const contentHeight = pageHeight - marginTop - marginBottom;

  const lineHeight = 14;
  const approxY = marginTop + (sentenceIndex / totalSentences) * contentHeight;

  return {
    x: 72, // Standard left margin
    y: Math.round(pageHeight - approxY), // PDF y-axis is bottom-up
    width: 468, // Approximate content width (letter - margins)
    height: lineHeight
  };
}

/**
 * Interpolate timestamps for unmatched sentences
 * Uses surrounding matched sentences to estimate timing
 */
export function interpolateTimestamps(pages) {
  const interpolated = JSON.parse(JSON.stringify(pages));

  for (const page of interpolated) {
    const matchedIndices = [];

    // Find matched sentences
    page.sentences.forEach((sentence, idx) => {
      if (sentence.audio) {
        matchedIndices.push(idx);
      }
    });

    if (matchedIndices.length < 2) continue;

    // Interpolate between matched sentences
    for (let i = 0; i < matchedIndices.length - 1; i++) {
      const startIdx = matchedIndices[i];
      const endIdx = matchedIndices[i + 1];
      const startTime = page.sentences[startIdx].audio.globalEnd;
      const endTime = page.sentences[endIdx].audio.globalStart;

      const gap = endIdx - startIdx - 1;
      if (gap === 0) continue;

      const duration = (endTime - startTime) / (gap + 1);

      for (let j = startIdx + 1; j < endIdx; j++) {
        const offset = j - startIdx;
        page.sentences[j].audio = {
          chapterIndex: page.sentences[startIdx].audio.chapterIndex,
          globalStart: startTime + (offset * duration),
          globalEnd: startTime + ((offset + 1) * duration),
          interpolated: true
        };
        page.sentences[j].confidence = 0.5; // Lower confidence for interpolated
      }
    }
  }

  return interpolated;
}
