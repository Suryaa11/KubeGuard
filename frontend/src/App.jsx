import { useEffect } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AppLayout } from './components/layout/AppLayout'
import { ToastContainer } from './components/ui/ToastContainer'
import { useAuth } from './hooks/useAuth'
import { useAuthStore } from './store/authStore'
import { useToastStore } from './store/toastStore'
import { LandingPage } from './pages/LandingPage'
import { AuthCallback } from './pages/AuthCallback'
import { Dashboard } from './pages/Dashboard'
import { ProjectDetail } from './pages/ProjectDetail'
import { ReportPage } from './pages/ReportPage'
import { NotFound } from './pages/NotFound'
import { Skeleton } from './components/ui/Skeleton'

const Page = ({ children }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
    {children}
  </motion.div>
)

const ProtectedRoute = () => {
  const { isAuthenticated, isLoading } = useAuthStore()
  const addToast = useToastStore((state) => state.addToast)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      addToast({ type: 'warning', title: 'Please sign in to continue' })
    }
  }, [addToast, isAuthenticated, isLoading])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Skeleton height={220} className="max-w-lg" />
      </div>
    )
  }

  if (!isAuthenticated) return <Navigate to="/" replace />
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}

export const App = () => {
  useAuth()
  const location = useLocation()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  return (
    <>
      <ToastContainer />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route
            path="/"
            element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Page><LandingPage /></Page>}
          />
          <Route
            path="/auth/callback"
            element={
              <Page>
                <AuthCallback />
              </Page>
            }
          />
          <Route element={<ProtectedRoute />}>
            <Route
              path="/dashboard"
              element={
                <Page>
                  <Dashboard />
                </Page>
              }
            />
            <Route
              path="/projects/:id"
              element={
                <Page>
                  <ProjectDetail />
                </Page>
              }
            />
            <Route
              path="/projects/:projectId/reports/:eventId"
              element={
                <Page>
                  <ReportPage />
                </Page>
              }
            />
          </Route>
          <Route
            path="*"
            element={
              <Page>
                <NotFound />
              </Page>
            }
          />
        </Routes>
      </AnimatePresence>
    </>
  )
}
