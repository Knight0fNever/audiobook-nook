<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../services/api'
import { usePlayerStore } from '../stores/player'
import { useAuthStore } from '../stores/auth'
import { usePdfFollowAlongStore } from '../stores/pdfFollowAlong'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'
import Skeleton from 'primevue/skeleton'
import Divider from 'primevue/divider'
import { useToast } from 'primevue/usetoast'
import MetadataSelectionDialog from '../components/MetadataSelectionDialog.vue'
import PdfUploadDialog from '../components/pdf/PdfUploadDialog.vue'

const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()
const authStore = useAuthStore()
const pdfStore = usePdfFollowAlongStore()
const toast = useToast()

const book = ref(null)
const chapters = ref([])
const loading = ref(true)
const enriching = ref(false)
const showMetadataDialog = ref(false)
const metadataResults = ref([])
const metadataSource = ref(null)
const showPdfUploadDialog = ref(false)
let pdfStatusPollInterval = null

const isCurrentBook = computed(() => playerStore.currentBook?.id === book.value?.id)

const pdfStatusMessage = computed(() => {
  const status = pdfStore.jobStatus
  const messages = {
    pending: 'Waiting to start...',
    extracting: 'Extracting text from PDF...',
    transcribing: 'Transcribing audio (this may take a while)...',
    aligning: 'Aligning PDF with audio...',
    completed: 'Processing complete!',
    failed: 'Processing failed'
  }
  return messages[status] || 'Processing...'
})

// Start polling for PDF status when processing
function startPdfStatusPolling() {
  if (pdfStatusPollInterval) return

  pdfStatusPollInterval = setInterval(async () => {
    await pdfStore.refreshStatus()
    if (!pdfStore.isProcessing) {
      stopPdfStatusPolling()
      if (pdfStore.isReady) {
        toast.add({
          severity: 'success',
          summary: 'PDF Ready',
          detail: 'PDF processing complete. You can now use the follow-along feature.',
          life: 5000
        })
      }
    }
  }, 2000)
}

function stopPdfStatusPolling() {
  if (pdfStatusPollInterval) {
    clearInterval(pdfStatusPollInterval)
    pdfStatusPollInterval = null
  }
}

// Watch for processing state changes
watch(() => pdfStore.isProcessing, (isProcessing) => {
  if (isProcessing) {
    startPdfStatusPolling()
  } else {
    stopPdfStatusPolling()
  }
}, { immediate: true })

onUnmounted(() => {
  stopPdfStatusPolling()
})

onMounted(async () => {
  try {
    const [bookData, chaptersData] = await Promise.all([
      api.getBook(route.params.id),
      api.getBookChapters(route.params.id)
    ])
    book.value = bookData
    chapters.value = chaptersData

    // Load PDF info
    pdfStore.loadPdfInfo(parseInt(route.params.id))
  } catch (error) {
    console.error('Failed to load book:', error)
  } finally {
    loading.value = false
  }
})

async function playBook() {
  await playerStore.loadBook(book.value)
  playerStore.play()
}

async function playFromChapter(index) {
  if (!isCurrentBook.value) {
    await playerStore.loadBook(book.value)
  }
  await playerStore.goToChapter(index)
  playerStore.play()
}

function openFullPlayer() {
  router.push('/player')
}

function openPdfPlayer() {
  router.push(`/book/${route.params.id}/pdf-player`)
}

function handlePdfUploaded() {
  toast.add({
    severity: 'success',
    summary: 'PDF Uploaded',
    detail: 'PDF is now being processed. This may take a few minutes.',
    life: 5000
  })
}

async function deletePdf() {
  if (!confirm('Are you sure you want to delete this PDF? This will also remove all alignment data.')) {
    return
  }

  try {
    await pdfStore.deletePdf()
    toast.add({
      severity: 'success',
      summary: 'PDF Deleted',
      detail: 'The PDF has been removed.',
      life: 3000
    })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Delete Failed',
      detail: error.message || 'Failed to delete PDF',
      life: 3000
    })
  }
}

