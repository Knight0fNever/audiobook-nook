<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../services/api'
import { usePlayerStore } from '../stores/player'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'

const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()

const series = ref(null)
const loading = ref(true)

onMounted(async () => {
  try {
    series.value = await api.getSeriesDetail(route.params.id)
  } catch (error) {
    console.error('Failed to load series:', error)
  } finally {
    loading.value = false
  }
})

async function playBook(book) {
  const fullBook = await api.getBook(book.id)
  await playerStore.loadBook(fullBook)
  playerStore.play()
}

function formatDuration(seconds) {
  if (!seconds) return '--'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}
</script>

<template>
  <div class="series-detail-page container">
    <!-- Loading -->
    <div v-if="loading" class="loading-state">
      <Skeleton width="200px" height="2rem" class="mb-3" />
      <Skeleton width="100%" height="100px" v-for="i in 3" :key="i" class="mb-2" />
    </div>

    <!-- Content -->
    <div v-else-if="series">
      <div class="page-header">
        <Button
          icon="pi pi-arrow-left"
          text
          rounded
          @click="router.push('/series')"
        />
        <div>
          <h1 class="page-title">{{ series.name }}</h1>
          <p v-if="series.description" class="series-description">{{ series.description }}</p>
        </div>
      </div>

      <!-- Books List -->
      <div class="books-list">
        <div
          v-for="book in series.books"
          :key="book.id"
          class="book-item"
          @click="router.push(`/book/${book.id}`)"
        >
          <div class="book-order">
            {{ book.series_order || '-' }}
          </div>

          <div class="book-cover">
            <img
              v-if="book.cover_url"
              :src="book.cover_url"
              :alt="book.title"
            />
            <div v-else class="cover-placeholder">
              <i class="pi pi-book"></i>
            </div>
          </div>

          <div class="book-info">
            <h3 class="book-title">{{ book.title }}</h3>
            <p class="book-author">{{ book.author }}</p>
            <p class="book-duration">{{ formatDuration(book.duration_seconds) }}</p>

            <div v-if="book.progress.percentage > 0" class="book-progress">
              <ProgressBar :value="book.progress.percentage" :showValue="false" style="height: 4px" />
              <span class="progress-text">{{ Math.round(book.progress.percentage) }}%</span>
            </div>
          </div>

          <div class="book-status">
            <Tag
              v-if="book.progress.completed"
              value="Completed"
              severity="success"
            />
          </div>

          <Button
            icon="pi pi-play"
            rounded
            class="play-button"
            @click.stop="playBook(book)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.series-detail-page {
  padding: 1.5rem 1rem;
}

.page-header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 2rem;
}

.page-title {
  margin: 0;
}

.series-description {
  color: var(--text-color-secondary);
  margin: 0.5rem 0 0;
}

.books-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.book-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--surface-card);
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.2s, transform 0.2s;
}

.book-item:hover {
  background: var(--surface-hover);
  transform: translateX(4px);
}

.book-order {
  width: 2rem;
  height: 2rem;
  background: var(--primary-100);
  color: var(--primary-color);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  flex-shrink: 0;
}

.book-cover {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.book-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.book-cover .cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-200);
  color: var(--text-color-secondary);
}

.book-info {
  flex: 1;
  min-width: 0;
}

.book-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.25rem;
}

.book-author {
  font-size: 0.85rem;
  color: var(--text-color-secondary);
  margin: 0 0 0.25rem;
}

.book-duration {
  font-size: 0.8rem;
  color: var(--text-color-secondary);
  margin: 0;
}

.book-progress {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.book-progress .progress-text {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.book-status {
  flex-shrink: 0;
}

.play-button {
  opacity: 0;
  transition: opacity 0.2s;
  flex-shrink: 0;
}

.book-item:hover .play-button {
  opacity: 1;
}

@media (max-width: 768px) {
  .book-order {
    display: none;
  }

  .play-button {
    opacity: 1;
  }
}
</style>
