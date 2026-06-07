import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'

export const NotFound = () => (
  <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
    <h1 className="gradient-text text-8xl font-semibold">404</h1>
    <p className="mt-4 text-xl text-text-secondary">This page doesn&apos;t exist. The cluster is safe though.</p>
    <Link to="/dashboard" className="mt-8">
      <Button>Back to Dashboard</Button>
    </Link>
  </div>
)
