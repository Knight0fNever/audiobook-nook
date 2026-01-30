<script setup>
import { onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useLibraryStore } from '../stores/library'
import InputText from 'primevue/inputtext'
import Dropdown from 'primevue/dropdown'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import DataView from 'primevue/dataview'
import Paginator from 'primevue/paginator'
import ProgressBar from 'primevue/progressbar'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'

const router = useRouter()
const route = useRoute()
const libraryStore = useLibraryStore()

const statusOptions = [
  { label: 'All', value: '' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
  { label: 'Not Started', value: 'not_started' }
]

const sortOptions = [
  { label: 'Title', value: 'title' },
  { label: 'Author', value: 'author' },
  { label: 'Date Added', value: 'created_at' },
  { label: 'Duration', value: 'duration_seconds' }
]

const viewOptions = [
  { icon: 'pi pi-th-large', value: 'grid' },
  { icon: 'pi pi-list', value: 'list' }
]

onMounted(() => {
  // Apply URL query params to filters
  if (route.query.status) {
    libraryStore.filterStatus = route.query.status
  }
  if (route.query.search) {
    libraryStore.searchQuery = route.query.search
  }
  libraryStore.fetchBooks()
})

watch(() => route.query, (query) => {
  if (query.status && query.status !== libraryStore.filterStatus) {
    libraryStore.setFilter('status', query.status)
  }
}, { deep: true })

function handleSearch(event) {
  libraryStore.setSearch(event.target.value)
}

function handlePageChange(event) {
  libraryStore.setPage(event.page + 1)
}

function formatDuration(seconds) {
  if (!seconds) return '--'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}
</script>

<template>
  <div class="library-page container">
    <div class="page-header">
      <h1 class="page-title">Library</h1>
    </div>

    <!-- Filters Bar -->
    <div class="filters-bar">
      <div class="search-box">
        <span class="p-input-icon-left w-full">
          <i class="pi pi-search" />
          <InputText
            :modelValue="libraryStore.searchQuery"
            placeholder="Search books..."
            class="w-full"
            @input="handleSearch"
          />
        </span>
      </div>

      <div class="filter-controls">
        <Dropdown
          v-model="libraryStore.filterStatus"
          :options="statusOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Status"
          @change="libraryStore.fetchBooks()"
        />

        <Dropdown
          v-model="libraryStore.sortBy"
          :options="sortOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Sort by"
          @change="libraryStore.fetchBooks()"
        />

        <Button
          :icon="libraryStore.sortOrder === 'asc' ? 'pi pi-sort-alpha-down' : 'pi pi-sort-alpha-up'"
          severity="secondary"
          text
          @click="libraryStore.setSort(libraryStore.sortBy, libraryStore.sortOrder === 'asc' ? 'desc' : 'asc')"
        />

        <SelectButton
          v-model="libraryStore.viewMode"
          :options="viewOptions"
          optionValue="value"
          dataKey="value"
          @change="(e) => libraryStore.setViewMode(e.value)"
        >
          <template #option="{ option }">
            <i :class="option.icon"></i>
          </template>
        </SelectButton>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="libraryStore.loading" class="loading-grid">
      <Skeleton
        v-for="i in 12"
        :key="i"
        :height="libraryStore.viewMode === 'grid' ? '280px' : '100px'"
      />
    </div>

    <!-- Grid View -->
    <div v-else-if="libraryStore.viewMode === 'grid'" class="book-grid">
      <div
        v-for="book in libraryStore.books"
        :key="book.id"
        class="book-card"
        @click="router.push(`/book/${book.id}`)"
      >
        <div class="book-cover">
          <img
            v-if="book.cover_url"
            :src="book.cover_url"
            :alt="book.title"
          />
          <div v-else class="cover-placeholder">
            <i class="pi pi-book"></i>
          </div>
          <Tag
            v-if="book.progress.completed"
            value="Completed"
            severity="success"
            class="status-tag"
          />
          <Tag
            v-else-if="book.progress.percentage > 0"
            :value="`${Math.round(book.progress.percentage)}%`"
            severity="info"
            class="status-tag"
          />
        </div>
        <div class="book-info">
          <h3 class="book-title">{{ book.title }}</h3>
          <p class="book-author">{{ book.author }}</p>
          <p class="book-duration">{{ formatDuration(book.duration_seconds) }}</p>
          <ProgressBar
            v-if="book.progress.percentage > 0 && !book.progress.completed"
            :value="book.progress.percentage"
            :showValue="false"
            class="book-progress"
          />
        </div>
      </div>
    </div>

    <!-- List View -->
    <div v-else class="book-list">
      <div
        v-for="book in libraryStore.books"
        :key="book.id"
        class="book-list-item"
        @click="router.push(`/book/${book.id}`)"
      >
        <div class="book-list-cover">
          <img
            v-if="book.cover_url"
            :src="book.cover_url"
            :alt="book.title"
          />
          <div v-else class="cover-placeholder">
            <i class="pi pi-book"></i>
          </div>
        </div>
        <div class="book-list-info">
          <h3 class="book-title">{{ book.title }}</h3>
          <p class="book-author">{{ book.author }}</p>
          <p class="book-meta">
            <span>{{ formatDuration(book.duration_seconds) }}</span>
            <span v-if="book.series_name"> &bull; {{ book.series_name }}</span>
          </p>
        </div>
        <div class="book-list-progress">
          <Tag
            v-if="book.progress.completed"
            value="Completed"
            severity="success"
          />
          <template v-else-if="book.progress.percentage > 0">
            <ProgressBar :value="book.progress.percentage" :showValue="false" style="width: 100px" />
            <span class="progress-text">{{ Math.round(book.progress.percentage) }}%</span>
          </template>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="!libraryStore.loading && libraryStore.books.length === 0" class="empty-state">
      <i class="pi pi-search"></i>
      <h2>No books found</h2>
      <p v-if="libraryStore.searchQuery || libraryStore.filterStatus">
        Try adjusting your search or filters
      </p>
      <p v-else>
        Your library is empty. Add audiobooks to get started.
      </p>
      <Button
        v-if="libraryStore.searchQuery || libraryStore.filterStatus"
        label="Clear Filters"
        severity="secondary"
        @click="libraryStore.clearFilters()"
      />
    </div>

    <!-- Pagination -->
    <Paginator
      v-if="libraryStore.total > libraryStore.limit"
      :rows="libraryStore.limit"
      :totalRecords="libraryStore.total"
      :first="libraryStore.offset"
      @page="handlePageChange"
      class="pagination"
    />
  </div>
</template>

<style scoped>
.library-page {
  padding: 1.5rem 1rem;
}

.filters-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
  align-items: center;
}

