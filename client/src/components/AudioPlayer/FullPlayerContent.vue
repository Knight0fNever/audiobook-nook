<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { usePlayerStore } from '../../stores/player'
import { useTranscriptStore } from '../../stores/transcript'
import Button from 'primevue/button'
import Slider from 'primevue/slider'
import Divider from 'primevue/divider'
import TranscriptPanel from '../TranscriptPanel.vue'

const emit = defineEmits(['collapse'])
const playerStore = usePlayerStore()
const transcriptStore = useTranscriptStore()

const activeTab = ref('chapters')

const progressValue = computed({
  get: () => (playerStore.currentTime / playerStore.duration) * 100 || 0,
  set: (val) => {
    playerStore.seek((val / 100) * playerStore.duration)
  }
})

const volumeIcon = computed(() => {
  if (playerStore.volume === 0) return 'pi pi-volume-off'
  if (playerStore.volume < 0.5) return 'pi pi-volume-down'
  return 'pi pi-volume-up'
})

// Load transcript data for the current book
async function loadTranscript() {
  if (!playerStore.currentBook) return
  const bookId = playerStore.currentBook.id
  if (transcriptStore.bookId !== bookId || transcriptStore.sentences.length === 0) {
    await transcriptStore.loadTranscriptionInfo(bookId)
    if (transcriptStore.hasTranscription) {
      await transcriptStore.loadTranscriptionData(bookId)
    }
  }
}

// Auto-load transcript on mount (for desktop two-column layout)
onMounted(() => {
  loadTranscript()
})

// Also load when switching to transcript tab on mobile
watch(activeTab, async (tab) => {
  if (tab === 'transcript') {
    await loadTranscript()
  }
})
</script>

<template>
  <div class="full-player-content">
    <!-- Header -->
    <div class="player-header">
      <Button
        icon="pi pi-chevron-down"
        text
        rounded
        @click="emit('collapse')"
      />
      <span>Now Playing</span>
      <div style="width: 40px"></div>
    </div>

    <!-- Two-column layout -->
    <div class="player-layout">
      <!-- Left column: Player controls -->
      <div class="player-main">
        <!-- Cover Art -->
        <div class="cover-section">
          <div class="cover-container">
            <img
              v-if="playerStore.currentBook.cover_url"
              :src="playerStore.currentBook.cover_url"
              :alt="playerStore.currentBook.title"
            />
            <div v-else class="cover-placeholder">
              <i class="pi pi-book"></i>
            </div>
          </div>
        </div>

        <!-- Book Info -->
        <div class="book-info">
          <h1 class="book-title">{{ playerStore.currentBook.title }}</h1>
          <p class="book-author">{{ playerStore.currentBook.author }}</p>
          <p class="chapter-info">
            Chapter {{ playerStore.currentChapterIndex + 1 }} of {{ playerStore.chapters.length }}
            <span v-if="playerStore.currentChapter"> - {{ playerStore.currentChapter.title }}</span>
          </p>
        </div>

        <!-- Progress -->
        <div class="progress-section">
          <Slider
            v-model="progressValue"
            :step="0.1"
            class="progress-slider"
          />
          <div class="time-display">
            <span>{{ playerStore.formattedCurrentTime }}</span>
            <span>{{ playerStore.formattedDuration }}</span>
          </div>
          <div class="global-progress">
            <span>{{ playerStore.formattedGlobalPosition }}</span>
            <span>/</span>
            <span>{{ playerStore.formattedTotalDuration }}</span>
          </div>
        </div>

        <!-- Controls -->
        <div class="controls-section">
          <Button
            icon="pi pi-step-backward"
            text
            rounded
            size="large"
            @click="playerStore.previousChapter"
            :disabled="playerStore.currentChapterIndex === 0 && playerStore.currentTime < 3"
          />

          <Button
            icon="pi pi-replay"
            text
            rounded
            @click="playerStore.seekRelative(-30)"
          >
            <template #icon>
              <span class="skip-button">
                <i class="pi pi-replay"></i>
                <span class="skip-text">30</span>
              </span>
            </template>
          </Button>

          <Button
            :icon="playerStore.isPlaying ? 'pi pi-pause' : 'pi pi-play'"
            rounded
            size="large"
            class="play-button"
            :loading="playerStore.isLoading"
            @click="playerStore.togglePlay"
          />

          <Button
            text
            rounded
            @click="playerStore.seekRelative(30)"
          >
            <template #icon>
              <span class="skip-button">
                <i class="pi pi-refresh"></i>
                <span class="skip-text">30</span>
              </span>
            </template>
          </Button>

          <Button
            icon="pi pi-step-forward"
            text
            rounded
            size="large"
            @click="playerStore.nextChapter"
            :disabled="playerStore.currentChapterIndex >= playerStore.chapters.length - 1"
          />
        </div>

        <!-- Volume -->
        <div class="volume-section">
          <Button
            :icon="volumeIcon"
            text
            rounded
            @click="playerStore.setVolume(playerStore.volume === 0 ? 1 : 0)"
          />
          <Slider
            :modelValue="playerStore.volume * 100"
            @update:modelValue="(v) => playerStore.setVolume(v / 100)"
            class="volume-slider"
          />
        </div>

        <Divider />

        <!-- Tab Toggle (mobile only) -->
        <div class="tab-toggle">
          <button
            class="tab-button"
            :class="{ active: activeTab === 'chapters' }"
            @click="activeTab = 'chapters'"
          >
            Chapters
          </button>
          <button
            class="tab-button"
            :class="{ active: activeTab === 'transcript' }"
            @click="activeTab = 'transcript'"
          >
            Transcript
          </button>
        </div>

        <!-- Chapter List (always visible on desktop, tab-toggled on mobile) -->
        <div class="chapters-section" :class="{ 'mobile-hidden': activeTab !== 'chapters' }">
          <div class="chapters-list">
            <div
              v-for="(chapter, index) in playerStore.chapters"
              :key="chapter.id"
              class="chapter-item"
              :class="{ active: playerStore.currentChapterIndex === index }"
              @click="playerStore.goToChapter(index)"
            >
              <span class="chapter-number">{{ index + 1 }}</span>
              <span class="chapter-title">{{ chapter.title }}</span>
              <i
                v-if="playerStore.currentChapterIndex === index && playerStore.isPlaying"
                class="pi pi-volume-up"
              ></i>
            </div>
          </div>
        </div>

        <!-- Transcript (mobile only, shown when transcript tab active) -->
        <div class="mobile-transcript" :class="{ 'mobile-hidden': activeTab !== 'transcript' }">
          <TranscriptPanel v-if="transcriptStore.hasTranscription || transcriptStore.sentences.length > 0" />
          <div v-else class="no-transcript">
            <i class="pi pi-align-left"></i>
            <p>No transcript available</p>
            <small>Transcribe this book from the book detail page</small>
          </div>
        </div>
      </div>

      <!-- Right column: Transcript (desktop only) -->
      <div class="player-transcript">
        <TranscriptPanel v-if="transcriptStore.hasTranscription || transcriptStore.sentences.length > 0" />
        <div v-else class="no-transcript">
          <i class="pi pi-align-left"></i>
          <p>No transcript available</p>
          <small>Transcribe this book from the book detail page</small>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.full-player-content {
  padding: 1rem;
  overflow: hidden;
  background-color: var(--app-bg);
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.player-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  font-weight: 600;
  flex-shrink: 0;
}

