import { Link } from 'react-router-dom'
import { formatRelative } from '../../utils/formatters'
import { RiskBadge } from './RiskBadge'

export const ActivityFeed = ({ events = [] }) => (
  <div className="space-y-3">
    {events.length ? (
      events.map((event, index) => (
        <Link
          key={event._id || event.eventId || index}
          to={`/projects/${event.projectId}/reports/${event.eventId || event._id}`}
          className="group block rounded-2xl border border-border bg-surface/60 p-4 transition hover:border-border-bright hover:bg-elevated/60"
        >
          <div className="flex items-start gap-4">
            <div className={`mt-1 h-3 w-3 rounded-full ${event.status === 'pending_approval' ? 'bg-amber-400' : 'bg-indigo-400'}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-text-primary">
                  {event.projectName || 'Project'} — {event.description || event.changeSummary || 'Change detected'}
                </p>
                {event.riskScore ? <RiskBadge score={event.riskScore} size="sm" /> : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-text-secondary">
                <span>{formatRelative(event.detectedAt || event.createdAt)}</span>
                {event.commitSha ? <code className="rounded bg-white/5 px-2 py-1 font-mono text-xs">{event.commitSha.slice(0, 7)}</code> : null}
              </div>
            </div>
          </div>
        </Link>
      ))
    ) : (
      <div className="rounded-2xl border border-border bg-white/5 p-6 text-sm text-text-secondary">
        No recent activity yet.
      </div>
    )}
  </div>
)
