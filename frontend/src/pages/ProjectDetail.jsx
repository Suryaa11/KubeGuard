import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ExternalLink, PencilLine, Trash2 } from 'lucide-react'
import { getEvents, getProject } from '../services/api'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/Skeleton'
import { ProjectForm } from '../components/features/ProjectForm'
import { RiskBadge } from '../components/features/RiskBadge'
import { formatDate, formatRelative, formatSha, formatStatus } from '../utils/formatters'
import { useProjects } from '../hooks/useProjects'

export const ProjectDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { deleteProject } = useProjects()
  const [project, setProject] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('events')
  const [isEditing, setIsEditing] = useState(false)
  const [page, setPage] = useState(1)

  const load = async () => {
    setLoading(true)
    try {
      const [projectResponse, eventsResponse] = await Promise.all([
        getProject(id),
        getEvents(id, { limit: 100 }),
      ])
      const proj = projectResponse.data?.project || projectResponse.data || null
      setProject(proj)
      const raw = eventsResponse.data
      const list = Array.isArray(raw) ? raw : raw?.events || raw?.items || []
      setEvents(list)
    } catch (err) {
      console.error('[ProjectDetail] Load failed:', err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [id])

  const pagedEvents = useMemo(
    () => (Array.isArray(events) ? events.slice((page - 1) * 20, page * 20) : []),
    [events, page]
  )

  const status = project?.status
    ? formatStatus(project.status)
    : { label: 'Unknown', color: '#6B7FA3', pulse: false }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton height={220} />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="glass-card rounded-3xl p-6">
        <p className="text-text-secondary">Project not found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-3xl p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold">{project.name}</h1>
              <Badge
                label={status.label}
                color={status.color}
                bg="rgba(99,102,241,0.08)"
                border="rgba(99,102,241,0.22)"
                pulse={status.pulse}
              />
            </div>
            <a
              href={project.githubRepoUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-2 text-sm text-indigo-300"
            >
              GitHub repo <ExternalLink size={14} />
            </a>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" icon={PencilLine} onClick={() => setIsEditing(true)}>
              Edit
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={async () => {
                if (window.confirm('Delete ' + project.name + '?')) {
                  await deleteProject(project._id)
                  navigate('/dashboard')
                }
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 rounded-2xl border border-border bg-white/5 p-1">
        {['events', 'settings'].map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={'rounded-xl px-4 py-2 text-sm ' + (tab === item ? 'bg-indigo-500/20 text-text-primary' : 'text-text-secondary')}
          >
            {item === 'events' ? 'Events' : 'Settings'}
          </button>
        ))}
      </div>

      {tab === 'events' ? (
        <div className="glass-card overflow-hidden rounded-3xl">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border text-text-secondary">
                <tr>
                  <th className="px-5 py-4">Date</th>
                  <th className="px-5 py-4">Commit</th>
                  <th className="px-5 py-4">Changed files</th>
                  <th className="px-5 py-4">Risk</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedEvents.length > 0 ? (
                  pagedEvents.map((event) => {
                    const eventStatus = formatStatus(event.status || 'active')
                    return (
                      <tr key={event._id} className="border-b border-border/60 last:border-0">
                        <td className="px-5 py-4" title={formatDate(event.detectedAt)}>
                          {formatRelative(event.detectedAt)}
                        </td>
                        <td className="px-5 py-4">
                          <code className="font-mono text-xs text-indigo-200">
                            {formatSha(event.commitSha)}
                          </code>
                          <span className="ml-2 text-text-secondary">
                            {event.commitMessage ? event.commitMessage.slice(0, 50) : ''}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-text-secondary">
                          {event.changedFiles && event.changedFiles[0] ? event.changedFiles[0] : '—'}
                          {event.changedFiles && event.changedFiles.length > 1 ? (
                            <span className="ml-2 rounded-full bg-white/5 px-2 py-1 text-xs">
                              +{event.changedFiles.length - 1} more
                            </span>
                          ) : null}
                        </td>
                        <td className="px-5 py-4">
                          {event.riskScore ? (
                            <RiskBadge score={event.riskScore} size="sm" />
                          ) : (
                            <span>—</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <Badge
                            label={eventStatus.label}
                            color={eventStatus.color}
                            bg="rgba(99,102,241,0.08)"
                            border="rgba(99,102,241,0.22)"
                            pulse={eventStatus.pulse}
                            size="sm"
                          />
                        </td>
                        <td className="px-5 py-4">
                          <Link to={'/projects/' + project._id + '/reports/' + event._id}>
                            <Button variant="secondary" size="sm">
                              View Report
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-text-secondary">
                      KubeGuard is watching. Waiting for changes to your monitored folder.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {events.length > 20 ? (
            <div className="flex items-center justify-center gap-2 border-t border-border p-4">
              {Array.from({ length: Math.ceil(events.length / 20) }, (_, i) => i + 1).map((item) => (
                <button
                  key={item}
                  onClick={() => setPage(item)}
                  className={'rounded-lg px-3 py-2 text-sm ' + (page === item ? 'bg-indigo-500/20 text-text-primary' : 'text-text-secondary')}
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="glass-card rounded-3xl p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-white/5 p-4">
              <p className="text-sm text-text-secondary">GitHub repo</p>
              <p className="mt-2 break-all text-text-primary">{project.githubRepoUrl}</p>
            </div>
            <div className="rounded-2xl border border-border bg-white/5 p-4">
              <p className="text-sm text-text-secondary">Branch / folder</p>
              <p className="mt-2 text-text-primary">{project.branch} · {project.folderPath}</p>
            </div>
            <div className="rounded-2xl border border-border bg-white/5 p-4">
              <p className="text-sm text-text-secondary">Prometheus</p>
              <p className="mt-2 text-text-primary">{project.prometheusUrl}</p>
              <p className="mt-1 text-xs text-text-secondary">
                {project.prometheusAvailable ? '✓ Reachable' : '✗ Not reachable at creation time'}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-white/5 p-4">
              <p className="text-sm text-text-secondary">ArgoCD</p>
              <p className="mt-2 text-text-primary">{project.argocdUrl}</p>
              <p className="mt-1 text-xs text-text-secondary">App: {project.argocdAppName}</p>
            </div>
          </div>
          <div className="mt-6 rounded-3xl border border-rose-500/25 bg-rose-500/10 p-5">
            <h3 className="text-lg font-semibold text-rose-100">Danger zone</h3>
            <p className="mt-2 text-sm leading-7 text-rose-100/80">
              Delete this project to remove the configuration and GitHub webhook.
            </p>
            <Button
              className="mt-4"
              variant="danger"
              icon={Trash2}
              onClick={async () => {
                if (window.confirm('Delete ' + project.name + '?')) {
                  await deleteProject(project._id)
                  navigate('/dashboard')
                }
              }}
            >
              Delete Project
            </Button>
          </div>
        </div>
      )}

      <ProjectForm
        project={project}
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        onSaved={load}
      />
    </div>
  )
}