import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../services/api'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const initialized = ref(false)

  const isAuthenticated = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const username = computed(() => user.value?.username || '')

  async function login(usernameInput, password) {
    const data = await api.login(usernameInput, password)
    user.value = data.user
    return data
  }

  async function logout() {
    try {
      await api.logout()
    } finally {
      user.value = null
    }
  }

  async function checkAuth() {
    const token = localStorage.getItem('token')
    if (!token) {
      initialized.value = true
      return false
    }

    try {
      const userData = await api.getCurrentUser()
      user.value = userData
      initialized.value = true
      return true
    } catch (error) {
      user.value = null
      initialized.value = true
      return false
    }
  }

  async function changePassword(currentPassword, newPassword) {
    return api.changePassword(currentPassword, newPassword)
  }

  return {
    user,
    initialized,
    isAuthenticated,
    isAdmin,
    username,
    login,
    logout,
    checkAuth,
    changePassword
  }
})
