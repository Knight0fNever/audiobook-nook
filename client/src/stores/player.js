import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import api from '../services/api'

export const usePlayerStore = defineStore('player', () => {
  // State
  const currentBook = ref(null)
  const chapters = ref([])
  const currentChapterIndex = ref(0)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const volume = ref(1)
  const isLoading = ref(false)

  // Audio element
  let audio = null

  // Computed
  const currentChapter = computed(() => chapters.value[currentChapterIndex.value] || null)

  const totalDuration = computed(() => {
    return chapters.value.reduce((sum, ch) => sum + (ch.duration_seconds || 0), 0)
  })

  const globalPosition = computed(() => {
    let position = 0
    for (let i = 0; i < currentChapterIndex.value; i++) {
      position += chapters.value[i]?.duration_seconds || 0
    }
    return position + currentTime.value
  })

  const progressPercentage = computed(() => {
    if (totalDuration.value === 0) return 0
    return (globalPosition.value / totalDuration.value) * 100
  })

  const formattedCurrentTime = computed(() => formatTime(currentTime.value))
  const formattedDuration = computed(() => formatTime(duration.value))
  const formattedGlobalPosition = computed(() => formatTime(globalPosition.value))
  const formattedTotalDuration = computed(() => formatTime(totalDuration.value))

  // Progress save interval
  let saveProgressInterval = null

  // Methods
  function initAudio() {
    if (audio) return

    audio = new Audio()
    audio.volume = volume.value

    audio.addEventListener('timeupdate', () => {
      currentTime.value = audio.currentTime
    })

    audio.addEventListener('durationchange', () => {
      duration.value = audio.duration || 0
    })

    audio.addEventListener('ended', () => {
      handleChapterEnd()
    })

    audio.addEventListener('loadeddata', () => {
      isLoading.value = false
    })

    audio.addEventListener('waiting', () => {
      isLoading.value = true
    })

    audio.addEventListener('canplay', () => {
      isLoading.value = false
    })

    audio.addEventListener('error', (e) => {
      console.error('Audio error:', e)
      isLoading.value = false
    })
  }

  async function loadBook(book) {
    initAudio()
    currentBook.value = book
    currentChapterIndex.value = 0
    currentTime.value = 0

    // Load chapters
    chapters.value = await api.getBookChapters(book.id)

    // Load saved progress
    const progress = await api.getBookProgress(book.id)
    if (progress && progress.position_seconds > 0) {
      // Find the correct chapter based on global position
      let accumulatedTime = 0
      for (let i = 0; i < chapters.value.length; i++) {
        const chapterDuration = chapters.value[i].duration_seconds || 0
        if (accumulatedTime + chapterDuration > progress.position_seconds) {
          currentChapterIndex.value = i
          currentTime.value = progress.position_seconds - accumulatedTime
          break
        }
        accumulatedTime += chapterDuration
      }
    }

    await loadChapter(currentChapterIndex.value)
    startProgressSaving()
  }

  async function loadChapter(index) {
    if (!currentBook.value || index < 0 || index >= chapters.value.length) return

    isLoading.value = true
    currentChapterIndex.value = index

    const streamUrl = api.getStreamUrl(currentBook.value.id, index)
    const token = localStorage.getItem('token')

    // Add auth token to audio source
    audio.src = `${streamUrl}?token=${token}`

    if (currentTime.value > 0 && currentChapterIndex.value === index) {
      audio.currentTime = currentTime.value
    } else {
      currentTime.value = 0
    }
  }

  function handleChapterEnd() {
    if (currentChapterIndex.value < chapters.value.length - 1) {
      // Go to next chapter
      nextChapter()
    } else {
      // Book finished
      isPlaying.value = false
      saveProgress(true)
    }
  }

  async function play() {
    if (!audio || !currentBook.value) return

    try {
      await audio.play()
      isPlaying.value = true
    } catch (error) {
      console.error('Play error:', error)
    }
  }

  function pause() {
    if (!audio) return
    audio.pause()
    isPlaying.value = false
    saveProgress()
  }

  function togglePlay() {
    if (isPlaying.value) {
      pause()
    } else {
      play()
    }
  }

  function seek(time) {
    if (!audio) return
    audio.currentTime = Math.max(0, Math.min(time, duration.value))
    currentTime.value = audio.currentTime
  }

  function seekRelative(seconds) {
    seek(currentTime.value + seconds)
  }

  async function nextChapter() {
    if (currentChapterIndex.value < chapters.value.length - 1) {
      currentTime.value = 0
      await loadChapter(currentChapterIndex.value + 1)
      if (isPlaying.value) {
        play()
      }
    }
  }

  async function previousChapter() {
    // If more than 3 seconds in, restart current chapter
    if (currentTime.value > 3) {
      seek(0)
    } else if (currentChapterIndex.value > 0) {
      currentTime.value = 0
      await loadChapter(currentChapterIndex.value - 1)
      if (isPlaying.value) {
        play()
      }
    }
  }

  async function goToChapter(index) {
    if (index >= 0 && index < chapters.value.length) {
      currentTime.value = 0
      await loadChapter(index)
      if (isPlaying.value) {
        play()
      }
    }
  }

  function setVolume(newVolume) {
    volume.value = Math.max(0, Math.min(1, newVolume))
    if (audio) {
      audio.volume = volume.value
    }
  }

  function stop() {
    if (audio) {
      audio.pause()
      audio.src = ''
    }
    isPlaying.value = false
    currentBook.value = null
    chapters.value = []
    currentChapterIndex.value = 0
    currentTime.value = 0
    duration.value = 0
    stopProgressSaving()
  }

  function startProgressSaving() {
    stopProgressSaving()
    saveProgressInterval = setInterval(() => {
      if (isPlaying.value) {
        saveProgress()
      }
    }, 10000) // Save every 10 seconds
  }

  function stopProgressSaving() {
    if (saveProgressInterval) {
      clearInterval(saveProgressInterval)
      saveProgressInterval = null
    }
  }

  async function saveProgress(completed = false) {
    if (!currentBook.value) return

    try {
      await api.updateProgress(currentBook.value.id, {
        position_seconds: globalPosition.value,
        current_chapter: currentChapterIndex.value,
        completed
      })
    } catch (error) {
      console.error('Failed to save progress:', error)
    }
  }

  // Watch volume changes
  watch(volume, (newVolume) => {
    if (audio) {
      audio.volume = newVolume
    }
    localStorage.setItem('player-volume', newVolume.toString())
  })

  // Load saved volume
  const savedVolume = localStorage.getItem('player-volume')
  if (savedVolume) {
    volume.value = parseFloat(savedVolume)
  }

  return {
    // State
    currentBook,
    chapters,
    currentChapterIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    isLoading,

    // Computed
    currentChapter,
    totalDuration,
    globalPosition,
    progressPercentage,
    formattedCurrentTime,
    formattedDuration,
    formattedGlobalPosition,
    formattedTotalDuration,

    // Methods
    loadBook,
    play,
    pause,
    togglePlay,
    seek,
    seekRelative,
    nextChapter,
    previousChapter,
    goToChapter,
    setVolume,
    stop,
    saveProgress
  }
})

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}
