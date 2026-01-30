import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../pages/Login.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    name: 'home',
    component: () => import('../pages/Home.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/library',
    name: 'library',
    component: () => import('../pages/Library.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/book/:id',
    name: 'book-detail',
    component: () => import('../pages/BookDetail.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/series',
    name: 'series-list',
    component: () => import('../pages/SeriesList.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/series/:id',
    name: 'series-detail',
    component: () => import('../pages/SeriesDetail.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('../pages/Admin/AdminDashboard.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/users',
    name: 'admin-users',
    component: () => import('../pages/Admin/UserManagement.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/library',
    name: 'admin-library',
    component: () => import('../pages/Admin/LibraryManagement.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/settings',
    name: 'admin-settings',
    component: () => import('../pages/Admin/Settings.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()

  // Wait for auth check on first load
  if (!authStore.initialized) {
    await authStore.checkAuth()
  }

  const requiresAuth = to.meta.requiresAuth !== false
  const requiresAdmin = to.meta.requiresAdmin === true

  if (requiresAuth && !authStore.isAuthenticated) {
    return next({ name: 'login', query: { redirect: to.fullPath } })
  }

  if (requiresAdmin && !authStore.isAdmin) {
    return next({ name: 'home' })
  }

  if (to.name === 'login' && authStore.isAuthenticated) {
    return next({ name: 'home' })
  }

  next()
})

export default router