async function cancelPdfProcessing() {
  if (!confirm('Are you sure you want to cancel PDF processing?')) {
    return
  }

  try {
    await pdfStore.cancelProcessing()
    stopPdfStatusPolling()
    toast.add({
      severity: 'info',
      summary: 'Processing Cancelled',
      detail: 'PDF processing has been cancelled.',
      life: 3000
    })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Cancel Failed',
      detail: error.message || 'Failed to cancel processing',
      life: 3000
    })
  }
}

function formatDuration(seconds) {
  if (!seconds) return '--'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

function formatChapterTime(seconds) {
  if (!seconds) return '0:00'
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

async function enrichMetadata() {
  if (!authStore.isAdmin) return

  enriching.value = true
  try {
    const result = await api.searchBookMetadata(route.params.id)

    if (result.autoApplied) {
      // Single result was auto-applied
      book.value = await api.getBook(route.params.id)
      toast.add({
        severity: 'success',
        summary: 'Metadata Enriched',
        detail: `Successfully enriched from ${result.source}`,
        life: 3000
      })
    } else if (result.results && result.results.length > 0) {
      // Multiple results - show selection dialog
      metadataResults.value = result.results
      metadataSource.value = result.source
      showMetadataDialog.value = true
    } else {
      toast.add({
        severity: 'info',
        summary: 'No Metadata Found',
        detail: 'Could not find metadata from APIs',
        life: 3000
      })
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Enrichment Failed',
      detail: error.message || 'Failed to enrich metadata',
      life: 3000
    })
  } finally {
    enriching.value = false
  }
}

async function applySelectedMetadata(selectedMetadata) {
  try {
    const result = await api.applyBookMetadata(route.params.id, selectedMetadata)
    book.value = await api.getBook(route.params.id)

    toast.add({
      severity: 'success',
      summary: 'Metadata Applied',
      detail: `Successfully applied metadata from ${result.source}`,
      life: 3000
    })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Application Failed',
      detail: error.message || 'Failed to apply metadata',
      life: 3000
    })
  }
}

function getMetadataSourceSeverity(source) {
  if (!source) return 'secondary'
  if (source === 'openlibrary') return 'success'
  if (source === 'googlebooks') return 'info'
  return 'secondary'
}
</script>

