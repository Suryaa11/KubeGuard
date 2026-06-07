import { useCallback, useEffect, useState } from 'react'
import { getReports } from '../services/api'

export const useReports = (projectId) => {
  const [reports, setReports] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await getReports(projectId ? { projectId } : undefined)
      setReports(response.data?.items || response.data || [])
    } catch (err) {
      setError(err.message || 'Unable to load reports.')
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { reports, isLoading, error, refetch }
}
