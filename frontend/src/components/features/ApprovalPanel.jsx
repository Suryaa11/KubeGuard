import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { decideReport } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { useToastStore } from '../../store/toastStore'
import { formatDate } from '../../utils/formatters'

export const ApprovalPanel = ({ report, eventId, onDecision }) => {
  const user = useAuthStore((state) => state.user)
  const addToast = useToastStore((state) => state.addToast)
  const [note, setNote] = useState('')
  const [decision, setDecision] = useState(null)
  const [loading, setLoading] = useState(false)

  const canApprove = !user?.roles?.includes('DevOpsEngineer')

  const submitDecision = async () => {
    setLoading(true)
    try {
      await decideReport(eventId, { decision, note })
      addToast({ type: 'success', title: 'Decision saved', message: `Deployment ${decision} successfully.` })
      setDecision(null)
      setNote('')
      onDecision?.()
    } catch (error) {
      addToast({ type: 'error', title: 'Decision failed', message: error.message || 'Unable to save decision.' })
    } finally {
      setLoading(false)
    }
  }

  if (report?.adminDecision) {
    const approved = report.adminDecision === 'approved'
    return (
      <div className={`glass-card rounded-3xl border p-5 ${approved ? 'border-green-500/25' : 'border-rose-500/25'}`}>
        <div className="flex items-center gap-3">
          {approved ? <CheckCircle2 className="text-green-400" /> : <ShieldAlert className="text-rose-400" />}
          <div>
            <p className="font-semibold text-text-primary">{approved ? 'Deployment approved' : 'Deployment rejected'}</p>
            <p className="text-sm text-text-secondary">
              Decided by {report.decisionByName || 'an admin'} on {formatDate(report.decidedAt)}
            </p>
          </div>
        </div>
        {report.decisionNote ? <p className="mt-4 rounded-2xl border border-border bg-white/5 p-4 text-sm text-text-secondary">{report.decisionNote}</p> : null}
      </div>
    )
  }

  return (
    <div className="glass-card rounded-3xl border border-border p-5 sticky top-24">
      <div className="flex items-center gap-2 text-amber-200">
        <AlertTriangle size={18} />
        <p className="font-semibold">Approval required</p>
      </div>
      <p className="mt-3 text-sm leading-7 text-text-secondary">
        You are about to control a production deployment. This action cannot be undone.
      </p>
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Add a note for the team (optional)"
        className="mt-4 min-h-28 w-full rounded-2xl border border-border bg-surface/80 p-4 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-indigo-500"
      />
      {!canApprove ? (
        <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-100">
          Only admins can approve deployments.
        </div>
      ) : null}
      <div className="mt-4 grid grid-cols-1 gap-3">
        <Button variant="success" loading={loading && decision === 'approved'} disabled={!canApprove} onClick={() => setDecision('approved')} fullWidth>
          Approve Deployment
        </Button>
        <Button variant="danger" loading={loading && decision === 'rejected'} disabled={!canApprove} onClick={() => setDecision('rejected')} fullWidth>
          Reject &amp; Hold
        </Button>
      </div>
      <Modal isOpen={Boolean(decision)} onClose={() => setDecision(null)} title="Confirm decision" size="sm">
        <p className="text-sm leading-7 text-text-secondary">
          {decision === 'approved' ? 'Approve this change and resume ArgoCD sync?' : 'Reject this change and keep ArgoCD paused?'}
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDecision(null)}>
            Cancel
          </Button>
          <Button variant={decision === 'approved' ? 'success' : 'danger'} loading={loading} onClick={submitDecision}>
            Confirm
          </Button>
        </div>
      </Modal>
    </div>
  )
}
