<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import api from '../../services/api'
import Button from 'primevue/button'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import InputSwitch from 'primevue/inputswitch'

const router = useRouter()
const toast = useToast()

const settings = ref({
  library_path: '',
  scan_schedule: '',
  openlibrary_enabled: false
})
const loading = ref(true)
const saving = ref(false)

onMounted(async () => {
  try {
    const data = await api.getSettings()
    settings.value = {
      library_path: data.library_path || '',
      scan_schedule: data.scan_schedule || '',
      openlibrary_enabled: data.openlibrary_enabled === 'true'
    }
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
      openlibrary_enabled: settings.value.openlibrary_enabled
    })

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
        <template #title>Integrations</template>
        <template #content>
          <div class="form-group inline">
            <div class="switch-group">
              <InputSwitch
                v-model="settings.openlibrary_enabled"
                inputId="openlibrary"
              />
              <label for="openlibrary">OpenLibrary Integration</label>
            </div>
            <small>Fetch additional metadata and cover art from OpenLibrary (optional)</small>
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

.actions {
  display: flex;
  gap: 1rem;
}
</style>
