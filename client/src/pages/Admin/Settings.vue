<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import api from '../../services/api'
import Button from 'primevue/button'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import InputSwitch from 'primevue/inputswitch'
import Dropdown from 'primevue/dropdown'
import Tag from 'primevue/tag'

const router = useRouter()
const toast = useToast()

const settings = ref({
  library_path: '',
  scan_schedule: '',
  openlibrary_enabled: false,
  api_enrichment_enabled: true,
  api_enrichment_prefer_api_covers: true,
  api_enrichment_rate_limit_delay: '600',
  google_books_api_key: '',
  transcription_backend: 'auto',
  transcription_model: 'base.en',
  transcription_language: 'en'
})
const loading = ref(true)
const saving = ref(false)
const transcriptionStatus = ref(null)

const backendOptions = [
  { label: 'Auto-Detect (Recommended)', value: 'auto' },
  { label: 'Metal (macOS Apple Silicon)', value: 'metal' },
  { label: 'CUDA (NVIDIA GPU)', value: 'cuda' },
  { label: 'Vulkan (Cross-platform GPU)', value: 'vulkan' },
  { label: 'CPU Only', value: 'cpu' }
]

const modelOptions = [
  { label: 'tiny (~75MB, fastest)', value: 'tiny' },
  { label: 'tiny.en (~75MB, fastest, English only)', value: 'tiny.en' },
  { label: 'base (~142MB, fast)', value: 'base' },
  { label: 'base.en (~142MB, fast, English only)', value: 'base.en' },
  { label: 'small (~466MB, balanced)', value: 'small' },
  { label: 'small.en (~466MB, balanced, English only)', value: 'small.en' },
  { label: 'medium (~1.5GB, accurate)', value: 'medium' },
  { label: 'medium.en (~1.5GB, accurate, English only)', value: 'medium.en' },
  { label: 'large (~2.9GB, most accurate)', value: 'large-v3' }
]

