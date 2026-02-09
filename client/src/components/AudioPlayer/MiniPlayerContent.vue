<script setup>
import { computed } from 'vue'
import { usePlayerStore } from '../../stores/player'
import Button from 'primevue/button'
import Slider from 'primevue/slider'

const props = defineProps({
  isExpanded: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['expand'])

const playerStore = usePlayerStore()

const progressValue = computed({
  get: () => (playerStore.currentTime / playerStore.duration) * 100 || 0,
  set: (val) => {
    playerStore.seek((val / 100) * playerStore.duration)
  }
})

const volumeIcon = computed(() => {
  if (playerStore.volume === 0) return 'pi pi-volume-off'
  if (playerStore.volume < 0.5) return 'pi pi-volume-down'
  return 'pi pi-volume-up'
})
</script>

<template>
  <div class="mini-player-wrapper">
    <!-- Full-width progress slider at top -->
    <div class="mini-progress-container" @click.stop>
      <Slider
        v-model="progressValue"
        :step="0.1"
        class="mini-progress-slider"
      />
    </div>

    <div class="mini-player-content" @click="emit('expand')">
      <!-- Left: Cover + Info -->
      <div class="mini-left">
        <div class="mini-cover">
          <img
            v-if="playerStore.currentBook?.cover_url"
            :src="playerStore.currentBook.cover_url"
            :alt="playerStore.currentBook.title"
          />
          <div v-else class="cover-placeholder">
            <i class="pi pi-book"></i>
          </div>
        </div>
        <div class="mini-info">
          <span class="mini-title">{{ playerStore.currentBook?.title }}</span>
          <div class="mini-meta">
            <span class="mini-chapter">
              {{ playerStore.currentChapter?.title || `Chapter ${playerStore.currentChapterIndex + 1}` }}
            </span>
            <span class="mini-separator">•</span>
            <span class="mini-time">
              {{ playerStore.formattedCurrentTime }} / {{ playerStore.formattedDuration }}
            </span>
          </div>
        </div>
      </div>

      <!-- Center: Playback Controls -->
      <div class="mini-controls" @click.stop>
        <Button
          icon="pi pi-replay"
          text
          rounded
          size="small"
          @click="playerStore.seekRelative(-30)"
        />
        <Button
          :icon="playerStore.isPlaying ? 'pi pi-pause' : 'pi pi-play'"
          rounded
          :loading="playerStore.isLoading"
          @click="playerStore.togglePlay"
        />
        <Button
          icon="pi pi-refresh"
          text
          rounded
          size="small"
          @click="playerStore.seekRelative(30)"
        />
      </div>

      <!-- Right: Volume + Expand -->
      <div class="mini-right" @click.stop>
        <div class="mini-volume">
          <Button
            :icon="volumeIcon"
            text
            rounded
            size="small"
            @click="playerStore.setVolume(playerStore.volume === 0 ? 1 : 0)"
          />
          <Slider
            :modelValue="playerStore.volume * 100"
            @update:modelValue="(v) => playerStore.setVolume(v / 100)"
            class="mini-volume-slider"
          />
        </div>
        <Button
          :icon="isExpanded ? 'pi pi-chevron-down' : 'pi pi-chevron-up'"
          text
          rounded
          size="small"
          @click="emit('expand')"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.mini-player-wrapper {
  display: flex;
  flex-direction: column;
  background: var(--surface-card);
  border-top: 1px solid var(--surface-border);
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.1);
}

.mini-player-content {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  cursor: pointer;
}

.mini-left {
  display: flex;
  align-items: center;
  gap: 1rem;
  min-width: 0;
}

.mini-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  justify-content: flex-end;
}

.mini-progress-container {
  position: relative;
  width: 100%;
  padding: 10px 0 6px 0;
  cursor: pointer;
  background: var(--surface-ground);
  transition: padding 0.2s;
}

.mini-progress-container:hover {
  padding: 12px 0 8px 0;
}

.mini-progress-slider {
  width: 100%;
}

.mini-progress-container :deep(.p-slider) {
  height: 4px;
  background: rgba(0, 0, 0, 0.1) !important;
  border-radius: 2px;
  transition: height 0.2s;
}

.mini-progress-container:hover :deep(.p-slider) {
  height: 6px;
}

.mini-progress-container :deep(.p-slider-range) {
  background: #10b981 !important;
  border-radius: 2px;
  height: 100%;
}

.mini-progress-container :deep(.p-slider-handle) {
  width: 14px;
  height: 14px;
  opacity: 1;
  transition: transform 0.2s, box-shadow 0.2s;
  background: white;
  border: none;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.mini-progress-container:hover :deep(.p-slider-handle) {
  transform: scale(1.15);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.mini-cover {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
}

.mini-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mini-cover .cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary-100);
  color: var(--primary-color);
}

.mini-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.mini-title {
  font-weight: 600;
  font-size: 0.95rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: var(--text-color-secondary);
}

.mini-chapter {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
  min-width: 0;
}

.mini-separator {
  flex-shrink: 0;
}

.mini-time {
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.mini-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
}

.mini-volume {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.mini-volume-slider {
  width: 80px;
}

.mini-volume :deep(.p-slider) {
  height: 4px;
  background: rgba(0, 0, 0, 0.1) !important;
  border-radius: 2px;
}

.mini-volume :deep(.p-slider-range) {
  background: #10b981 !important;
  border-radius: 2px;
  height: 100%;
}

.mini-volume :deep(.p-slider-handle) {
  width: 12px;
  height: 12px;
  background: white;
  border: none;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

@media (max-width: 768px) {
  .mini-chapter {
    display: none;
  }

  .mini-separator {
    display: none;
  }
}

@media (max-width: 480px) {
  .mini-controls {
    gap: 0;
  }

  .mini-controls .p-button-text {
    display: none;
  }

  .mini-volume {
    display: none;
  }
}
</style>
