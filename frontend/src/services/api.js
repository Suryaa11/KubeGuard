import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { useToastStore } from '../store/toastStore'

export const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState()
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      const normalizedError = new Error('Cannot connect to server. Check your connection.')
      normalizedError.isNetworkError = true
      throw normalizedError
    }

    if (error.response.status === 401) {
      useAuthStore.getState().clearAuth()
      useToastStore.getState().addToast({
        type: 'warning',
        title: 'Session expired',
        message: 'Please sign in again to continue.',
      })
      if (typeof window !== 'undefined') {
        window.location.pathname = '/'
      }
    }

    throw error
  }
)

export const verifyToken = (accessToken) =>
  api.post(
    '/auth/token',
    {},
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

export const getProjects = () => api.get('/projects')
export const getProject = (id) => api.get(`/projects/${id}`)
export const createProject = (data) => api.post('/projects', data)
export const updateProject = (id, data) => api.put(`/projects/${id}`, data)
export const deleteProject = (id) => api.delete(`/projects/${id}`)
export const getProjectStatus = (id) => api.get(`/projects/${id}/status`)

export const getEvents = (projectId, params = {}) => api.get('/events', { params: { projectId, ...params } })
export const getEvent = (id) => api.get(`/events/${id}`)

export const getReport = (eventId) => api.get(`/reports/${eventId}`)
export const getReports = (params) => api.get('/reports', { params })
export const decideReport = (id, data) => api.post('/notify/decide', { reportId: id, ...data })

export const getDecisions = () => api.get('/notify/decisions')