<template>
  <div class="book-detail-page container">
    <!-- Loading -->
    <div v-if="loading" class="loading-state">
      <div class="book-header-skeleton">
        <Skeleton width="200px" height="200px" />
        <div class="header-info-skeleton">
          <Skeleton width="60%" height="2rem" />
          <Skeleton width="40%" height="1.5rem" />
          <Skeleton width="100%" height="4rem" />
        </div>
      </div>
    </div>

    <!-- Book Content -->
    <div v-else-if="book" class="book-content">
      <!-- Header Section -->
      <div class="book-header">
        <div class="book-cover-large">
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
          <h1 class="book-title">{{ book.title }}</h1>
          <p class="book-author">by {{ book.author }}</p>
          <p v-if="book.narrator" class="book-narrator">
            Narrated by {{ book.narrator }}
          </p>

          <div class="book-meta">
            <Tag v-if="book.series_name" :value="book.series_name" severity="info" />
            <Tag v-if="book.metadata_source" :value="book.metadata_source" :severity="getMetadataSourceSeverity(book.metadata_source)" />
            <span class="meta-item">
              <i class="pi pi-clock"></i>
              {{ formatDuration(book.duration_seconds) }}
            </span>
            <span v-if="book.publication_year" class="meta-item">
              <i class="pi pi-calendar"></i>
              {{ book.publication_year }}
            </span>
            <span v-if="book.genre" class="meta-item">
              <i class="pi pi-tag"></i>
              {{ book.genre }}
            </span>
            <span v-if="book.isbn" class="meta-item">
              <i class="pi pi-book"></i>
              ISBN: {{ book.isbn }}
            </span>
            <span v-if="book.publisher" class="meta-item">
              <i class="pi pi-building"></i>
              {{ book.publisher }}
            </span>
          </div>

          <!-- Progress -->
          <div v-if="book.progress.percentage > 0" class="book-progress-section">
            <div class="progress-header">
              <span>{{ Math.round(book.progress.percentage) }}% complete</span>
              <span v-if="!book.progress.completed">
                {{ formatDuration(book.duration_seconds - (book.progress.position_seconds || 0)) }} remaining
              </span>
            </div>
            <ProgressBar :value="book.progress.percentage" :showValue="false" />
          </div>

          <!-- Actions -->
          <div class="book-actions">
            <Button
              v-if="isCurrentBook && playerStore.isPlaying"
              label="Now Playing"
              icon="pi pi-headphones"
              @click="openFullPlayer"
            />
            <Button
              v-else-if="book.progress.position_seconds > 0"
              label="Continue Listening"
              icon="pi pi-play"
              @click="playBook"
            />
            <Button
              v-else
              label="Start Listening"
              icon="pi pi-play"
              @click="playBook"
            />

            <Button
              v-if="isCurrentBook"
              label="Open Player"
              icon="pi pi-external-link"
              severity="secondary"
              @click="openFullPlayer"
            />

            <Button
              v-if="authStore.isAdmin"
              label="Enrich Metadata"
              icon="pi pi-sync"
              severity="secondary"
              :loading="enriching"
              @click="enrichMetadata"
            />

            <Button
              v-if="pdfStore.hasPdf && pdfStore.isReady"
              label="PDF Follow-Along"
              icon="pi pi-file-pdf"
              severity="help"
              @click="openPdfPlayer"
            />

            <Button
              v-else-if="!pdfStore.hasPdf"
              label="Upload PDF"
              icon="pi pi-upload"
              severity="secondary"
              @click="showPdfUploadDialog = true"
            />

            <Button
              v-if="pdfStore.hasPdf && !pdfStore.isProcessing"
              label="Delete PDF"
              icon="pi pi-trash"
              severity="danger"
              outlined
              @click="deletePdf"
            />
          </div>

          <!-- PDF Processing Progress -->
          <div v-if="pdfStore.hasPdf && pdfStore.isProcessing" class="pdf-processing-section">
            <div class="pdf-processing-header">
              <i class="pi pi-file-pdf"></i>
              <span>Processing PDF</span>
              <Button
                icon="pi pi-times"
                severity="secondary"
                text
                rounded
                size="small"
                class="cancel-btn"
                @click="cancelPdfProcessing"
                v-tooltip.top="'Cancel processing'"
              />
            </div>
            <div class="pdf-processing-status">{{ pdfStatusMessage }}</div>
            <ProgressBar :value="pdfStore.jobProgress" :showValue="true" class="pdf-progress-bar" />
            <div v-if="pdfStore.pdfInfo?.job?.error" class="pdf-error">
              <i class="pi pi-exclamation-triangle"></i>
              {{ pdfStore.pdfInfo.job.error }}
            </div>
          </div>
        </div>
      </div>

      <!-- Description -->
      <div v-if="book.api_description || book.description" class="book-description">
        <h2>Description</h2>
        <div v-if="book.api_description" class="description-section">
          <p>{{ book.api_description }}</p>
          <span v-if="book.metadata_source" class="description-source">
            Source: {{ book.metadata_source }}
          </span>
        </div>
        <div v-if="book.description && book.description !== book.api_description" class="description-section local-description">
          <h3>Local Description</h3>
          <p>{{ book.description }}</p>
        </div>
      </div>

      <Divider />

      <!-- Chapters -->
      <div class="chapters-section">
        <h2>Chapters ({{ chapters.length }})</h2>
        <div class="chapters-list">
          <div
            v-for="(chapter, index) in chapters"
            :key="chapter.id"
            class="chapter-item"
            :class="{
              'active': isCurrentBook && playerStore.currentChapterIndex === index,
              'completed': isCurrentBook && index < playerStore.currentChapterIndex
            }"
            @click="playFromChapter(index)"
          >
            <div class="chapter-index">{{ index + 1 }}</div>
            <div class="chapter-info">
              <span class="chapter-title">{{ chapter.title }}</span>
              <span class="chapter-duration">{{ formatChapterTime(chapter.duration_seconds) }}</span>
            </div>
            <Button
              icon="pi pi-play"
              text
              rounded
              size="small"
              class="chapter-play"
            />
          </div>
        </div>
      </div>
    </div>

    <MetadataSelectionDialog
      v-model:visible="showMetadataDialog"
      :results="metadataResults"
      :source="metadataSource"
      @select="applySelectedMetadata"
    />

    <PdfUploadDialog
      v-model:visible="showPdfUploadDialog"
      :bookId="parseInt(route.params.id)"
      :bookTitle="book?.title"
      @uploaded="handlePdfUploaded"
    />
  </div>
