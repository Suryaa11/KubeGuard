import { useCallback, useEffect, useState } from 'react'
import { createProject as createProjectApi, deleteProject as deleteProjectApi, getProjects } from '../services/api'
import { useToastStore } from '../store/toastStore'

export const useProjects = () => {
  const [projects, setProjects] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const addToast = useToastStore((state) => state.addToast)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await getProjects()
      setProjects(response.data || [])
    } catch (err) {
      setError(err.message || 'Unable to load projects.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const createProject = async (data) => {
    const response = await createProjectApi(data)
    await refetch()
    return response.data
  }

  const deleteProject = async (id) => {
    if (!window.confirm('Delete this project? This cannot be undone.')) return
    await deleteProjectApi(id)
    addToast({ type: 'success', title: 'Project deleted', message: 'The project has been removed.' })
    await refetch()
  }

  return { projects, isLoading, error, refetch, createProject, deleteProject }
}
