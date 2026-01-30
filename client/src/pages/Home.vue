<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../services/api'
import { usePlayerStore } from '../stores/player'
import Card from 'primevue/card'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import Skeleton from 'primevue/skeleton'

const router = useRouter()
const playerStore = usePlayerStore()

const loading = ref(true)
const recentBooks = ref([])
const stats = ref(null)

onMounted(async () => {
  try {
    const [recent, userStats] = await Promise.all([
      api.getRecentProgress(6),
      api.getStats()
    ])
    recentBooks.value = recent
    stats.value = userStats
  } catch (error) {
    console.error('Failed to load home data:', error)
  } finally {
    loading.value = false
  }
})

async function continueListening(book) {
  const fullBook = await api.getBook(book.book_id)
  await playerStore.loadBook(fullBook)
  playerStore.play()
}

function formatTime(seconds) {
  if (!seconds) return '0m'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}
</script>

<template>
  <div class="home-page container">
    <div class="page-header">
      <h1 class="page-title">Welcome Back</h1>
    </div>

    <!-- Stats Cards -->
    <div class="stats-grid" v-if="stats">
      <Card class="stat-card">
        <template #content>
          <div class="stat-content">
            <i class="pi pi-clock stat-icon"></i>
            <div class="stat-info">
              <span class="stat-value">{{ stats.total_listening_formatted }}</span>
              <span class="stat-label">Listening Time</span>
            </div>
          </div>
        </template>
      </Card>

      <Card class="stat-card">
        <template #content>
          <div class="stat-content">
            <i class="pi pi-check-circle stat-icon"></i>
            <div class="stat-info">
              <span class="stat-value">{{ stats.books_completed }}</span>
              <span class="stat-label">Books Completed</span>
            </div>
          </div>
        </template>
      </Card>

      <Card class="stat-card">
        <template #content>
          <div class="stat-content">
            <i class="pi pi-book stat-icon"></i>
            <div class="stat-info">
              <span class="stat-value">{{ stats.currently_reading }}</span>
              <span class="stat-label">In Progress</span>
            </div>
          </div>
        </template>
      </Card>

      <Card class="stat-card">
        <template #content>
          <div class="stat-content">
            <i class="pi pi-database stat-icon"></i>
            <div class="stat-info">
              <span class="stat-value">{{ stats.total_books_in_library }}</span>
              <span class="stat-label">Total Books</span>
            </div>
          </div>
        </template>
      </Card>
    </div>

    <!-- Continue Listening -->
    <section class="section" v-if="recentBooks.length > 0">
      <div class="section-header">
        <h2>Continue Listening</h2>
        <Button label="View All" text @click="router.push('/library?status=in_progress')" />
      </div>

      <div class="continue-grid">
        <Card
          v-for="book in recentBooks"
          :key="book.book_id"
          class="continue-card"
          @click="router.push(`/book/${book.book_id}`)"
        >
          <template #header>
            <div class="continue-cover">
              <img
                v-if="book.cover_url"
                :src="book.cover_url"
                :alt="book.title"
              />
              <div v-else class="cover-placeholder">
                <i class="pi pi-book"></i>
              </div>
              <Button
                icon="pi pi-play"
                rounded
                class="play-overlay"
                @click.stop="continueListening(book)"
              />
            </div>
          </template>

          <template #content>
            <div class="continue-info">
              <h3 class="continue-title">{{ book.title }}</h3>
              <p class="continue-author">{{ book.author }}</p>
              <ProgressBar :value="book.percentage" :showValue="false" class="continue-progress" />
              <p class="continue-time">{{ formatTime(book.time_remaining) }} remaining</p>
            </div>
          </template>
        </Card>
      </div>
    </section>

    <!-- Empty State -->
    <div v-else-if="!loading" class="empty-state">
      <i class="pi pi-book"></i>
      <h2>No books in progress</h2>
      <p>Start listening to an audiobook from your library</p>
      <Button label="Browse Library" icon="pi pi-arrow-right" @click="router.push('/library')" />
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <div class="stats-grid">
        <Skeleton height="100px" v-for="i in 4" :key="i" />
      </div>
      <div class="continue-grid" style="margin-top: 2rem">
        <Skeleton height="280px" v-for="i in 4" :key="i" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  padding: 1.5rem 1rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  cursor: default;
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.stat-icon {
  font-size: 2rem;
  color: var(--primary-color);
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 600;
}

.stat-label {
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

.section {
  margin-bottom: 2rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.section-header h2 {
  margin: 0;
  font-size: 1.25rem;
}

.continue-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

.continue-card {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.continue-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.continue-cover {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
}

.continue-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--primary-400), var(--primary-600));
  color: white;
  font-size: 3rem;
}

.play-overlay {
  position: absolute;
  bottom: 0.5rem;
  right: 0.5rem;
  opacity: 0;
  transition: opacity 0.2s;
}

.continue-card:hover .play-overlay {
  opacity: 1;
}

.continue-info {
  padding: 0.5rem 0;
}

.continue-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.continue-author {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  margin: 0 0 0.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.continue-progress {
  height: 4px;
  margin-bottom: 0.5rem;
}

.continue-time {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  margin: 0;
}

.empty-state {
  text-align: center;
  padding: 4rem 1rem;
}

.empty-state i {
  font-size: 4rem;
  color: var(--text-color-secondary);
  margin-bottom: 1rem;
}

.empty-state h2 {
  margin: 0 0 0.5rem;
}

.empty-state p {
  color: var(--text-color-secondary);
  margin-bottom: 1.5rem;
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .continue-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
