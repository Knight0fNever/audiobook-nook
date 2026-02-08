<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { VuePDF, usePDF } from '@tato30/vue-pdf'
import ProgressSpinner from 'primevue/progressspinner'
import Message from 'primevue/message'
import PdfSentenceLayer from './PdfSentenceLayer.vue'
import { usePdfFollowAlongStore } from '../../stores/pdfFollowAlong'
import api from '../../services/api'

const props = defineProps({
  pdfId: {
    type: Number,
    required: true
  }
})

const pdfStore = usePdfFollowAlongStore()

// PDF source URL
const pdfUrl = computed(() => api.getPdfFileUrl(props.pdfId))

// Load PDF using vue-pdf
const { pdf, pages, info } = usePDF(pdfUrl)

const containerRef = ref(null)
const pageWidth = ref(612)
const pageHeight = ref(792)
const isLoading = ref(true)
const loadError = ref(null)

// Simple fixed scale based on zoom only
const scale = computed(() => pdfStore.zoom)

// Handle PDF load
watch(pdf, (newPdf) => {
  if (newPdf) {
    isLoading.value = false
  }
})

watch(info, (newInfo) => {
  if (newInfo) {
    // Get page dimensions from first page
    if (newInfo.width && newInfo.height) {
      pageWidth.value = newInfo.width
      pageHeight.value = newInfo.height
    }
  }
})

function handlePageLoaded(event) {
  if (event.width && event.height) {
    pageWidth.value = event.width
    pageHeight.value = event.height
  }
}

function handleLoadError(error) {
  loadError.value = 'Failed to load PDF'
  isLoading.value = false
  console.error('PDF load error:', error)
}

// Keyboard navigation
function handleKeydown(event) {
  if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
    pdfStore.previousPage()
  } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
    pdfStore.nextPage()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div ref="containerRef" class="pdf-viewer">
    <div v-if="isLoading" class="loading-container">
      <ProgressSpinner />
      <p>Loading PDF...</p>
    </div>

    <Message v-else-if="loadError" severity="error" :closable="false">
      {{ loadError }}
    </Message>

    <div v-else class="pdf-page-container">
      <div class="pdf-page-wrapper">
        <VuePDF
          :pdf="pdf"
          :page="pdfStore.currentPage"
          :scale="scale"
          @loaded="handlePageLoaded"
          @error="handleLoadError"
        />

        <!-- Sentence highlight overlay -->
        <PdfSentenceLayer
          v-if="pdfStore.alignment"
          :pageNumber="pdfStore.currentPage"
          :scale="scale"
          :pageWidth="pageWidth"
          :pageHeight="pageHeight"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.pdf-viewer {
  flex: 1;
  overflow: auto;
  background: #525659;
  padding: 1rem;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 1rem;
  color: var(--text-color-secondary);
}

.pdf-page-container {
  display: flex;
  justify-content: center;
}

.pdf-page-wrapper {
  position: relative;
  background: white;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  line-height: 0;
}

.pdf-page-wrapper :deep(canvas) {
  display: block;
  max-width: 100%;
  height: auto;
}
</style>
