<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import MiniPlayerContent from './MiniPlayerContent.vue'
import FullPlayerContent from './FullPlayerContent.vue'

const route = useRoute()
const isExpanded = ref(false)

function toggleExpanded() {
  isExpanded.value = !isExpanded.value
}

function handleBackdropClick() {
  isExpanded.value = false
}

function handleEscKey(event) {
  if (event.key === 'Escape' && isExpanded.value) {
    isExpanded.value = false
  }
}

// Auto-collapse when navigating to different page
watch(() => route.path, () => {
  if (isExpanded.value) {
    isExpanded.value = false
  }
})

onMounted(() => {
  window.addEventListener('keydown', handleEscKey)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleEscKey)
})
</script>

<template>
  <div class="expandable-player">
    <!-- Backdrop -->
    <Transition name="backdrop-fade">
      <div v-if="isExpanded" class="player-backdrop" @click="handleBackdropClick"></div>
    </Transition>

    <!-- Mini Player (slides away when expanded) -->
    <Transition name="mini-slide">
      <MiniPlayerContent v-if="!isExpanded" :is-expanded="false" @expand="toggleExpanded" />
    </Transition>

    <!-- Full Player Container (slides up like a drawer) -->
    <Transition name="drawer">
      <div v-if="isExpanded" class="player-container-expanded">
        <FullPlayerContent @collapse="toggleExpanded" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.expandable-player {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1000;
}

.player-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
}

.player-container-expanded {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--app-bg);
  z-index: 1000;
}

/* Backdrop fade transitions */
.backdrop-fade-enter-active,
.backdrop-fade-leave-active {
  transition: opacity 0.3s ease;
}

.backdrop-fade-enter-from,
.backdrop-fade-leave-to {
  opacity: 0;
}

/* Drawer slide-up transitions */
.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.drawer-enter-from,
.drawer-leave-to {
  transform: translateY(calc(100vh - 90px));
}

/* Mini player slide-down transitions */
.mini-slide-enter-active,
.mini-slide-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.mini-slide-enter-from,
.mini-slide-leave-to {
  transform: translateY(100%);
}
</style>