.search-box {
  flex: 1;
  min-width: 200px;
}

.filter-controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.loading-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
}

.book-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1.5rem;
}

.book-card {
  background: var(--surface-card);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.book-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.book-cover {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
}

.book-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.status-tag {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
}

.book-info {
  padding: 0.75rem;
}

.book-title {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0 0 0.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.book-author {
  font-size: 0.85rem;
  color: var(--text-color-secondary);
  margin: 0 0 0.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.book-duration {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  margin: 0 0 0.5rem;
}

.book-progress {
  height: 4px;
}

/* List View */
.book-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.book-list-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem;
  background: var(--surface-card);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.book-list-item:hover {
  background: var(--surface-hover);
}

.book-list-cover {
  width: 60px;
  height: 60px;
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
}

.book-list-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.book-list-cover .cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary-100);
  color: var(--primary-color);
}

.book-list-info {
  flex: 1;
  min-width: 0;
}

.book-list-info .book-title {
  margin-bottom: 0.25rem;
}

.book-meta {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  margin: 0;
}

.book-list-progress {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.progress-text {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
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

.pagination {
  margin-top: 2rem;
}

@media (max-width: 768px) {
  .filters-bar {
    flex-direction: column;
  }

  .search-box {
    width: 100%;
  }

  .filter-controls {
    width: 100%;
    justify-content: space-between;
  }

  .book-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }
}
</style>
