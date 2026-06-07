import { useEffect, useState } from 'react'
import { Search, UserRound } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { Button } from '../ui/Button'

export const Topbar = () => {
  const user = useAuthStore((state) => state.user)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={[
        'sticky top-0 z-20 border-b px-4 py-4 transition md:px-8',
        scrolled ? 'border-border bg-base/85 backdrop-blur-2xl' : 'border-transparent bg-transparent backdrop-blur-xl',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-text-secondary">KubeGuard AI</p>
          <h2 className="mt-1 text-2xl font-semibold text-text-primary">Pre-deployment intelligence</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-2xl border border-border bg-white/5 px-3 py-2 text-sm text-text-secondary md:flex">
            <Search size={16} />
            Search
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-white/5 px-3 py-2 text-sm text-text-secondary">
            <UserRound size={16} />
            <span className="hidden sm:inline">{user?.name || 'Authenticated user'}</span>
          </div>
        </div>
      </div>
    </header>
  )
}