const languageOptions = [
  { label: 'English', value: 'en' },
  { label: 'Auto-Detect', value: 'auto' },
  { label: 'Spanish', value: 'es' },
  { label: 'French', value: 'fr' },
  { label: 'German', value: 'de' },
  { label: 'Italian', value: 'it' },
  { label: 'Portuguese', value: 'pt' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Chinese', value: 'zh' },
  { label: 'Korean', value: 'ko' },
  { label: 'Russian', value: 'ru' }
]

onMounted(async () => {
  try {
    const [data, txStatus] = await Promise.all([
      api.getSettings(),
      api.getTranscriptionStatus().catch(() => null)
    ])
    settings.value = {
      library_path: data.library_path || '',
      scan_schedule: data.scan_schedule || '',
      openlibrary_enabled: data.openlibrary_enabled === 'true',
      api_enrichment_enabled: data.api_enrichment_enabled !== 'false',
      api_enrichment_prefer_api_covers: data.api_enrichment_prefer_api_covers !== 'false',
      api_enrichment_rate_limit_delay: data.api_enrichment_rate_limit_delay || '600',
      google_books_api_key: data.google_books_api_key || '',
      transcription_backend: data.transcription_backend || 'auto',
      transcription_model: data.transcription_model || 'base.en',
      transcription_language: data.transcription_language || 'en'
    }
    transcriptionStatus.value = txStatus
  } catch (error) {
    console.error('Failed to load settings:', error)
  } finally {
    loading.value = false
  }
})

async function saveSettings() {
  saving.value = true

  try {
    await api.updateSettings({
      library_path: settings.value.library_path,
      scan_schedule: settings.value.scan_schedule,
      openlibrary_enabled: settings.value.openlibrary_enabled,
      api_enrichment_enabled: settings.value.api_enrichment_enabled,
      api_enrichment_prefer_api_covers: settings.value.api_enrichment_prefer_api_covers,
      api_enrichment_rate_limit_delay: settings.value.api_enrichment_rate_limit_delay,
      google_books_api_key: settings.value.google_books_api_key,
      transcription_backend: settings.value.transcription_backend,
      transcription_model: settings.value.transcription_model,
      transcription_language: settings.value.transcription_language
    })

    // Refresh transcription status after save (backend may have changed)
    transcriptionStatus.value = await api.getTranscriptionStatus().catch(() => null)

    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Settings saved',
      life: 3000
    })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: error.message || 'Failed to save settings',
      life: 3000
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="settings-page container">
    <div class="page-header">
      <div class="header-left">
        <Button
          icon="pi pi-arrow-left"
          text
          rounded
          @click="router.push('/admin')"
        />
        <h1 class="page-title">Settings</h1>
      </div>
    </div>

    <div class="settings-content">
      <Card>
        <template #title>Library Settings</template>
        <template #content>
          <div class="form-group">
            <label for="library_path">Library Path</label>
            <InputText
              id="library_path"
              v-model="settings.library_path"
              class="w-full"
              placeholder="/path/to/audiobooks"
            />
            <small>The root folder containing your audiobooks (Author/BookTitle structure)</small>
          </div>

          <div class="form-group">
            <label for="scan_schedule">Scan Schedule (cron expression)</label>
            <InputText
              id="scan_schedule"
              v-model="settings.scan_schedule"
              class="w-full"
              placeholder="0 0 * * *"
            />
            <small>Leave empty to disable scheduled scans. Example: "0 0 * * *" for daily at midnight</small>
          </div>
        </template>
      </Card>

      <Card>
        <template #title>
          <div class="card-title-row">
            <span>Transcription</span>
            <Tag
              v-if="transcriptionStatus"
              :value="transcriptionStatus.backend?.toUpperCase() || 'UNKNOWN'"
              :severity="transcriptionStatus.gpu ? 'success' : transcriptionStatus.available ? 'info' : 'danger'"
            />
          </div>
        </template>
        <template #content>
          <div v-if="transcriptionStatus" class="status-info">
            <small>
              Platform: {{ transcriptionStatus.platform }}
              &bull; GPU: {{ transcriptionStatus.gpu ? 'Enabled' : 'Disabled' }}
              &bull; Model: {{ transcriptionStatus.modelDownloaded ? 'Downloaded' : 'Not downloaded (will download on first use)' }}
            </small>
          </div>

          <div class="form-group">
            <label for="transcription_backend">Backend</label>
            <Dropdown
              id="transcription_backend"
              v-model="settings.transcription_backend"
              :options="backendOptions"
              optionLabel="label"
              optionValue="value"
              class="w-full"
            />
            <small>Select the compute backend for audio transcription. Auto-detect picks the best option for your system.</small>
          </div>

          <div class="form-group">
            <label for="transcription_model">Model</label>
            <Dropdown
              id="transcription_model"
              v-model="settings.transcription_model"
              :options="modelOptions"
              optionLabel="label"
              optionValue="value"
              class="w-full"
            />
            <small>Larger models are more accurate but slower and require more memory. Models download automatically on first use.</small>
          </div>

          <div class="form-group">
            <label for="transcription_language">Language</label>
            <Dropdown
              id="transcription_language"
              v-model="settings.transcription_language"
              :options="languageOptions"
              optionLabel="label"
              optionValue="value"
              class="w-full"
            />
            <small>Language of your audiobooks. Use Auto-Detect for mixed-language libraries.</small>
          </div>
        </template>
      </Card>

      <Card>
        <template #title>API Metadata Enrichment</template>
        <template #content>
          <div class="form-group inline">
            <div class="switch-group">
              <InputSwitch
                v-model="settings.api_enrichment_enabled"
                inputId="enrichment_enabled"
              />
              <label for="enrichment_enabled">Enable API Enrichment During Scan</label>
            </div>
            <small>Automatically enrich metadata using Open Library and Google Books APIs during library scans</small>
          </div>

          <div class="form-group inline">
            <div class="switch-group">
              <InputSwitch
                v-model="settings.api_enrichment_prefer_api_covers"
                inputId="prefer_api_covers"
              />
              <label for="prefer_api_covers">Prefer API Cover Images</label>
            </div>
            <small>Show API-provided covers instead of local covers when available</small>
          </div>

          <div class="form-group">
            <label for="rate_limit_delay">Rate Limit Delay (ms)</label>
            <InputText
              id="rate_limit_delay"
              v-model="settings.api_enrichment_rate_limit_delay"
              class="w-full"
              placeholder="600"
              type="number"
            />
            <small>Delay between API requests in milliseconds (default: 600ms)</small>
          </div>

          <div class="form-group">
            <label for="google_books_key">Google Books API Key (optional)</label>
            <InputText
              id="google_books_key"
              v-model="settings.google_books_api_key"
              class="w-full"
              placeholder="Enter API key"
              type="password"
            />
            <small>Optional API key for Google Books. Increases rate limits.</small>
          </div>
        </template>
      </Card>

      <Card>
        <template #title>Legacy Integrations</template>
        <template #content>
          <div class="form-group inline">
            <div class="switch-group">
              <InputSwitch
                v-model="settings.openlibrary_enabled"
                inputId="openlibrary"
              />
              <label for="openlibrary">OpenLibrary Integration (Legacy)</label>
            </div>
            <small>Old integration - use API Enrichment instead</small>
          </div>
        </template>
      </Card>

      <div class="actions">
        <Button
          label="Save Settings"
          icon="pi pi-save"
          :loading="saving"
          @click="saveSettings"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
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

.settings-content {
  max-width: 600px;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  font-weight: 500;
  margin-bottom: 0.5rem;
}

.form-group small {
  display: block;
  color: var(--text-color-secondary);
  margin-top: 0.25rem;
}

.form-group.inline {
  display: flex;
  flex-direction: column;
}

.switch-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.switch-group label {
  margin: 0;
  font-weight: 500;
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.status-info {
  margin-bottom: 1.25rem;
  padding: 0.5rem 0.75rem;
  background: var(--surface-ground);
  border-radius: var(--border-radius);
}

.status-info small {
  color: var(--text-color-secondary);
}

.actions {
  display: flex;
  gap: 1rem;
}
</style>
