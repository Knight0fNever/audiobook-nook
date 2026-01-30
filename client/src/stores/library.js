import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../services/api'

export const useLibraryStore = defineStore('library', () => {
  // State
  const books = ref([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref(null)

  // Filters
  const searchQuery = ref('')
  const filterStatus = ref('')
  const filterAuthor = ref('')
  const filterSeries = ref('')
  const sortBy = ref('title')
  const sortOrder = ref('asc')
  const viewMode = ref(localStorage.getItem('library-view') || 'grid')

  // Pagination
  const page = ref(1)
  const limit = ref(50)

  // Computed
  const offset = computed(() => (page.value - 1) * limit.value)
  const totalPages = computed(() => Math.ceil(total.value / limit.value))

  const authors = computed(() => {
    const authorSet = new Set()
    books.value.forEach(book => {
      if (book.author) authorSet.add(book.author)
    })
    return Array.from(authorSet).sort()
  })

  // Methods
  async function fetchBooks() {
    loading.value = true
    error.value = null

    try {
      const params = {
        limit: limit.value,
        offset: offset.value,
        sort: sortBy.value,
        order: sortOrder.value
      }

      if (searchQuery.value) params.search = searchQuery.value
      if (filterStatus.value) params.status = filterStatus.value
      if (filterAuthor.value) params.author = filterAuthor.value
      if (filterSeries.value) params.series = filterSeries.value

      const response = await api.getBooks(params)
      books.value = response.books
      total.value = response.total
    } catch (err) {
      error.value = err.message
      console.error('Failed to fetch books:', err)
    } finally {
      loading.value = false
    }
  }

  function setViewMode(mode) {
    viewMode.value = mode
    localStorage.setItem('library-view', mode)
  }

  function setSort(field, order = 'asc') {
    sortBy.value = field
    sortOrder.value = order
    page.value = 1
    fetchBooks()
  }

  function setSearch(query) {
    searchQuery.value = query
    page.value = 1
    fetchBooks()
  }

  function setFilter(type, value) {
    if (type === 'status') filterStatus.value = value
    if (type === 'author') filterAuthor.value = value
    if (type === 'series') filterSeries.value = value
    page.value = 1
    fetchBooks()
  }

  function clearFilters() {
    searchQuery.value = ''
    filterStatus.value = ''
    filterAuthor.value = ''
    filterSeries.value = ''
    page.value = 1
    fetchBooks()
  }

  function setPage(newPage) {
    page.value = newPage
    fetchBooks()
  }

  return {
    // State
    books,
    total,
    loading,
    error,
    searchQuery,
    filterStatus,
    filterAuthor,
    filterSeries,
    sortBy,
    sortOrder,
    viewMode,
    page,
    limit,

    // Computed
    offset,
    totalPages,
    authors,

    // Methods
    fetchBooks,
    setViewMode,
    setSort,
    setSearch,
    setFilter,
    clearFilters,
    setPage
  }
})
