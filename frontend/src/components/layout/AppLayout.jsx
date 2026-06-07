import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export const AppLayout = ({ children }) => (
  <div className="min-h-screen">
    <Sidebar />
    <div className="md:pl-72">
      <Topbar />
      <main className="px-4 pb-24 pt-6 md:px-8">{children}</main>
    </div>
  </div>
)
