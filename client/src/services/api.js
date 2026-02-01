const API_BASE = '/api'

class ApiService {
  constructor() {
    this.token = localStorage.getItem('token')
  }

  setToken(token) {
    this.token = token
    if (token) {
      localStorage.setItem('token', token)
    } else {
      localStorage.removeItem('token')
    }
  }

  getHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    }
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }
    return headers
  }

  async request(method, endpoint, data = null, options = {}) {
    const url = `${API_BASE}${endpoint}`
    const config = {
      method,
      headers: this.getHeaders(),
      ...options
    }

    if (data && (method === 'POST' || method === 'PUT')) {
      config.body = JSON.stringify(data)
    }

    const response = await fetch(url, config)

    if (response.status === 401) {
      this.setToken(null)
      window.location.href = '/login'
      throw new Error('Unauthorized')
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }))
      throw new Error(error.message || 'Request failed')
    }

    if (response.status === 204) {
      return null
    }

    return response.json()
  }

  // Auth
  async login(username, password) {
    const data = await this.request('POST', '/auth/login', { username, password })
    this.setToken(data.token)
    return data
  }

  async logout() {
    try {
      await this.request('POST', '/auth/logout')
    } finally {
      this.setToken(null)
    }
  }

  async getCurrentUser() {
    return this.request('GET', '/auth/me')
  }

  async changePassword(currentPassword, newPassword) {
    return this.request('POST', '/auth/change-password', { currentPassword, newPassword })
  }

  // Books
  async getBooks(params = {}) {
    const queryString = new URLSearchParams(params).toString()
    return this.request('GET', `/books${queryString ? `?${queryString}` : ''}`)
  }

  async getBook(id) {
    return this.request('GET', `/books/${id}`)
  }

  async updateBook(id, data) {
    return this.request('PUT', `/books/${id}`, data)
  }

  async getBookChapters(id) {
    return this.request('GET', `/books/${id}/chapters`)
  }

  getStreamUrl(bookId, chapterIndex) {
    return `${API_BASE}/books/${bookId}/stream/${chapterIndex}`
  }

  // Progress
  async getAllProgress() {
    return this.request('GET', '/progress')
  }

  async getRecentProgress(limit = 10) {
    return this.request('GET', `/progress/recent?limit=${limit}`)
  }

  async getBookProgress(bookId) {
    return this.request('GET', `/progress/${bookId}`)
  }

  async updateProgress(bookId, data) {
    return this.request('PUT', `/progress/${bookId}`, data)
  }

  // Series
  async getSeries() {
    return this.request('GET', '/series')
  }

  async getSeriesDetail(id) {
    return this.request('GET', `/series/${id}`)
  }

  async createSeries(data) {
    return this.request('POST', '/series', data)
  }

  async updateSeries(id, data) {
    return this.request('PUT', `/series/${id}`, data)
  }

  async deleteSeries(id) {
    return this.request('DELETE', `/series/${id}`)
  }

  // Stats
  async getStats() {
    return this.request('GET', '/stats')
  }

  // Admin
  async getUsers() {
    return this.request('GET', '/admin/users')
  }

  async createUser(data) {
    return this.request('POST', '/admin/users', data)
  }

  async updateUser(id, data) {
    return this.request('PUT', `/admin/users/${id}`, data)
  }

  async resetUserPassword(id, password) {
    return this.request('PUT', `/admin/users/${id}/password`, { password })
  }

  async deleteUser(id) {
    return this.request('DELETE', `/admin/users/${id}`)
  }

  async triggerLibraryScan() {
    return this.request('POST', '/admin/library/scan')
  }

  async getLibraryStatus() {
    return this.request('GET', '/admin/library/status')
  }

  async getSettings() {
    return this.request('GET', '/admin/settings')
  }

  async updateSettings(data) {
    return this.request('PUT', '/admin/settings', data)
  }

  async deleteBook(id) {
    return this.request('DELETE', `/admin/books/${id}`)
  }

  async enrichBookMetadata(id) {
    return this.request('POST', `/admin/books/${id}/enrich`)
  }

  async searchBookMetadata(id, limit = 5) {
    return this.request('POST', `/admin/books/${id}/search-metadata`, { limit })
  }

  async applyBookMetadata(id, metadata) {
    return this.request('POST', `/admin/books/${id}/apply-metadata`, { metadata })
  }

  async batchEnrichBooks(force = false) {
    return this.request('POST', '/admin/books/batch-enrich', { force })
  }

  async getCacheStats() {
    return this.request('GET', '/admin/metadata/cache-stats')
  }

  async clearMetadataCache() {
    return this.request('DELETE', '/admin/metadata/cache')
  }
}

export const api = new ApiService()
export default api
