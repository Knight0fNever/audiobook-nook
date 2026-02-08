import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { usePlayerStore } from './player'
import api from '../services/api'

export const usePdfFollowAlongStore = defineStore('pdfFollowAlong', () => {
  const playerStore = usePlayerStore()

  // State
  const bookId = ref(null)
  const pdfInfo = ref(null)
  const alignment = ref(null)
  const isLoading = ref(false)
  const error = ref(null)
  const currentPage = ref(1)
  const zoom = ref(1.0)
  const isFollowModeEnabled = ref(true)

  // Computed
  const hasPdf = computed(() => Boolean(pdfInfo.value?.hasPdf))

  const isProcessing = computed(() => {
    if (!pdfInfo.value?.job) return false
    return ['pending', 'transcribing', 'extracting', 'aligning'].includes(pdfInfo.value.job.status)
  })

  const isReady = computed(() => {
    return hasPdf.value && pdfInfo.value?.hasAlignment
  })

  const jobProgress = computed(() => pdfInfo.value?.job?.progress || 0)

  const jobStatus = computed(() => pdfInfo.value?.job?.status || 'unknown')

  const currentSentence = computed(() => {
    if (!alignment.value?.pages || !isFollowModeEnabled.value) return null

    const globalTime = playerStore.globalPosition

    // Find the sentence that contains the current playback time
    for (const page of alignment.value.pages) {
      for (const sentence of page.sentences) {
        if (sentence.audio &&
            globalTime >= sentence.audio.globalStart &&
            globalTime < sentence.audio.globalEnd) {
          return {
            ...sentence,
            pageNumber: page.pageNumber
          }
        }
      }
    }

    return null
  })

  const currentPageSentences = computed(() => {
    if (!alignment.value?.pages) return []

    const page = alignment.value.pages.find(p => p.pageNumber === currentPage.value)
    return page?.sentences || []
  })

  // Methods
  async function loadPdfInfo(newBookId) {
    if (bookId.value === newBookId && pdfInfo.value) {
      return pdfInfo.value
    }

    bookId.value = newBookId
    isLoading.value = true
    error.value = null

    try {
      pdfInfo.value = await api.getPdfInfo(newBookId)
      return pdfInfo.value
    } catch (err) {
      error.value = err.message
      pdfInfo.value = null
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function loadAlignment() {
    if (!bookId.value) return null

    isLoading.value = true
    error.value = null

    try {
      const result = await api.getPdfAlignment(bookId.value)
      alignment.value = result.alignment
      return alignment.value
    } catch (err) {
      error.value = err.message
      alignment.value = null
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function uploadPdf(file) {
    if (!bookId.value) throw new Error('No book selected')

    isLoading.value = true
    error.value = null

    try {
      const result = await api.uploadPdf(bookId.value, file)
      pdfInfo.value = {
        hasPdf: true,
        id: result.id,
        filename: result.filename,
        fileSize: result.fileSize,
        job: {
          status: 'pending',
          progress: 0
        },
        hasAlignment: false
      }
      return result
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function deletePdf() {
    if (!bookId.value) return

    isLoading.value = true
    error.value = null

    try {
      await api.deletePdf(bookId.value)
      pdfInfo.value = { hasPdf: false }
      alignment.value = null
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function cancelProcessing() {
    if (!bookId.value) return

    isLoading.value = true
    error.value = null

    try {
      await api.cancelPdfProcessing(bookId.value)
      // Refresh status to get updated state
      await refreshStatus()
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function refreshStatus() {
    if (!bookId.value) return

    try {
      pdfInfo.value = await api.getPdfInfo(bookId.value)

      // Auto-load alignment when ready
      if (pdfInfo.value?.hasAlignment && !alignment.value) {
        await loadAlignment()
      }
    } catch (err) {
      console.error('Failed to refresh PDF status:', err)
    }
  }

  function setPage(page) {
    currentPage.value = Math.max(1, Math.min(page, pdfInfo.value?.pageCount || 1))
  }

  function nextPage() {
    setPage(currentPage.value + 1)
  }

  function previousPage() {
    setPage(currentPage.value - 1)
  }

  function setZoom(newZoom) {
    zoom.value = Math.max(0.5, Math.min(3.0, newZoom))
  }

  function zoomIn() {
    setZoom(zoom.value + 0.25)
  }

  function zoomOut() {
    setZoom(zoom.value - 0.25)
  }

  function toggleFollowMode() {
    isFollowModeEnabled.value = !isFollowModeEnabled.value
  }

  function seekToSentence(sentence) {
    if (!sentence?.audio) return

    // Find which chapter contains this time
    const globalStart = sentence.audio.globalStart
    let accumulatedTime = 0

    for (let i = 0; i < playerStore.chapters.length; i++) {
      const chapterDuration = playerStore.chapters[i].duration_seconds || 0

      if (accumulatedTime + chapterDuration > globalStart) {
        // Found the chapter
        const chapterTime = globalStart - accumulatedTime

        // Go to this chapter and seek
        if (i !== playerStore.currentChapterIndex) {
          playerStore.goToChapter(i)
          // Wait for chapter to load, then seek
          setTimeout(() => {
            playerStore.seek(chapterTime)
          }, 500)
        } else {
          playerStore.seek(chapterTime)
        }
        break
      }

      accumulatedTime += chapterDuration
    }
  }

  // Watch for current sentence changes to auto-navigate pages
  watch(currentSentence, (newSentence) => {
    if (newSentence && isFollowModeEnabled.value && newSentence.pageNumber !== currentPage.value) {
      setPage(newSentence.pageNumber)
    }
  })

  function reset() {
    bookId.value = null
    pdfInfo.value = null
    alignment.value = null
    error.value = null
    currentPage.value = 1
    zoom.value = 1.0
    isFollowModeEnabled.value = true
  }

  return {
    // State
    bookId,
    pdfInfo,
    alignment,
    isLoading,
    error,
    currentPage,
    zoom,
    isFollowModeEnabled,

    // Computed
    hasPdf,
    isProcessing,
    isReady,
    jobProgress,
    jobStatus,
    currentSentence,
    currentPageSentences,

    // Methods
    loadPdfInfo,
    loadAlignment,
    uploadPdf,
    deletePdf,
    cancelProcessing,
    refreshStatus,
    setPage,
    nextPage,
    previousPage,
    setZoom,
    zoomIn,
    zoomOut,
    toggleFollowMode,
    seekToSentence,
    reset
  }
})
