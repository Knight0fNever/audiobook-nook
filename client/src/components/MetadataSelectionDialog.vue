<script setup>
import { ref, defineProps, defineEmits } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Tag from 'primevue/tag'

const props = defineProps({
  visible: Boolean,
  results: Array,
  source: String
})

const emit = defineEmits(['update:visible', 'select'])

const selectedResult = ref(null)

function selectResult(result) {
  selectedResult.value = result
}

function confirmSelection() {
  if (selectedResult.value) {
    emit('select', selectedResult.value)
    closeDialog()
  }
}

function closeDialog() {
  selectedResult.value = null
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="$emit('update:visible', $event)"
    header="Select Metadata"
    :modal="true"
    :style="{ width: '50rem' }"
    :closable="true"
  >
    <div class="metadata-selection">
      <div v-if="source" class="source-info">
        <Tag :value="source" :severity="source === 'openlibrary' ? 'success' : 'info'" />
        <span>{{ results.length }} result{{ results.length !== 1 ? 's' : '' }} found</span>
      </div>

      <div class="results-list">
        <div
          v-for="(item, index) in results"
          :key="index"
          class="result-item"
          :class="{ selected: selectedResult === item }"
          @click="selectResult(item)"
        >
          <div class="result-cover">
            <img
              v-if="item.coverUrl"
              :src="item.coverUrl"
              :alt="item.title"
              class="cover-thumbnail"
            />
            <div v-else class="cover-placeholder">
              <i class="pi pi-book"></i>
            </div>
          </div>

          <div class="result-details">
            <h3 class="result-title">{{ item.title || 'Unknown Title' }}</h3>
            <p class="result-author">by {{ item.author || 'Unknown Author' }}</p>

            <div class="result-meta">
              <span v-if="item.isbn" class="meta-item">
                <i class="pi pi-book"></i>
                ISBN: {{ item.isbn }}
              </span>
              <span v-if="item.publisher" class="meta-item">
                <i class="pi pi-building"></i>
                {{ item.publisher }}
              </span>
              <span v-if="item.publicationYear" class="meta-item">
                <i class="pi pi-calendar"></i>
                {{ item.publicationYear }}
              </span>
            </div>

            <p v-if="item.description" class="result-description">
              {{ item.description.substring(0, 200) }}{{ item.description.length > 200 ? '...' : '' }}
            </p>
          </div>

          <div class="result-select">
            <i v-if="selectedResult === item" class="pi pi-check-circle"></i>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" severity="secondary" @click="closeDialog" />
      <Button
        label="Apply Selected"
        :disabled="!selectedResult"
        @click="confirmSelection"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.metadata-selection {
  padding: 1rem 0;
}

.source-info {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding: 0.75rem;
  background: var(--surface-50);
  border-radius: 6px;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 500px;
  overflow-y: auto;
}

.result-item {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  border: 2px solid var(--surface-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.result-item:hover {
  border-color: var(--primary-color);
  background: var(--surface-50);
}

.result-item.selected {
  border-color: var(--primary-color);
  background: var(--primary-50);
}

.result-cover {
  width: 80px;
  height: 120px;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
}

.cover-thumbnail {
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
  font-size: 2rem;
}

.result-details {
  flex: 1;
  min-width: 0;
}

.result-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 0.25rem;
}

.result-author {
  color: var(--text-color-secondary);
  margin: 0 0 0.5rem;
}

.result-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: var(--text-color-secondary);
}

.result-description {
  font-size: 0.9rem;
  color: var(--text-color-secondary);
  line-height: 1.4;
  margin: 0.5rem 0 0;
}

.result-select {
  display: flex;
  align-items: center;
  font-size: 1.5rem;
  color: var(--primary-color);
}
</style>
