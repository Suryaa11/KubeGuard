import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { msalInstance, msalInitPromise, loginRequest } from '../auth/msalConfig'
import { verifyToken } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { useToastStore } from '../store/toastStore'
import { Spinner } from '../components/ui/Spinner'

export const AuthCallback = () => {
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)
  const clearAuth = useAuthStore((state) => state.clearAuth)
  const addToast = useToastStore((state) => state.addToast)

  useEffect(() => {
    const completeSignIn = async () => {
      try {
        // Wait for the single shared initialization — never call initialize() again
        await msalInitPromise

        const result = await msalInstance.handleRedirectPromise()

        if (!result?.accessToken) {
          // No redirect result — try acquiring token silently from existing session
          const accounts = msalInstance.getAllAccounts()
          if (accounts.length > 0) {
            msalInstance.setActiveAccount(accounts[0])
            const silentResult = await msalInstance.acquireTokenSilent({
              ...loginRequest,
              account: accounts[0],
            })
            const response = await verifyToken(silentResult.accessToken)
            setAuth(response.data, silentResult.accessToken)
            navigate('/dashboard', { replace: true })
            return
          }
          // Truly no session — go back to landing
          navigate('/', { replace: true })
          return
        }

        // We have a fresh token from the redirect
        const response = await verifyToken(result.accessToken)
        setAuth(response.data, result.accessToken)
        navigate('/dashboard', { replace: true })
      } catch (error) {
        console.error('[AuthCallback] Sign-in failed:', error)
        clearAuth()
        addToast({
          type: 'error',
          title: 'Sign-in failed',
          message: error.response?.data?.message || error.message || 'Unable to complete sign in.',
        })
        navigate('/', { replace: true })
      }
    }

    completeSignIn()
  }, [addToast, clearAuth, navigate, setAuth])

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-card rounded-3xl p-8 text-center">
        <Spinner size={28} color="#6366f1" />
        <p className="mt-4 text-lg text-text-primary">Completing sign-in...</p>
        <p className="mt-2 text-sm text-text-secondary">Verifying your Microsoft account...</p>
      </div>
    </div>
  )
}