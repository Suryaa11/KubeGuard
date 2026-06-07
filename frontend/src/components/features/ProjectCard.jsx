import { Link } from 'react-router-dom'
import { ExternalLink, Trash2 } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { formatStatus } from '../../utils/formatters'

export const ProjectCard = ({ project, onDelete }) => {
  const status = formatStatus(project.status)

  return (
    <div className="glass-card rounded-3xl p-5 transition hover:-translate-y-1 hover:border-border-bright">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link to={`/projects/${project._id}`} className="truncate text-lg font-semibold text-text-primary">
            {project.name || project.projectName || 'Untitled project'}
          </Link>
          <p className="mt-1 truncate text-sm text-text-secondary">{project.githubRepoUrl || project.repoUrl}</p>
        </div>
        <Badge label={status.label} color={status.color} bg="rgba(99,102,241,0.08)" border="rgba(99,102,241,0.22)" pulse={status.pulse} size="sm" />
      </div>

      {project.status === 'pending_approval' ? (
        <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Deployment pending admin approval.
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link
          to={`/projects/${project._id}`}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border bg-white/5 px-3 text-sm text-text-primary transition hover:bg-white/10"
        >
          <ExternalLink size={14} />
          Open
        </Link>
        <Button variant="danger" size="sm" icon={Trash2} onClick={() => onDelete?.(project._id)}>
          Delete
        </Button>
      </div>
    </div>
  )
}
