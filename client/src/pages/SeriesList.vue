<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../services/api'
import Card from 'primevue/card'
import Skeleton from 'primevue/skeleton'

const router = useRouter()

const series = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    series.value = await api.getSeries()
  } catch (error) {
    console.error('Failed to load series:', error)
  } finally {
    loading.value = false
  }
})

function formatDuration(seconds) {
  if (!seconds) return '--'
  const hours = Math.floor(seconds / 3600)
  return hours > 0 ? `${hours}h total` : '< 1h total'
}
</script>

<template>
  <div class="series-page container">
    <div class="page-header">
      <h1 class="page-title">Series</h1>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="series-grid">
      <Skeleton v-for="i in 6" :key="i" height="120px" />
    </div>

    <!-- Series Grid -->
    <div v-else-if="series.length > 0" class="series-grid">
      <Card
        v-for="s in series"
        :key="s.id"
        class="series-card"
        @click="router.push(`/series/${s.id}`)"
      >
        <template #content>
          <div class="series-content">
            <div class="series-icon">
              <i class="pi pi-list"></i>
            </div>
            <div class="series-info">
              <h3 class="series-name">{{ s.name }}</h3>
              <p class="series-meta">
                {{ s.book_count }} {{ s.book_count === 1 ? 'book' : 'books' }}
                &bull;
                {{ formatDuration(s.total_duration) }}
              </p>
              <p v-if="s.description" class="series-description">{{ s.description }}</p>
            </div>
          </div>
        </template>
      </Card>
    </div>

    <!-- Empty State -->
    <div v-else class="empty-state">
      <i class="pi pi-list"></i>
      <h2>No series found</h2>
      <p>Series will appear here when books are added to series collections</p>
    </div>
  </div>
</template>

<style scoped>
.series-page {
  padding: 1.5rem 1rem;
}

.series-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.series-card {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.series-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.series-content {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.series-icon {
  width: 48px;
  height: 48px;
  background: var(--primary-100);
  color: var(--primary-color);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  flex-shrink: 0;
}

.series-info {
  flex: 1;
  min-width: 0;
}

.series-name {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 0.25rem;
}

.series-meta {
  font-size: 0.85rem;
  color: var(--text-color-secondary);
  margin: 0 0 0.5rem;
}

.series-description {
  font-size: 0.85rem;
  color: var(--text-color-secondary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
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
}
</style>
