<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import api from '../../services/api'
import Button from 'primevue/button'
import Card from 'primevue/card'
import ProgressBar from 'primevue/progressbar'
import Message from 'primevue/message'

const router = useRouter()
const toast = useToast()

const status = ref(null)
const loading = ref(true)
const enriching = ref(false)
const cacheStats = ref(null)
let pollInterval = null

onMounted(async () => {
  await loadStatus()
  await loadCacheStats()
  startPolling()
})

onUnmounted(() => {
  stopPolling()
})

async function loadStatus() {
  const wasScanning = status.value?.scan.scanning
  try {
    status.value = await api.getLibraryStatus()

    // If scan just finished, show completion message
    if (wasScanning && !status.value.scan.scanning) {
      toast.add({
        severity: 'success',
        summary: 'Scan Complete',
        detail: `Added: ${status.value.scan.results.added}, Updated: ${status.value.scan.results.updated}, Removed: ${status.value.scan.results.removed}`,
        life: 5000
      })
    }
  } catch (error) {
    console.error('Failed to load status:', error)
  } finally {
    loading.value = false
  }
}

function startPolling() {
  pollInterval = setInterval(async () => {
    if (status.value?.scan.scanning) {
      await loadStatus()
    }
  }, 2000)
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}

async function triggerScan() {
  try {
    await api.triggerLibraryScan()
    toast.add({
      severity: 'info',
      summary: 'Scan Started',
      detail: 'Library scan has started',
      life: 3000
    })
    await loadStatus()
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: error.message || 'Failed to start scan',
      life: 3000
    })
  }
}

async function batchEnrich() {
  enriching.value = true
  try {
    const result = await api.batchEnrichBooks(false)
    toast.add({
      severity: 'success',
      summary: 'Enrichment Started',
      detail: `Enriching ${result.total} books`,
      life: 5000
    })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: error.message || 'Failed to start enrichment',
      life: 3000
    })
  } finally {
    enriching.value = false
  }
}

async function loadCacheStats() {
  try {
    cacheStats.value = await api.getCacheStats()
  } catch (error) {
    console.error('Failed to load cache stats:', error)
  }
}

async function clearCache() {
  try {
    await api.clearMetadataCache()
    toast.add({
      severity: 'success',
      summary: 'Cache Cleared',
      detail: 'API metadata cache has been cleared',
      life: 3000
    })
    await loadCacheStats()
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: error.message || 'Failed to clear cache',
      life: 3000
    })
  }
}
</script>

