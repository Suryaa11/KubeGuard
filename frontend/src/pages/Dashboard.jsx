import { useEffect, useMemo, useState } from 'react'
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'framer-motion'
import { Clock, FolderKanban, GitCommit, Plus, CheckCircle2 } from 'lucide-react'
import { POLLING_INTERVAL_MS } from '../utils/constants'
import { useProjects } from '../hooks/useProjects'
import { ActivityFeed } from '../components/features/ActivityFeed'
import { ProjectCard } from '../components/features/ProjectCard'
import { ProjectForm } from '../components/features/ProjectForm'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'
import { getEvents } from '../services/api'
import { useToastStore } from '../store/toastStore'

const AnimatedNumber = ({ value }) => {
  const motionValue = useMotionValue(0)
  const rounded = useTransform(motionValue, (latest) => Math.round(latest))
  const [displayValue, setDisplayValue] = useState(0)

  useMotionValueEvent(rounded, 'change', (latest) => {
    setDisplayValue(latest)
  })

  useEffect(() => {
    const controls = animate(motionValue, value, { duration: 1, ease: 'easeOut' })
    return () => controls.stop()
  }, [motionValue, value])

  return <motion.div className="font-display text-4xl">{displayValue}</motion.div>
}

const StatCard = ({ icon: Icon, label, value, tone = 'indigo' }) => (
  <div className="glass-card rounded-3xl p-5">
    <div className="flex items-center justify-between">
      <div className={`rounded-2xl p-3 ${tone === 'amber' ? 'bg-amber-500/10 text-amber-300' : tone === 'cyan' ? 'bg-cyan-500/10 text-cyan-300' : tone === 'green' ? 'bg-green-500/10 text-green-300' : 'bg-indigo-500/10 text-indigo-300'}`}>
        <Icon size={18} />
      </div>
      <AnimatedNumber value={value} />
    </div>
    <p className="mt-4 text-sm text-text-secondary">{label}</p>
  </div>
)

export const Dashboard = () => {
  const { projects, isLoading, error, refetch, deleteProject } = useProjects()
  const [events, setEvents] = useState([])
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const addToast = useToastStore((state) => state.addToast)

  const loadEvents = async () => {
    try {
      const responses = await Promise.allSettled(projects.map((project) => getEvents(project._id, { limit: 10 })))
      const flattened = responses.flatMap((response, index) =>
        response.status === 'fulfilled' ? (response.value.data?.items || response.value.data || []).map((event) => ({ ...event, projectId: projects[index]._id, projectName: projects[index].name })) : []
      )
      const sorted = flattened.sort((a, b) => new Date(b.detectedAt || b.createdAt) - new Date(a.detectedAt || a.createdAt))
      setEvents(sorted.slice(0, 10))
      const nextPending = sorted.filter((event) => event.status === 'pending_approval').length
      setPendingCount((current) => {
        if (nextPending > current) {
          const latest = sorted.find((event) => event.status === 'pending_approval')
          addToast({
            type: 'warning',
            title: 'New pending approval',
            message: latest?.projectName ? `New pending approval for ${latest.projectName}` : 'A new deployment is waiting for review.',
          })
        }
        return nextPending
      })
    } catch {
      setEvents([])
    }
  }

  useEffect(() => {
    loadEvents()
  }, [projects])

  useEffect(() => {
    const interval = setInterval(() => {
      refetch()
      loadEvents()
    }, POLLING_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refetch, projects])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key.toLowerCase() === 'n' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        setIsFormOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const stats = useMemo(() => {
    const safeDeployments = events.filter((event) => event.adminDecision === 'approved' || event.status === 'approved').length
    return [
      { icon: FolderKanban, label: 'Total projects monitored', value: projects.length, tone: 'indigo' },
      { icon: GitCommit, label: 'Changes detected', value: events.length, tone: 'cyan' },
      { icon: Clock, label: 'Pending approvals', value: pendingCount, tone: 'amber' },
      { icon: CheckCircle2, label: 'Safe deployments', value: safeDeployments, tone: 'green' },
    ]
  }, [events, pendingCount, projects.length])

  return (
    <div className="space-y-10">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="h-full">
            <StatCard {...stat} />
          </motion.div>
        ))}
      </section>

      <section id="projects" className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-2xl font-semibold">Your projects</h3>
          <Button icon={Plus} onClick={() => setIsFormOpen(true)}>
            Add Project
          </Button>
        </div>
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton height={180} />
            <Skeleton height={180} />
          </div>
        ) : error ? (
          <div className="glass-card rounded-3xl p-6">
            <p className="text-text-secondary">{error}</p>
            <Button className="mt-4" onClick={refetch}>
              Retry
            </Button>
          </div>
        ) : projects.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((project) => (
              <ProjectCard key={project._id} project={project} onDelete={deleteProject} />
            ))}
          </div>
        ) : (
          <div className="glass-card rounded-3xl p-10 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-border bg-white/5 text-indigo-300">
              <FolderKanban size={34} />
            </div>
            <h4 className="mt-5 text-2xl font-semibold">No projects yet</h4>
            <p className="mt-3 text-text-secondary">Add your first GitHub repository to start monitoring.</p>
            <Button className="mt-6" icon={Plus} onClick={() => setIsFormOpen(true)}>
              Add Project
            </Button>
          </div>
        )}
      </section>

      <section id="activity" className="space-y-5">
        <h3 className="text-2xl font-semibold">Recent activity</h3>
        <ActivityFeed events={events} />
      </section>

      <ProjectForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} onSaved={refetch} />
    </div>
  )
}
