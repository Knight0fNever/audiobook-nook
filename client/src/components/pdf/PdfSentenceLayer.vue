<script setup>
import { computed } from 'vue'
import { usePdfFollowAlongStore } from '../../stores/pdfFollowAlong'

const props = defineProps({
  pageNumber: {
    type: Number,
    required: true
  },
  scale: {
    type: Number,
    default: 1
  },
  pageWidth: {
    type: Number,
    default: 612
  },
  pageHeight: {
    type: Number,
    default: 792
  }
})

const pdfStore = usePdfFollowAlongStore()

// Only get the current sentence if it's on this page
const currentSentenceOnPage = computed(() => {
  const current = pdfStore.currentSentence
  if (!current || current.pageNumber !== props.pageNumber) return null
  return current
})

function getSentenceStyle(sentence) {
  if (!sentence?.position) return {}

  // Convert PDF coordinates to screen coordinates
  // PDF uses bottom-left origin, we need top-left
  const scale = props.scale
  const x = sentence.position.x * scale
  const y = (props.pageHeight - sentence.position.y - sentence.position.height) * scale
  const width = sentence.position.width * scale
  const height = sentence.position.height * scale

  return {
    left: `${x}px`,
    top: `${y}px`,
    width: `${width}px`,
    height: `${height}px`
  }
}
</script>

<template>
  <div class="sentence-layer" :style="{ width: `${pageWidth * scale}px`, height: `${pageHeight * scale}px` }">
    <!-- Only render the current sentence highlight -->
    <div
      v-if="currentSentenceOnPage"
      class="sentence-highlight current"
      :style="getSentenceStyle(currentSentenceOnPage)"
      :title="currentSentenceOnPage.text"
    >
    </div>
  </div>
</template>

<style scoped>
.sentence-layer {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.sentence-highlight {
  position: absolute;
  border-radius: 3px;
  pointer-events: none;
}

.sentence-highlight.current {
  background: rgba(255, 235, 59, 0.4);
  box-shadow: 0 0 0 2px rgba(255, 193, 7, 0.8);
}
</style>