</template>

<style scoped>
.book-detail-page {
  padding: 1.5rem 1rem;
}

.loading-state {
  padding: 1rem;
}

.book-header-skeleton {
  display: flex;
  gap: 2rem;
}

.header-info-skeleton {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.book-header {
  display: flex;
  gap: 2rem;
  margin-bottom: 2rem;
}

.book-cover-large {
  width: 250px;
  height: 250px;
  border-radius: 12px;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.book-cover-large img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.book-cover-large .cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--primary-400), var(--primary-600));
  color: white;
  font-size: 5rem;
}

.book-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.book-title {
  font-size: 2rem;
  font-weight: 700;
  margin: 0 0 0.5rem;
}

.book-author {
  font-size: 1.25rem;
  color: var(--text-color-secondary);
  margin: 0 0 0.25rem;
}

.book-narrator {
  font-size: 1rem;
  color: var(--text-color-secondary);
  margin: 0 0 1rem;
}

.book-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
  align-items: center;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: var(--text-color-secondary);
}

.book-progress-section {
  margin-bottom: 1.5rem;
  max-width: 400px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  color: var(--text-color-secondary);
  margin-bottom: 0.5rem;
}

.book-actions {
  display: flex;
  gap: 1rem;
  margin-top: auto;
  flex-wrap: wrap;
}

.pdf-processing-section {
  margin-top: 1.5rem;
  padding: 1rem;
  background: var(--surface-100);
  border-radius: 8px;
  max-width: 400px;
}

.pdf-processing-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--primary-color);
}

.pdf-processing-header i {
  font-size: 1.2rem;
}

.pdf-processing-header .cancel-btn {
  margin-left: auto;
  color: var(--text-color-secondary);
}

.pdf-processing-header .cancel-btn:hover {
  color: var(--red-500);
}

.pdf-processing-status {
  font-size: 0.9rem;
  color: var(--text-color-secondary);
  margin-bottom: 0.75rem;
}

.pdf-progress-bar {
  height: 8px;
}

.pdf-error {
  margin-top: 0.75rem;
  padding: 0.5rem;
  background: var(--red-50);
  border-radius: 4px;
  color: var(--red-700);
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.book-description {
  margin-bottom: 2rem;
}

.book-description h2 {
  font-size: 1.25rem;
  margin-bottom: 0.75rem;
}

.book-description p {
  color: var(--text-color-secondary);
  line-height: 1.6;
}

.description-section {
  margin-bottom: 1rem;
}

.description-source {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  font-style: italic;
}

.local-description h3 {
  font-size: 1rem;
  margin-bottom: 0.5rem;
  color: var(--text-color-secondary);
}

.chapters-section h2 {
  font-size: 1.25rem;
  margin-bottom: 1rem;
}

.chapters-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.chapter-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.chapter-item:hover {
  background: var(--surface-hover);
}

.chapter-item.active {
  background: var(--primary-100);
}

.chapter-item.completed {
  opacity: 0.6;
}

.chapter-index {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-200);
  border-radius: 50%;
  font-size: 0.85rem;
  font-weight: 600;
  flex-shrink: 0;
}

.chapter-item.active .chapter-index {
  background: var(--primary-color);
  color: white;
}

.chapter-info {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-width: 0;
}

.chapter-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chapter-duration {
  color: var(--text-color-secondary);
  font-size: 0.85rem;
  flex-shrink: 0;
  margin-left: 1rem;
}

.chapter-play {
  opacity: 0;
  transition: opacity 0.2s;
}

.chapter-item:hover .chapter-play {
  opacity: 1;
}

@media (max-width: 768px) {
  .book-header {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .book-cover-large {
    width: 200px;
    height: 200px;
  }

  .book-meta {
    justify-content: center;
  }

  .book-progress-section {
    max-width: none;
  }

  .book-actions {
    justify-content: center;
    flex-wrap: wrap;
  }
}
</style>
