import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginRequest, msalInstance } from '../auth/msalConfig'
import { verifyToken } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { useToastStore } from '../store/toastStore'

export const useAuth = () => {
  const navigate = useNavigate()
  const { user, isAuthenticated, isLoading, setAuth, clearAuth, setLoading } = useAuthStore()
  const addToast = useToastStore((state) => state.addToast)

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await msalInstance.initialize()
        const accounts = msalInstance.getAllAccounts()
        if (!accounts.length) {
          setLoading(false)
          return
        }

        msalInstance.setActiveAccount(accounts[0])
        const result = await msalInstance.acquireTokenSilent({
          ...loginRequest,
          account: accounts[0],
        })
        const response = await verifyToken(result.accessToken)
        setAuth(response.data, result.accessToken)
      } catch (error) {
        clearAuth()
      } finally {
        setLoading(false)
      }
    }

    bootstrap()
  }, [clearAuth, setAuth, setLoading])

  const signIn = async () => {
    await msalInstance.loginRedirect(loginRequest)
  }

  const signOut = async () => {
    clearAuth()
    addToast({ type: 'info', title: 'Signed out', message: 'You have been signed out.' })
    await msalInstance.logoutRedirect()
  }

  return { user, isAuthenticated, isLoading, signIn, signOut, navigate }
}
