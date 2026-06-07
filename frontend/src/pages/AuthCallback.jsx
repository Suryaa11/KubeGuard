import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { msalInstance } from '../auth/msalConfig'
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
        await msalInstance.initialize()
        const result = await msalInstance.handleRedirectPromise()
        if (!result?.accessToken) {
          navigate('/', { replace: true })
          return
        }
        const response = await verifyToken(result.accessToken)
        setAuth(response.data, result.accessToken)
        navigate('/dashboard', { replace: true })
      } catch (error) {
        clearAuth()
        addToast({ type: 'error', title: 'Sign-in failed', message: error.message || 'Unable to complete sign in.' })
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
      </div>
    </div>
  )
}
