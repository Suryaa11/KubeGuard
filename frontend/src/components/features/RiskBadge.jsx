import { AlertTriangle, Shield, Zap } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { formatRisk } from '../../utils/formatters'

const icons = {
  low: Shield,
  medium: AlertTriangle,
  high: AlertTriangle,
  critical: Zap,
}

export const RiskBadge = ({ score, size = 'sm' }) => {
  const risk = formatRisk(score)
  const Icon = icons[score] || Shield
  return (
    <Badge
      label={
        <span className="inline-flex items-center gap-1.5">
          <Icon size={size === 'lg' ? 18 : 14} />
          <span>{risk.label}</span>
        </span>
      }
      color={risk.color}
      bg={risk.bg}
      border={risk.border}
      pulse={size === 'lg'}
      size={size}
      className={size === 'lg' ? 'px-4 py-2 text-sm font-semibold animate-glow-pulse' : ''}
    />
  )
}