.player-layout {
  display: flex;
  flex-direction: row;
  gap: 1.5rem;
  flex: 1;
  min-height: 0;
}

.player-main {
  max-width: 500px;
  width: 100%;
  overflow-y: auto;
  flex-shrink: 0;
}

.player-transcript {
  flex: 1;
  min-width: 250px;
  border-left: 1px solid var(--surface-border);
  padding-left: 1.5rem;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.cover-section {
  display: flex;
  justify-content: center;
  margin-bottom: 1.5rem;
}

.cover-container {
  width: 280px;
  height: 280px;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.25);
}

.cover-container img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-container .cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--primary-400), var(--primary-600));
  color: white;
  font-size: 6rem;
}

.book-info {
  text-align: center;
  margin-bottom: 1.5rem;
}

.book-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 0 0.25rem;
}

.book-author {
  font-size: 1rem;
  color: var(--text-color-secondary);
  margin: 0 0 0.5rem;
}

.chapter-info {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  margin: 0;
}

.progress-section {
  margin-bottom: 1.5rem;
}

.progress-slider {
  width: 100%;
  margin-bottom: 0.5rem;
}

.time-display {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

.global-progress {
  display: flex;
  justify-content: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  margin-top: 0.25rem;
}

.controls-section {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.play-button {
  width: 64px;
  height: 64px;
}

.skip-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 0.65rem;
}

.skip-button i {
  font-size: 1.25rem;
}

.skip-text {
  margin-top: -2px;
}

.volume-section {
  display: flex;
  align-items: center;
  gap: 1rem;
  max-width: 200px;
  margin: 0 auto 1rem;
}

.volume-slider {
  flex: 1;
}

/* Tab toggle: hidden on desktop, visible on mobile */
.tab-toggle {
  display: none;
  gap: 0.25rem;
  margin-bottom: 1rem;
  background: var(--surface-100);
  border-radius: 8px;
  padding: 0.25rem;
}

.tab-button {
  flex: 1;
  padding: 0.5rem 1rem;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-color-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.tab-button.active {
  background: var(--surface-card);
  color: var(--text-color);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.tab-button:hover:not(.active) {
  color: var(--text-color);
}

/* Mobile transcript: hidden on desktop */
.mobile-transcript {
  display: none;
  min-height: 200px;
  max-height: 300px;
  flex-direction: column;
}

.no-transcript {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem;
  color: var(--text-color-secondary);
  text-align: center;
}

.no-transcript i {
  font-size: 2rem;
  opacity: 0.5;
}

.no-transcript p {
  margin: 0;
  font-weight: 500;
}

.chapters-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.chapter-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.chapter-item:hover {
  background: var(--surface-hover);
}

.chapter-item.active {
  background: var(--primary-100);
  color: var(--primary-700);
}

.chapter-number {
  width: 1.5rem;
  text-align: center;
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

.chapter-item.active .chapter-number {
  color: var(--primary-700);
  font-weight: 600;
}

.chapter-title {
  flex: 1;
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Mobile layout */
@media (max-width: 768px) {
  .player-layout {
    flex-direction: column;
  }

  .player-main {
    margin: 0 auto;
  }

  .player-transcript {
    display: none;
  }

  .tab-toggle {
    display: flex;
  }

  .mobile-transcript {
    display: flex;
  }

  .mobile-hidden {
    display: none !important;
  }

  .cover-container {
    width: 220px;
    height: 220px;
  }

  .book-title {
    font-size: 1.25rem;
  }
}
</style>
