export const POLLING_INTERVAL_MS = 30000
export const RISK_SCORES = ['low', 'medium', 'high', 'critical']
export const PROJECT_STATUSES = ['active', 'analyzing', 'pending_approval', 'paused', 'error']
export const CRITICAL_HELM_FIELDS = [
  'replicaCount',
  'replicas',
  'cpu',
  'memory',
  'requests',
  'limits',
  'minReplicas',
  'maxReplicas',
  'targetCPUUtilizationPercentage',
  'image',
  'tag',
]
