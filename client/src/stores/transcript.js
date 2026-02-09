import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { usePlayerStore } from './player'
import api from '../services/api'

export const useTranscriptStore = defineStore('transcript', () => {
  const playerStore = usePlayerStore()

  // State
  const bookId = ref(null)
  const sentences = ref([])
  const jobStatus = ref(null)
  const jobProgress = ref(0)
  const jobError = ref(null)
  const jobStatusMessage = ref(null)
  const hasTranscription = ref(false)
  const autoScroll = ref(true)
  const loading = ref(false)

  // Computed
  const isProcessing = computed(() => {
    return jobStatus.value === 'pending' || jobStatus.value === 'transcribing'
  })

  const currentSentenceIndex = computed(() => {
    if (sentences.value.length === 0) return -1

    const position = playerStore.globalPosition
    // Binary search for the sentence containing the current position
    let low = 0
    let high = sentences.value.length - 1
    let result = -1

    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      const s = sentences.value[mid]

      if (position >= s.globalStart && position < s.globalEnd) {
        return mid
      } else if (position < s.globalStart) {
        high = mid - 1
      } else {
        result = mid
        low = mid + 1
      }
    }

    return result
  })

  const currentChapterSentences = computed(() => {
    return sentences.value.filter(
      s => s.chapterIndex === playerStore.currentChapterIndex
    )
  })

  const currentChapterSentenceIndex = computed(() => {
    if (currentChapterSentences.value.length === 0) return -1

    const position = playerStore.currentTime
    for (let i = 0; i < currentChapterSentences.value.length; i++) {
      const s = currentChapterSentences.value[i]
      if (position >= s.start && position < s.end) {
        return i
      }
    }

    // If past all sentences, return last
    if (currentChapterSentences.value.length > 0 &&
        position >= currentChapterSentences.value[currentChapterSentences.value.length - 1].start) {
      return currentChapterSentences.value.length - 1
    }

    return -1
  })

  // Actions
  async function loadTranscriptionInfo(newBookId) {
    bookId.value = newBookId
    loading.value = true

    try {
      const info = await api.getTranscriptionInfo(newBookId)
      jobStatus.value = info.status
      jobProgress.value = info.progress
      jobError.value = info.error
      jobStatusMessage.value = info.statusMessage
      hasTranscription.value = info.hasTranscription
    } catch (err) {
      console.error('Failed to load transcription info:', err)
    } finally {
      loading.value = false
    }
  }

  async function loadTranscriptionData(newBookId) {
    if (newBookId) bookId.value = newBookId
    loading.value = true

    try {
      const data = await api.getTranscriptionData(bookId.value)
      sentences.value = data.sentences || []
    } catch (err) {
      console.error('Failed to load transcription data:', err)
      sentences.value = []
    } finally {
      loading.value = false
    }
  }

  async function startTranscription(targetBookId) {
    bookId.value = targetBookId

    try {
      const result = await api.startTranscription(targetBookId)
      jobStatus.value = result.status
      jobProgress.value = 0
    } catch (err) {
      console.error('Failed to start transcription:', err)
      throw err
    }
  }

  async function cancelTranscription() {
    if (!bookId.value) return

    try {
      await api.cancelTranscription(bookId.value)
      jobStatus.value = 'cancelled'
    } catch (err) {
      console.error('Failed to cancel transcription:', err)
      throw err
    }
  }

  async function deleteTranscription() {
    if (!bookId.value) return

    try {
      await api.deleteTranscription(bookId.value)
      sentences.value = []
      hasTranscription.value = false
      jobStatus.value = null
      jobProgress.value = 0
      jobError.value = null
    } catch (err) {
      console.error('Failed to delete transcription:', err)
      throw err
    }
  }

  async function refreshStatus() {
    if (!bookId.value) return

    try {
      const info = await api.getTranscriptionInfo(bookId.value)
      jobStatus.value = info.status
      jobProgress.value = info.progress
      jobError.value = info.error
      jobStatusMessage.value = info.statusMessage
      hasTranscription.value = info.hasTranscription
    } catch (err) {
      console.error('Failed to refresh transcription status:', err)
    }
  }

  function seekToSentence(sentence) {
    if (!sentence) return

    const globalStart = sentence.globalStart
    let accumulatedTime = 0

    for (let i = 0; i < playerStore.chapters.length; i++) {
      const chapterDuration = playerStore.chapters[i].duration_seconds || 0

      if (accumulatedTime + chapterDuration > globalStart) {
        const chapterTime = globalStart - accumulatedTime

        if (i !== playerStore.currentChapterIndex) {
          playerStore.goToChapter(i)
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

  function reset() {
    bookId.value = null
    sentences.value = []
    jobStatus.value = null
    jobProgress.value = 0
    jobError.value = null
    jobStatusMessage.value = null
    hasTranscription.value = false
    autoScroll.value = true
    loading.value = false
  }

  return {
    // State
    bookId,
    sentences,
    jobStatus,
    jobProgress,
    jobError,
    jobStatusMessage,
    hasTranscription,
    autoScroll,
    loading,

    // Computed
    isProcessing,
    currentSentenceIndex,
    currentChapterSentences,
    currentChapterSentenceIndex,

    // Actions
    loadTranscriptionInfo,
    loadTranscriptionData,
    startTranscription,
    cancelTranscription,
    deleteTranscription,
    refreshStatus,
    seekToSentence,
    reset
  }
})
