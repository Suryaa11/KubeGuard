import { Link, NavLink } from 'react-router-dom'
import { FolderKanban, LayoutDashboard, LogOut, Shield, Sparkles } from 'lucide-react'
import { msalInstance } from '../../auth/msalConfig'
import { useAuthStore } from '../../store/authStore'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/dashboard#projects', label: 'Projects', icon: FolderKanban },
  { to: '/dashboard#activity', label: 'Activity', icon: Sparkles },
]

export const Sidebar = () => {
  const clearAuth = useAuthStore((state) => state.clearAuth)

  const signOut = async () => {
    clearAuth()
    await msalInstance.logoutRedirect()
  }

  return (
    <>
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-72 md:flex-col md:border-r md:border-border md:bg-base/80 md:px-5 md:py-6 md:backdrop-blur-xl">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="rounded-2xl bg-indigo-500/15 p-3 text-indigo-300">
            <Shield size={20} />
          </div>
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-text-secondary">KubeGuard</p>
            <h1 className="text-xl font-semibold">AI Control Plane</h1>
          </div>
        </Link>
        <nav className="mt-10 flex flex-1 flex-col gap-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition',
                  isActive ? 'bg-white/10 text-text-primary' : 'text-text-secondary hover:bg-white/5 hover:text-text-primary',
                ].join(' ')
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button onClick={signOut} className="mt-4 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-text-secondary transition hover:bg-white/5 hover:text-text-primary">
          <LogOut size={18} />
          Sign out
        </button>
      </aside>

      <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-3 border-t border-border bg-base/90 px-2 py-2 backdrop-blur-xl md:hidden">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                'flex flex-col items-center gap-1 rounded-2xl py-2 text-xs transition',
                isActive ? 'text-text-primary' : 'text-text-secondary',
              ].join(' ')
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
