<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import Menubar from 'primevue/menubar'
import Button from 'primevue/button'
import Menu from 'primevue/menu'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const userMenu = ref()

const menuItems = computed(() => {
  const items = [
    {
      label: 'Home',
      icon: 'pi pi-home',
      command: () => router.push('/'),
      class: route.path === '/' ? 'active-route' : ''
    },
    {
      label: 'Library',
      icon: 'pi pi-book',
      command: () => router.push('/library'),
      class: route.path === '/library' ? 'active-route' : ''
    },
    {
      label: 'Series',
      icon: 'pi pi-list',
      command: () => router.push('/series'),
      class: route.path.startsWith('/series') ? 'active-route' : ''
    }
  ]

  if (authStore.isAdmin) {
    items.push({
      label: 'Admin',
      icon: 'pi pi-cog',
      command: () => router.push('/admin'),
      class: route.path.startsWith('/admin') ? 'active-route' : ''
    })
  }

  return items
})

const userMenuItems = computed(() => [
  {
    label: authStore.username,
    items: [
      {
        label: 'Logout',
        icon: 'pi pi-sign-out',
        command: async () => {
          await authStore.logout()
          router.push('/login')
        }
      }
    ]
  }
])

function toggleUserMenu(event) {
  userMenu.value.toggle(event)
}
</script>

<template>
  <div class="navigation">
    <Menubar :model="menuItems" class="nav-menubar">
      <template #start>
        <div class="nav-brand" @click="router.push('/')">
          <i class="pi pi-headphones"></i>
          <span>Audioshelf</span>
        </div>
      </template>

      <template #end>
        <Button
          :label="authStore.username"
          icon="pi pi-user"
          severity="secondary"
          text
          @click="toggleUserMenu"
        />
        <Menu ref="userMenu" :model="userMenuItems" popup />
      </template>
    </Menubar>
  </div>
</template>

<style scoped>
.navigation {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--surface-card);
  border-bottom: 1px solid var(--surface-border);
}

.nav-menubar {
  border: none;
  border-radius: 0;
  background: transparent;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--primary-color);
  cursor: pointer;
  margin-right: 2rem;
}

.nav-brand i {
  font-size: 1.5rem;
}

:deep(.active-route) {
  background: var(--primary-100) !important;
  color: var(--primary-700) !important;
}

@media (max-width: 768px) {
  .nav-brand span {
    display: none;
  }
}
</style>