<template>
  <div class="library-management container">
    <div class="page-header">
      <div class="header-left">
        <Button
          icon="pi pi-arrow-left"
          text
          rounded
          @click="router.push('/admin')"
        />
        <h1 class="page-title">Library Management</h1>
      </div>
    </div>

    <div class="content-grid">
      <!-- Library Stats -->
      <Card>
        <template #title>Library Statistics</template>
        <template #content>
          <div v-if="status" class="stats-grid">
            <div class="stat-item">
              <span class="stat-value">{{ status.library.book_count }}</span>
              <span class="stat-label">Books</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ status.library.chapter_count }}</span>
              <span class="stat-label">Chapters</span>
            </div>
          </div>

          <div class="library-path">
            <label>Library Path</label>
            <code>{{ status?.library.path }}</code>
          </div>
        </template>
      </Card>

      <!-- Scan Control -->
      <Card>
        <template #title>Library Scan</template>
        <template #content>
          <div v-if="status?.scan.scanning" class="scan-progress">
            <Message severity="info" :closable="false">
              <template #messageicon>
                <i class="pi pi-spin pi-spinner"></i>
              </template>
              Scanning library...
            </Message>

            <div class="scan-details">
              <p>Processing: {{ status.scan.current }}</p>
              <p>Progress: {{ status.scan.progress }} / {{ status.scan.total }}</p>
              <ProgressBar
                :value="(status.scan.progress / status.scan.total) * 100"
              />
            </div>
          </div>

          <div v-else class="scan-idle">
            <p v-if="status?.scan.lastScan" class="last-scan">
              Last scan: {{ new Date(status.scan.lastScan).toLocaleString() }}
            </p>
            <p v-else class="last-scan">No previous scan recorded</p>

            <div v-if="status?.scan.results" class="scan-results">
              <p>Last scan results:</p>
              <ul>
                <li>Added: {{ status.scan.results.added }}</li>
                <li>Updated: {{ status.scan.results.updated }}</li>
                <li>Removed: {{ status.scan.results.removed }}</li>
              </ul>
            </div>

            <div v-if="status?.scan.enrichment?.enabled" class="enrichment-results">
              <p>Enrichment results:</p>
              <ul>
                <li>Succeeded: {{ status.scan.enrichment.succeeded }}</li>
                <li>Failed: {{ status.scan.enrichment.failed }}</li>
              </ul>
            </div>

            <Button
              label="Scan Now"
              icon="pi pi-refresh"
              @click="triggerScan"
            />
          </div>

          <div v-if="status?.scan.errors?.length > 0" class="scan-errors">
            <h4>Errors ({{ status.scan.errors.length }})</h4>
            <div
              v-for="(error, i) in status.scan.errors.slice(0, 5)"
              :key="i"
              class="error-item"
            >
              <code>{{ error.folder }}</code>
              <span>{{ error.error }}</span>
            </div>
          </div>
        </template>
      </Card>

      <!-- Metadata Enrichment -->
      <Card>
        <template #title>API Metadata Enrichment</template>
        <template #content>
          <div class="enrichment-section">
            <p class="section-description">
              Enrich book metadata using Open Library and Google Books APIs.
              This adds ISBNs, publishers, descriptions, and cover images.
            </p>

            <div class="enrichment-actions">
              <Button
                label="Enrich All Books"
                icon="pi pi-sync"
                :loading="enriching"
                @click="batchEnrich"
              />
            </div>

            <div v-if="cacheStats" class="cache-stats">
              <h4>Cache Statistics</h4>
              <div class="stats-grid">
                <div class="stat-item">
                  <span class="stat-value">{{ cacheStats.valid }}</span>
                  <span class="stat-label">Cached Entries</span>
                </div>
                <div class="stat-item">
                  <span class="stat-value">{{ cacheStats.expired }}</span>
                  <span class="stat-label">Expired</span>
                </div>
              </div>
              <Button
                label="Clear Cache"
                icon="pi pi-trash"
                severity="secondary"
                size="small"
                @click="clearCache"
              />
            </div>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.library-management {
  padding: 1.5rem 1rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.header-left .page-title {
  margin: 0;
}

.content-grid {
  display: grid;
  gap: 1.5rem;
}

.stats-grid {
  display: flex;
  gap: 2rem;
  margin-bottom: 1.5rem;
}

.stat-item {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--primary-color);
}

.stat-label {
  color: var(--text-color-secondary);
}

.library-path {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.library-path label {
  font-weight: 500;
  color: var(--text-color-secondary);
}

.library-path code {
  background: var(--surface-200);
  padding: 0.5rem 1rem;
  border-radius: 4px;
  font-size: 0.9rem;
  word-break: break-all;
}

.scan-progress {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.scan-details {
  background: var(--surface-100);
  padding: 1rem;
  border-radius: 8px;
}

.scan-details p {
  margin: 0 0 0.5rem;
}

.scan-idle {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.last-scan {
  color: var(--text-color-secondary);
  margin: 0;
}

.scan-results {
  background: var(--surface-100);
  padding: 1rem;
  border-radius: 8px;
}

.scan-results p {
  margin: 0 0 0.5rem;
  font-weight: 500;
}

.scan-results ul {
  margin: 0;
  padding-left: 1.5rem;
}

.enrichment-results {
  background: var(--surface-100);
  padding: 1rem;
  border-radius: 8px;
  margin-top: 0.5rem;
}

.enrichment-results p {
  margin: 0 0 0.5rem;
  font-weight: 500;
}

.enrichment-results ul {
  margin: 0;
  padding-left: 1.5rem;
}

.enrichment-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-description {
  color: var(--text-color-secondary);
  margin: 0;
}

.enrichment-actions {
  display: flex;
  gap: 1rem;
}

.cache-stats {
  background: var(--surface-100);
  padding: 1rem;
  border-radius: 8px;
}

.cache-stats h4 {
  margin: 0 0 1rem;
}

.scan-errors {
  margin-top: 1.5rem;
  padding: 1rem;
  background: var(--red-50);
  border-radius: 8px;
}

.scan-errors h4 {
  margin: 0 0 0.5rem;
  color: var(--red-700);
}

.error-item {
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

.error-item code {
  display: block;
  color: var(--red-700);
  word-break: break-all;
}

.error-item span {
  color: var(--text-color-secondary);
}
</style>
