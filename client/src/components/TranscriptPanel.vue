<script setup>
import { ref, watch, nextTick } from 'vue'
import { useTranscriptStore } from '../stores/transcript'
import { usePlayerStore } from '../stores/player'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'

const transcriptStore = useTranscriptStore()
const playerStore = usePlayerStore()

const sentenceRefs = ref([])
const containerRef = ref(null)

function setSentenceRef(el, index) {
  if (el) sentenceRefs.value[index] = el
}

// Auto-scroll to active sentence
watch(() => transcriptStore.currentChapterSentenceIndex, async (newIndex) => {
  if (newIndex < 0 || !transcriptStore.autoScroll) return

  await nextTick()
  const el = sentenceRefs.value[newIndex]
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
})

function handleSentenceClick(sentence) {
  transcriptStore.seekToSentence(sentence)
}

function toggleAutoScroll() {
  transcriptStore.autoScroll = !transcriptStore.autoScroll
}
</script>

<template>
  <div class="transcript-panel">
    <!-- Header -->
    <div class="transcript-header">
      <span class="chapter-label" v-if="playerStore.currentChapter">
        {{ playerStore.currentChapter.title }}
      </span>
      <Button
        :icon="transcriptStore.autoScroll ? 'pi pi-lock' : 'pi pi-lock-open'"
        text
        rounded
        size="small"
        @click="toggleAutoScroll"
        v-tooltip.left="transcriptStore.autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'"
        :class="{ 'auto-scroll-active': transcriptStore.autoScroll }"
      />
    </div>

    <!-- Loading -->
    <div v-if="transcriptStore.loading" class="transcript-loading">
      <ProgressSpinner style="width: 32px; height: 32px" />
      <span>Loading transcript...</span>
    </div>

    <!-- Empty state -->
    <div v-else-if="transcriptStore.currentChapterSentences.length === 0" class="transcript-empty">
      <i class="pi pi-align-left"></i>
      <p>No transcription available</p>
      <small>Transcribe this book from the book detail page</small>
    </div>

    <!-- Sentences -->
    <div v-else ref="containerRef" class="transcript-sentences">
      <div
        v-for="(sentence, index) in transcriptStore.currentChapterSentences"
        :key="`${sentence.chapterIndex}-${index}`"
        :ref="(el) => setSentenceRef(el, index)"
        class="transcript-sentence"
        :class="{
          active: index === transcriptStore.currentChapterSentenceIndex,
          past: index < transcriptStore.currentChapterSentenceIndex
        }"
        @click="handleSentenceClick(sentence)"
      >
        {{ sentence.text }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.transcript-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.transcript-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid var(--surface-border);
  flex-shrink: 0;
}

.chapter-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auto-scroll-active {
  color: var(--primary-color) !important;
}

.transcript-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: var(--text-color-secondary);
}

.transcript-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: var(--text-color-secondary);
  text-align: center;
  padding: 2rem;
}

.transcript-empty i {
  font-size: 2rem;
  opacity: 0.5;
}

.transcript-empty p {
  margin: 0;
  font-weight: 500;
}

.transcript-sentences {
  flex: 1;
  overflow-y: auto;
  padding-right: 0.5rem;
}

.transcript-sentence {
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.25rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  line-height: 1.5;
  transition: background 0.2s, color 0.2s, opacity 0.2s;
  color: var(--text-color);
}

.transcript-sentence:hover {
  background: var(--surface-hover);
}

.transcript-sentence.active {
  background: var(--primary-100);
  color: var(--primary-700);
  font-weight: 500;
}

.transcript-sentence.past {
  opacity: 0.5;
}
</style>
