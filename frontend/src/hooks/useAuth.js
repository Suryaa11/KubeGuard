import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { msalInstance, msalInitPromise, loginRequest } from '../auth/msalConfig'
import { verifyToken } from '../services/api'
import { useAuthStore } from '../store/authStore'

export const useAuth = () => {
  const { setAuth, clearAuth, setLoading } = useAuthStore()
  const location = useLocation()

  useEffect(() => {
    // If we're on the callback page, do nothing.
    // AuthCallback.jsx owns that route entirely.
    if (location.pathname === '/auth/callback') return

    const tryRestoreSession = async () => {
      try {
        await msalInitPromise

        // Handle any pending redirect first (e.g. if user lands on / after redirect)
        const redirectResult = await msalInstance.handleRedirectPromise()
        if (redirectResult?.accessToken) {
          const response = await verifyToken(redirectResult.accessToken)
          setAuth(response.data, redirectResult.accessToken)
          return
        }

        // No redirect — try silent token from existing session
        const accounts = msalInstance.getAllAccounts()
        if (accounts.length === 0) {
          clearAuth()
          return
        }

        msalInstance.setActiveAccount(accounts[0])
        const silentResult = await msalInstance.acquireTokenSilent({
          ...loginRequest,
          account: accounts[0],
        })
        const response = await verifyToken(silentResult.accessToken)
        setAuth(response.data, silentResult.accessToken)
      } catch (err) {
        console.warn('[useAuth] Session restore failed:', err.message)
        clearAuth()
      } finally {
        setLoading(false)
      }
    }

    tryRestoreSession()
  }, [location.pathname, setAuth, clearAuth, setLoading])
}