import { AlertTriangle, ArrowRight } from 'lucide-react'

const tone = {
  increase: 'border-green-500/25 bg-green-500/10 text-green-100',
  decrease: 'border-rose-500/25 bg-rose-500/10 text-rose-100',
  modified: 'border-indigo-500/25 bg-indigo-500/10 text-indigo-100',
  added: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-100',
  removed: 'border-amber-500/25 bg-amber-500/10 text-amber-100',
}

export const ChangesDiff = ({ semanticChanges = [] }) => (
  <div className="space-y-3">
    {semanticChanges.length ? (
      semanticChanges.map((change, index) => {
        const fieldName = change.fieldPath || change.field || 'unknown'
        const changeType = change.changeType || change.type || 'modified'
        return (
          <div key={`${fieldName}-${index}`} className="rounded-2xl border border-border bg-surface/60 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <code className="font-mono text-sm text-text-secondary">{fieldName}</code>
                {change.isCriticalField ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-100">
                    <AlertTriangle size={12} />
                    Critical field
                  </span>
                ) : null}
              </div>
              <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] ${tone[changeType] || tone.modified}`}>
                {changeType}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 font-mono text-rose-100">
                {String(change.oldValue ?? '--')}
              </span>
              <ArrowRight size={16} className="text-text-secondary" />
              <span className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 font-mono text-green-100">
                {String(change.newValue ?? '--')}
              </span>
            </div>
          </div>
        )
      })
    ) : (
      <div className="rounded-2xl border border-border bg-white/5 p-6 text-sm text-text-secondary">
        No semantic changes detected.
      </div>
    )}
  </div>
)
