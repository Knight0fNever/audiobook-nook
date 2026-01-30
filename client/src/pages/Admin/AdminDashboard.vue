<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../../services/api'
import Card from 'primevue/card'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'

const router = useRouter()

const libraryStatus = ref(null)
const users = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    const [status, usersData] = await Promise.all([
      api.getLibraryStatus(),
      api.getUsers()
    ])
    libraryStatus.value = status
    users.value = usersData
  } catch (error) {
    console.error('Failed to load admin data:', error)
  } finally {
    loading.value = false
  }
})

async function triggerScan() {
  try {
    await api.triggerLibraryScan()

    // Start polling for scan completion
    const pollInterval = setInterval(async () => {
      const status = await api.getLibraryStatus()
      libraryStatus.value = status

      if (!status.scan.scanning) {
        clearInterval(pollInterval)
      }
    }, 2000)
  } catch (error) {
    console.error('Failed to trigger scan:', error)
  }
}
</script>

<template>
  <div class="admin-page container">
    <div class="page-header">
      <h1 class="page-title">Admin Dashboard</h1>
    </div>

    <div class="admin-grid">
      <!-- Library Status -->
      <Card>
        <template #title>
          <div class="card-title">
            <i class="pi pi-book"></i>
            Library
          </div>
        </template>
        <template #content>
          <div v-if="libraryStatus" class="stats-list">
            <div class="stat-row">
              <span>Books</span>
              <strong>{{ libraryStatus.library.book_count }}</strong>
            </div>
            <div class="stat-row">
              <span>Chapters</span>
              <strong>{{ libraryStatus.library.chapter_count }}</strong>
            </div>
            <div class="stat-row">
              <span>Library Path</span>
              <code>{{ libraryStatus.library.path }}</code>
            </div>

            <div v-if="libraryStatus.scan.scanning" class="scan-status">
              <p>Scanning: {{ libraryStatus.scan.current }}</p>
              <ProgressBar
                :value="(libraryStatus.scan.progress / libraryStatus.scan.total) * 100"
                :showValue="true"
              />
            </div>
          </div>

          <div class="card-actions">
            <Button
              label="Scan Library"
              icon="pi pi-refresh"
              :loading="libraryStatus?.scan.scanning"
              @click="triggerScan"
            />
            <Button
              label="Manage"
              icon="pi pi-cog"
              severity="secondary"
              @click="router.push('/admin/library')"
            />
          </div>
        </template>
      </Card>

      <!-- Users -->
      <Card>
        <template #title>
          <div class="card-title">
            <i class="pi pi-users"></i>
            Users
          </div>
        </template>
        <template #content>
          <div class="stats-list">
            <div class="stat-row">
              <span>Total Users</span>
              <strong>{{ users.length }}</strong>
            </div>
            <div class="stat-row">
              <span>Admins</span>
              <strong>{{ users.filter(u => u.role === 'admin').length }}</strong>
            </div>
          </div>

          <div class="card-actions">
            <Button
              label="Manage Users"
              icon="pi pi-user-edit"
              @click="router.push('/admin/users')"
            />
          </div>
        </template>
      </Card>

      <!-- Settings -->
      <Card>
        <template #title>
          <div class="card-title">
            <i class="pi pi-cog"></i>
            Settings
          </div>
        </template>
        <template #content>
          <p class="text-secondary">Configure application settings, scan schedules, and integrations.</p>

          <div class="card-actions">
            <Button
              label="Settings"
              icon="pi pi-cog"
              @click="router.push('/admin/settings')"
            />
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.admin-page {
  padding: 1.5rem 1rem;
}

.admin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.card-title i {
  color: var(--primary-color);
}

.stats-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-row code {
  font-size: 0.8rem;
  background: var(--surface-200);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.scan-status {
  padding: 1rem;
  background: var(--surface-100);
  border-radius: 8px;
  margin-top: 1rem;
}

.scan-status p {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
}

.card-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.text-secondary {
  color: var(--text-color-secondary);
  margin-bottom: 1.5rem;
}
</style>
