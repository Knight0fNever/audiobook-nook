<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '../stores/player'
import Button from 'primevue/button'
import Slider from 'primevue/slider'
import Divider from 'primevue/divider'

const router = useRouter()
const playerStore = usePlayerStore()

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

function goBack() {
  if (playerStore.currentBook) {
    router.push(`/book/${playerStore.currentBook.id}`)
  } else {
    router.push('/')
  }
}
</script>

<template>
  <div class="player-page">
    <!-- No Book State -->
    <div v-if="!playerStore.currentBook" class="no-book">
      <i class="pi pi-headphones"></i>
      <h2>No book playing</h2>
      <p>Select a book from your library to start listening</p>
      <Button label="Browse Library" icon="pi pi-book" @click="router.push('/library')" />
    </div>

    <!-- Player Content -->
    <div v-else class="player-content">
      <!-- Header -->
      <div class="player-header">
        <Button
          icon="pi pi-arrow-left"
          text
          rounded
          @click="goBack"
        />
        <span>Now Playing</span>
        <div style="width: 40px"></div>
      </div>

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
            <span class="skip-button forward">
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

      <!-- Chapter List -->
      <div class="chapters-section">
        <h3>Chapters</h3>
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
    </div>
  </div>
</template>

<style scoped>
.player-page {
  min-height: 100%;
  background: var(--surface-ground);
}

.no-book {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  text-align: center;
}

.no-book i {
  font-size: 5rem;
  color: var(--text-color-secondary);
  margin-bottom: 1rem;
}

.no-book h2 {
  margin: 0 0 0.5rem;
}

.no-book p {
  color: var(--text-color-secondary);
  margin-bottom: 1.5rem;
}

.player-content {
  max-width: 500px;
  margin: 0 auto;
  padding: 1rem;
}

.player-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  font-weight: 600;
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

.skip-button.forward i {
  transform: scaleX(-1);
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

.chapters-section h3 {
  font-size: 1rem;
  margin-bottom: 1rem;
}

.chapters-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 300px;
  overflow-y: auto;
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

@media (max-width: 480px) {
  .cover-container {
    width: 220px;
    height: 220px;
  }

  .book-title {
    font-size: 1.25rem;
  }
}
</style>
