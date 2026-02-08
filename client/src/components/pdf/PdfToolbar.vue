<script setup>
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import ToggleButton from 'primevue/togglebutton'
import { usePdfFollowAlongStore } from '../../stores/pdfFollowAlong'

const pdfStore = usePdfFollowAlongStore()

function handlePageInput(event) {
  const page = parseInt(event.target.value)
  if (!isNaN(page)) {
    pdfStore.setPage(page)
  }
}
</script>

<template>
  <div class="pdf-toolbar">
    <div class="toolbar-section">
      <Button
        icon="pi pi-chevron-left"
        severity="secondary"
        text
        rounded
        :disabled="pdfStore.currentPage <= 1"
        @click="pdfStore.previousPage()"
        v-tooltip.bottom="'Previous Page'"
      />

      <div class="page-input">
        <input
          type="number"
          :value="pdfStore.currentPage"
          @change="handlePageInput"
          min="1"
          :max="pdfStore.pdfInfo?.pageCount || 1"
          class="page-number-input"
        />
        <span class="page-total">/ {{ pdfStore.pdfInfo?.pageCount || '?' }}</span>
      </div>

      <Button
        icon="pi pi-chevron-right"
        severity="secondary"
        text
        rounded
        :disabled="pdfStore.currentPage >= (pdfStore.pdfInfo?.pageCount || 1)"
        @click="pdfStore.nextPage()"
        v-tooltip.bottom="'Next Page'"
      />
    </div>

    <div class="toolbar-section">
      <Button
        icon="pi pi-minus"
        severity="secondary"
        text
        rounded
        :disabled="pdfStore.zoom <= 0.5"
        @click="pdfStore.zoomOut()"
        v-tooltip.bottom="'Zoom Out'"
      />

      <span class="zoom-level">{{ Math.round(pdfStore.zoom * 100) }}%</span>

      <Button
        icon="pi pi-plus"
        severity="secondary"
        text
        rounded
        :disabled="pdfStore.zoom >= 3"
        @click="pdfStore.zoomIn()"
        v-tooltip.bottom="'Zoom In'"
      />
    </div>

    <div class="toolbar-section">
      <ToggleButton
        v-model="pdfStore.isFollowModeEnabled"
        onIcon="pi pi-eye"
        offIcon="pi pi-eye-slash"
        onLabel="Follow"
        offLabel="Manual"
        v-tooltip.bottom="pdfStore.isFollowModeEnabled ? 'Auto-follow enabled' : 'Manual navigation'"
      />
    </div>
  </div>
</template>

<style scoped>
.pdf-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  padding: 0.5rem 1rem;
  background: var(--surface-card);
  border-bottom: 1px solid var(--surface-border);
}

.toolbar-section {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.page-input {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.page-number-input {
  width: 50px;
  padding: 0.35rem 0.5rem;
  text-align: center;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  background: var(--surface-ground);
  color: var(--text-color);
  font-size: 0.9rem;
}

.page-number-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.page-total {
  color: var(--text-color-secondary);
  font-size: 0.9rem;
}

.zoom-level {
  min-width: 50px;
  text-align: center;
  font-size: 0.9rem;
  color: var(--text-color-secondary);
}

:deep(.p-togglebutton) {
  font-size: 0.85rem;
}
</style>
