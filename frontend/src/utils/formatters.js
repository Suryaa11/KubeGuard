import { format, formatDistanceToNow } from 'date-fns'

export const formatDate = (date) => {
  if (!date) return '--'
  return format(new Date(date), 'MMM d, yyyy \'at\' h:mm a')
}

export const formatRelative = (date) => {
  if (!date) return '--'
  return `${formatDistanceToNow(new Date(date), { addSuffix: true })}`
}

export const formatBytes = (mb) => {
  if (mb == null || Number.isNaN(Number(mb))) return '--'
  const value = Number(mb)
  if (value >= 1024) return `${(value / 1024).toFixed(1)} GB`
  return `${Math.round(value)} MB`
}

export const formatSha = (sha) => sha?.slice(0, 7) || '--'

export const formatRisk = (score) =>
  ({
    low: { label: 'Low Risk', color: '#22D3A6', bg: 'rgba(34, 211, 166, 0.1)', border: 'rgba(34, 211, 166, 0.3)' },
    medium: {
      label: 'Medium Risk',
      color: '#F59E0B',
      bg: 'rgba(245, 158, 11, 0.1)',
      border: 'rgba(245, 158, 11, 0.3)',
    },
    high: { label: 'High Risk', color: '#F97316', bg: 'rgba(249, 115, 22, 0.1)', border: 'rgba(249, 115, 22, 0.3)' },
    critical: {
      label: 'Critical Risk',
      color: '#F43F5E',
      bg: 'rgba(244, 63, 94, 0.1)',
      border: 'rgba(244, 63, 94, 0.3)',
    },
  }[score]) || { label: 'Unknown', color: '#6B7FA3', bg: 'transparent', border: 'transparent' }

export const formatStatus = (status) =>
  ({
    active: { label: 'Monitoring', color: '#22D3A6', pulse: false },
    analyzing: { label: 'Analyzing...', color: '#22D3EE', pulse: true },
    pending_approval: { label: 'Pending Approval', color: '#F59E0B', pulse: true },
    paused: { label: 'Paused', color: '#6B7FA3', pulse: false },
    error: { label: 'Error', color: '#F43F5E', pulse: false },
  }[status?.toLowerCase()]) || { label: status || 'Unknown', color: '#6B7FA3', pulse: false }
