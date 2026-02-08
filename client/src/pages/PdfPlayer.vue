<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Splitter from 'primevue/splitter'
import SplitterPanel from 'primevue/splitterpanel'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import ProgressSpinner from 'primevue/progressspinner'
import Message from 'primevue/message'
import api from '../services/api'
import { usePlayerStore } from '../stores/player'
import { usePdfFollowAlongStore } from '../stores/pdfFollowAlong'
import PdfViewer from '../components/pdf/PdfViewer.vue'
import PdfToolbar from '../components/pdf/PdfToolbar.vue'

const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()
const pdfStore = usePdfFollowAlongStore()

const book = ref(null)
const loading = ref(true)
const error = ref(null)
let statusPollInterval = null

const bookId = computed(() => parseInt(route.params.id))

const showProcessingStatus = computed(() => {
  return pdfStore.hasPdf && pdfStore.isProcessing
})

const canShowPdf = computed(() => {
  return pdfStore.hasPdf && pdfStore.isReady && pdfStore.pdfInfo?.id
})

onMounted(async () => {
  try {
    // Load book data
    book.value = await api.getBook(bookId.value)

    // Initialize PDF store
    await pdfStore.loadPdfInfo(bookId.value)

    // If PDF is ready, load alignment
    if (pdfStore.hasPdf && pdfStore.pdfInfo?.hasAlignment) {
      await pdfStore.loadAlignment()
    }

    // Start polling for status if processing
    if (pdfStore.isProcessing) {
      startStatusPolling()
    }

    // Load book in player if not already loaded
    if (!playerStore.currentBook || playerStore.currentBook.id !== bookId.value) {
      await playerStore.loadBook(book.value)
    }
  } catch (err) {
    error.value = err.message || 'Failed to load book'
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  stopStatusPolling()
})

// Watch for processing completion
watch(() => pdfStore.isProcessing, (isProcessing, wasProcessing) => {
  if (wasProcessing && !isProcessing) {
    // Processing completed
    stopStatusPolling()
    if (pdfStore.pdfInfo?.hasAlignment) {
      pdfStore.loadAlignment()
    }
  }
})

function startStatusPolling() {
  if (statusPollInterval) return

  statusPollInterval = setInterval(async () => {
    await pdfStore.refreshStatus()
    if (!pdfStore.isProcessing) {
      stopStatusPolling()
    }
  }, 3000)
}

function stopStatusPolling() {
  if (statusPollInterval) {
    clearInterval(statusPollInterval)
    statusPollInterval = null
  }
}

function goBack() {
  router.push(`/books/${bookId.value}`)
}

function getStatusMessage(status) {
  const messages = {
    pending: 'Waiting to start processing...',
    extracting: 'Extracting text from PDF...',
    transcribing: 'Transcribing audio (this may take a while)...',
    aligning: 'Aligning PDF text with audio...',
    completed: 'Processing complete!',
    failed: 'Processing failed'
  }
  return messages[status] || 'Processing...'
}
</script>

<template>
  <div class="pdf-player-page">
    <!-- Loading -->
    <div v-if="loading" class="loading-container">
      <ProgressSpinner />
      <p>Loading...</p>
    </div>

    <!-- Error -->
    <Message v-else-if="error" severity="error" :closable="false" class="error-message">
      {{ error }}
      <Button label="Go Back" severity="secondary" @click="goBack" class="mt-2" />
    </Message>

    <!-- No PDF -->
    <div v-else-if="!pdfStore.hasPdf" class="no-pdf-container">
      <i class="pi pi-file-pdf no-pdf-icon"></i>
      <h2>No PDF Uploaded</h2>
      <p>Upload a PDF from the book detail page to use the follow-along feature.</p>
      <Button label="Go to Book" icon="pi pi-arrow-left" @click="goBack" />
    </div>

    <!-- Processing -->
    <div v-else-if="showProcessingStatus" class="processing-container">
      <ProgressSpinner v-if="pdfStore.jobStatus !== 'failed'" />
      <i v-else class="pi pi-times-circle processing-failed-icon"></i>

      <h2>{{ pdfStore.jobStatus === 'failed' ? 'Processing Failed' : 'Processing PDF' }}</h2>

      <p class="status-message">{{ getStatusMessage(pdfStore.jobStatus) }}</p>

      <div v-if="pdfStore.jobStatus !== 'failed'" class="progress-container">
        <ProgressBar :value="pdfStore.jobProgress" :showValue="true" />
      </div>

      <Message v-if="pdfStore.pdfInfo?.job?.error" severity="error" :closable="false">
        {{ pdfStore.pdfInfo.job.error }}
      </Message>

      <Button label="Go Back" severity="secondary" icon="pi pi-arrow-left" @click="goBack" class="mt-3" />
    </div>

    <!-- PDF Player (Ready) -->
    <div v-else-if="canShowPdf" class="pdf-player-layout">
      <!-- Header -->
      <div class="pdf-header">
        <div class="header-left">
          <Button icon="pi pi-arrow-left" text rounded @click="goBack" v-tooltip.bottom="'Back to book'" />
          <div class="book-info">
            <h1>{{ book?.title }}</h1>
            <span>by {{ book?.author }}</span>
          </div>
        </div>
      </div>

      <!-- Main Content -->
      <Splitter class="pdf-splitter" stateKey="pdfPlayerSplitter">
        <!-- PDF Panel -->
        <SplitterPanel :size="60" :minSize="30">
          <div class="pdf-panel">
            <PdfToolbar />
            <PdfViewer :pdfId="pdfStore.pdfInfo.id" />
          </div>
        </SplitterPanel>

        <!-- Audio Panel -->
        <SplitterPanel :size="40" :minSize="25">
          <div class="audio-panel">
            <!-- Current Sentence Display -->
            <div class="current-sentence-display">
              <div v-if="pdfStore.currentSentence" class="sentence-text">
                {{ pdfStore.currentSentence.text }}
              </div>
              <div v-else class="sentence-placeholder">
                Play audio to see the current sentence highlighted
              </div>
            </div>

            <!-- Playback Controls -->
            <div class="playback-controls">
              <div class="time-display">
                {{ playerStore.formattedGlobalPosition }} / {{ playerStore.formattedTotalDuration }}
              </div>

              <ProgressBar
                :value="playerStore.progressPercentage"
                :showValue="false"
                class="progress-bar"
              />

              <div class="control-buttons">
                <Button
                  icon="pi pi-step-backward"
                  text
                  rounded
                  size="large"
                  @click="playerStore.previousChapter()"
                  v-tooltip.bottom="'Previous chapter'"
                />

                <Button
                  icon="pi pi-replay"
                  text
                  rounded
                  @click="playerStore.seekRelative(-30)"
                  v-tooltip.bottom="'Back 30s'"
                />

                <Button
                  :icon="playerStore.isPlaying ? 'pi pi-pause' : 'pi pi-play'"
                  rounded
                  size="large"
                  class="play-button"
                  @click="playerStore.togglePlay()"
                />

                <Button
                  icon="pi pi-refresh"
                  text
                  rounded
                  @click="playerStore.seekRelative(30)"
                  v-tooltip.bottom="'Forward 30s'"
                  style="transform: scaleX(-1)"
                />

                <Button
                  icon="pi pi-step-forward"
                  text
                  rounded
                  size="large"
                  @click="playerStore.nextChapter()"
                  v-tooltip.bottom="'Next chapter'"
                />
              </div>

              <div class="chapter-info">
                <span>Chapter {{ playerStore.currentChapterIndex + 1 }} of {{ playerStore.chapters.length }}</span>
                <span v-if="playerStore.currentChapter">{{ playerStore.currentChapter.title }}</span>
              </div>
            </div>

            <!-- Alignment Quality -->
            <div v-if="pdfStore.alignment?.metadata" class="alignment-info">
              <span class="alignment-quality">
                Alignment quality:
                {{ Math.round(pdfStore.alignment.metadata.matchedCount / pdfStore.alignment.metadata.pdfSentenceCount * 100) }}%
              </span>
              <span class="matched-count">
                ({{ pdfStore.alignment.metadata.matchedCount }} / {{ pdfStore.alignment.metadata.pdfSentenceCount }} sentences)
              </span>
            </div>
          </div>
        </SplitterPanel>
      </Splitter>
    </div>
  </div>
</template>

<style scoped>
.pdf-player-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--surface-ground);
}

