<script setup>
import { computed, onMounted, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { usePlayerStore } from './stores/player'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import AppNavigation from './components/Navigation/AppNavigation.vue'
import ExpandablePlayer from './components/AudioPlayer/ExpandablePlayer.vue'

const route = useRoute()
const authStore = useAuthStore()
const playerStore = usePlayerStore()

const isAuthPage = computed(() => route.name === 'login')
const showPlayer = computed(() => authStore.isAuthenticated && playerStore.currentBook)

onMounted(async () => {
  await authStore.checkAuth()
})

watch(() => authStore.isAuthenticated, (authenticated) => {
  if (!authenticated) {
    playerStore.stop()
  }
})
</script>

<template>
  <Toast position="top-right" />
  <ConfirmDialog />

  <template v-if="!isAuthPage && authStore.isAuthenticated">
    <AppNavigation />
  </template>

  <main :class="{ 'has-mini-player': showPlayer }">
    <RouterView v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </RouterView>
  </main>

  <ExpandablePlayer v-if="showPlayer" />
</template>

<style scoped>
main {
  flex: 1;
  overflow-y: auto;
}
</style>
