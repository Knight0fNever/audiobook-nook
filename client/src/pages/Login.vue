<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useToast } from 'primevue/usetoast'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const toast = useToast()

const username = ref('')
const password = ref('')
const loading = ref(false)

async function handleLogin() {
  if (!username.value || !password.value) {
    toast.add({
      severity: 'warn',
      summary: 'Missing Fields',
      detail: 'Please enter username and password',
      life: 3000
    })
    return
  }

  loading.value = true

  try {
    await authStore.login(username.value, password.value)

    const redirect = route.query.redirect || '/'
    router.push(redirect)
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Login Failed',
      detail: error.message || 'Invalid credentials',
      life: 3000
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <Card class="login-card">
      <template #header>
        <div class="login-header">
          <i class="pi pi-headphones"></i>
          <h1>Audioshelf</h1>
        </div>
      </template>

      <template #content>
        <form @submit.prevent="handleLogin" class="login-form">
          <div class="field">
            <label for="username">Username</label>
            <InputText
              id="username"
              v-model="username"
              autocomplete="username"
              :disabled="loading"
              class="w-full"
            />
          </div>

          <div class="field">
            <label for="password">Password</label>
            <Password
              id="password"
              v-model="password"
              :feedback="false"
              toggleMask
              autocomplete="current-password"
              :disabled="loading"
              class="w-full"
              inputClass="w-full"
            />
          </div>

          <Button
            type="submit"
            label="Sign In"
            icon="pi pi-sign-in"
            :loading="loading"
            class="w-full"
          />
        </form>
      </template>
    </Card>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: linear-gradient(135deg, var(--primary-900) 0%, var(--primary-700) 100%);
}

.login-card {
  width: 100%;
  max-width: 400px;
}

.login-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem 1rem 1rem;
  color: var(--primary-color);
}

.login-header i {
  font-size: 3rem;
  margin-bottom: 0.5rem;
}

.login-header h1 {
  margin: 0;
  font-size: 1.75rem;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field label {
  font-weight: 500;
  color: var(--text-color-secondary);
}
</style>