.loading-container,
.no-pdf-container,
.processing-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2rem;
  text-align: center;
}

.no-pdf-icon,
.processing-failed-icon {
  font-size: 4rem;
  color: var(--text-color-secondary);
}

.processing-failed-icon {
  color: var(--red-500);
}

.status-message {
  color: var(--text-color-secondary);
}

.progress-container {
  width: 300px;
  margin-top: 1rem;
}

.error-message {
  margin: 2rem;
}

.pdf-player-layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pdf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  background: var(--surface-card);
  border-bottom: 1px solid var(--surface-border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.book-info h1 {
  font-size: 1.1rem;
  margin: 0;
}

.book-info span {
  font-size: 0.85rem;
  color: var(--text-color-secondary);
}

.pdf-splitter {
  flex: 1;
  background: var(--surface-ground);
}

.pdf-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--surface-card);
}

.audio-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  background: var(--surface-card);
}

.current-sentence-display {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: var(--surface-50);
  border-radius: 12px;
  margin-bottom: 1.5rem;
  overflow: auto;
}

.sentence-text {
  font-size: 1.5rem;
  line-height: 1.6;
  text-align: center;
  color: var(--text-color);
}

.sentence-placeholder {
  color: var(--text-color-secondary);
  text-align: center;
}

.playback-controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.time-display {
  font-size: 0.9rem;
  color: var(--text-color-secondary);
}

.progress-bar {
  width: 100%;
  height: 6px;
}

.control-buttons {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.play-button {
  width: 56px;
  height: 56px;
}

.chapter-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 0.85rem;
  color: var(--text-color-secondary);
}

.alignment-info {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--surface-border);
  text-align: center;
  font-size: 0.85rem;
  color: var(--text-color-secondary);
}

.alignment-quality {
  font-weight: 500;
}

.matched-count {
  display: block;
  margin-top: 0.25rem;
}

@media (max-width: 768px) {
  .pdf-splitter :deep(.p-splitter-gutter) {
    display: none;
  }

  .pdf-splitter {
    flex-direction: column;
  }

  .pdf-splitter :deep(.p-splitter-panel) {
    flex-basis: auto !important;
  }
}
</style>
