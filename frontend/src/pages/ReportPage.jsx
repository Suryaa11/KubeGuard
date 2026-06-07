import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { GitBranch } from 'lucide-react'
import { getEvent, getProject, getReport } from '../services/api'
import { formatDate, formatRelative, formatSha } from '../utils/formatters'
import { ChangesDiff } from '../components/features/ChangesDiff'
import { MetricGauge } from '../components/features/MetricGauge'
import { RiskBadge } from '../components/features/RiskBadge'
import { ApprovalPanel } from '../components/features/ApprovalPanel'
import { Skeleton } from '../components/ui/Skeleton'

const markdownComponents = {
  h2: ({ children }) => <h2 className="mt-8 border-b border-border pb-2 text-xl font-semibold">{children}</h2>,
  p: ({ children }) => <p className="max-w-[70ch] leading-8 text-text-primary/90">{children}</p>,
  code: ({ children }) => <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-sm text-indigo-200">{children}</code>,
  strong: ({ children }) => <strong className="text-indigo-300">{children}</strong>,
  ul: ({ children }) => <ul className="list-disc space-y-2 pl-6 text-text-primary/90">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-2 pl-6 text-text-primary/90">{children}</ol>,
}

export const ReportPage = () => {
  const { projectId, eventId } = useParams()
  const [project, setProject] = useState(null)
  const [event, setEvent] = useState(null)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [projectResponse, eventResponse, reportResponse] = await Promise.all([getProject(projectId), getEvent(eventId), getReport(eventId)])
      setProject(projectResponse.data)
      setEvent(eventResponse.data)
      setReport(reportResponse.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [projectId, eventId])

  const metrics = useMemo(
    () => report?.liveMetrics || { available: true, cpu: 78, memory: 412, pods: 3, requestRate: 120 },
    [report]
  )

  if (loading) return <Skeleton height={800} />

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <div className="text-sm text-text-secondary">
          <Link to="/dashboard" className="text-indigo-300">
            Dashboard
          </Link>{' '}
          → <Link to={`/projects/${projectId}`} className="text-indigo-300">{project?.name || 'Project'}</Link> → Report #{formatSha(event?.commitSha)}
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <RiskBadge score={report?.riskScore || event?.riskScore || 'low'} size="lg" />
          <div className="text-sm text-text-secondary">
            Generated {formatRelative(report?.generatedAt || event?.detectedAt)}
            <div>{report?.adminDecision ? `Decision: ${report.adminDecision}` : 'Pending approval'}</div>
          </div>
        </div>

        <section className="glass-card rounded-3xl p-6">
          <div className="flex items-center gap-2 text-indigo-300">
            <GitBranch size={18} />
            <h2 className="text-xl font-semibold">What Changed</h2>
          </div>
          <div className="mt-5">
            <ChangesDiff semanticChanges={report?.semanticChanges || event?.semanticChanges || []} />
          </div>
          <div className="mt-6 rounded-2xl border border-border bg-white/5 p-4 text-sm text-text-secondary">
            <div className="flex flex-wrap items-center gap-3">
              <span className="h-10 w-10 rounded-full bg-indigo-500/20 text-center leading-10 text-indigo-200">{event?.authorName?.[0] || 'A'}</span>
              <span>{event?.authorName || 'Unknown author'}</span>
              <code className="font-mono text-indigo-200">{event?.commitSha}</code>
              <span>{event?.commitMessage}</span>
            </div>
          </div>
        </section>

        <section className="glass-card rounded-3xl p-6">
          <h2 className="text-xl font-semibold">Cluster State at Time of Analysis</h2>
          {!metrics.available ? (
            <div className="mt-5 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-100">
              Prometheus was not reachable. Metrics unavailable. The AI report was generated based on the config change alone.
            </div>
          ) : (
            <div className="mt-6 grid gap-8 md:grid-cols-2 xl:grid-cols-4">
              <MetricGauge value={metrics.cpu} label="CPU usage" unit="%" />
              <MetricGauge value={metrics.memory} label="Memory" unit="MB" max={1024} />
              <MetricGauge value={metrics.pods} label="Pods" unit="Pods" max={10} />
              <MetricGauge value={metrics.requestRate} label="Request rate" unit="rps" max={500} />
            </div>
          )}
        </section>

        <section className="glass-card rounded-3xl border-t-4 border-indigo-500 p-6">
          <div className="mb-5 flex items-center gap-3">
            <h2 className="text-xl font-semibold">AI Risk Analysis</h2>
            <span className="rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.25em] text-indigo-200">
              AI
            </span>
          </div>
          <div className="prose prose-invert max-w-none prose-p:max-w-[70ch] prose-code:rounded prose-code:bg-white/10 prose-code:px-1 prose-code:py-0.5 prose-code:font-mono prose-code:text-indigo-200">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {report?.reportMarkdown || '# Analysis pending\n\nNo report content available yet.'}
            </ReactMarkdown>
          </div>
        </section>
      </div>

      <aside className="space-y-6">
        <ApprovalPanel report={report} eventId={eventId} onDecision={load} />
      </aside>
    </div>
  )
}
