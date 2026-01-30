<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import api from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Dropdown from 'primevue/dropdown'
import Tag from 'primevue/tag'

const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const authStore = useAuthStore()

const users = ref([])
const loading = ref(true)
const showDialog = ref(false)
const editMode = ref(false)
const formLoading = ref(false)

const formData = ref({
  id: null,
  username: '',
  password: '',
  role: 'user'
})

const roleOptions = [
  { label: 'User', value: 'user' },
  { label: 'Admin', value: 'admin' }
]

onMounted(async () => {
  await loadUsers()
})

async function loadUsers() {
  loading.value = true
  try {
    users.value = await api.getUsers()
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to load users',
      life: 3000
    })
  } finally {
    loading.value = false
  }
}

function openCreateDialog() {
  formData.value = {
    id: null,
    username: '',
    password: '',
    role: 'user'
  }
  editMode.value = false
  showDialog.value = true
}

function openEditDialog(user) {
  formData.value = {
    id: user.id,
    username: user.username,
    password: '',
    role: user.role
  }
  editMode.value = true
  showDialog.value = true
}

async function saveUser() {
  if (!formData.value.username) {
    toast.add({
      severity: 'warn',
      summary: 'Validation',
      detail: 'Username is required',
      life: 3000
    })
    return
  }

  if (!editMode.value && !formData.value.password) {
    toast.add({
      severity: 'warn',
      summary: 'Validation',
      detail: 'Password is required',
      life: 3000
    })
    return
  }

  formLoading.value = true

  try {
    if (editMode.value) {
      await api.updateUser(formData.value.id, {
        username: formData.value.username,
        role: formData.value.role
      })

      if (formData.value.password) {
        await api.resetUserPassword(formData.value.id, formData.value.password)
      }

      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: 'User updated',
        life: 3000
      })
    } else {
      await api.createUser({
        username: formData.value.username,
        password: formData.value.password,
        role: formData.value.role
      })

      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: 'User created',
        life: 3000
      })
    }

    showDialog.value = false
    await loadUsers()
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: error.message || 'Failed to save user',
      life: 3000
    })
  } finally {
    formLoading.value = false
  }
}

function confirmDelete(user) {
  confirm.require({
    message: `Are you sure you want to delete "${user.username}"?`,
    header: 'Delete User',
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await api.deleteUser(user.id)
        toast.add({
          severity: 'success',
          summary: 'Success',
          detail: 'User deleted',
          life: 3000
        })
        await loadUsers()
      } catch (error) {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Failed to delete user',
          life: 3000
        })
      }
    }
  })
}

function formatListeningTime(seconds) {
  if (!seconds) return '0h'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}
</script>

<template>
  <div class="users-page container">
    <div class="page-header">
      <div class="header-left">
        <Button
          icon="pi pi-arrow-left"
          text
          rounded
          @click="router.push('/admin')"
        />
        <h1 class="page-title">User Management</h1>
      </div>
      <Button
        label="Add User"
        icon="pi pi-plus"
        @click="openCreateDialog"
      />
    </div>

    <DataTable
      :value="users"
      :loading="loading"
      responsiveLayout="scroll"
      stripedRows
    >
      <Column field="username" header="Username" />
      <Column field="role" header="Role">
        <template #body="{ data }">
          <Tag
            :value="data.role"
            :severity="data.role === 'admin' ? 'danger' : 'info'"
          />
        </template>
      </Column>
      <Column header="Stats">
        <template #body="{ data }">
          <div class="user-stats">
            <span>{{ formatListeningTime(data.stats.total_listening_seconds) }}</span>
            <span class="separator">|</span>
            <span>{{ data.stats.books_completed }} completed</span>
          </div>
        </template>
      </Column>
      <Column header="Actions" style="width: 150px">
        <template #body="{ data }">
          <div class="actions">
            <Button
              icon="pi pi-pencil"
              text
              rounded
              @click="openEditDialog(data)"
            />
            <Button
              icon="pi pi-trash"
              text
              rounded
              severity="danger"
              :disabled="data.id === authStore.user?.id"
              @click="confirmDelete(data)"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <!-- User Dialog -->
    <Dialog
      v-model:visible="showDialog"
      :header="editMode ? 'Edit User' : 'Create User'"
      :style="{ width: '400px' }"
      modal
    >
      <div class="dialog-form">
        <div class="field">
          <label for="username">Username</label>
          <InputText
            id="username"
            v-model="formData.username"
            class="w-full"
          />
        </div>

        <div class="field">
          <label for="password">
            {{ editMode ? 'New Password (leave blank to keep current)' : 'Password' }}
          </label>
          <Password
            id="password"
            v-model="formData.password"
            :feedback="false"
            toggleMask
            class="w-full"
            inputClass="w-full"
          />
        </div>

        <div class="field">
          <label for="role">Role</label>
          <Dropdown
            id="role"
            v-model="formData.role"
            :options="roleOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
          />
        </div>
      </div>

      <template #footer>
        <Button
          label="Cancel"
          severity="secondary"
          @click="showDialog = false"
        />
        <Button
          :label="editMode ? 'Update' : 'Create'"
          :loading="formLoading"
          @click="saveUser"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.users-page {
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

.user-stats {
  font-size: 0.85rem;
  color: var(--text-color-secondary);
}

.separator {
  margin: 0 0.5rem;
}

.actions {
  display: flex;
  gap: 0.25rem;
}

.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field label {
  font-weight: 500;
}
</style>
