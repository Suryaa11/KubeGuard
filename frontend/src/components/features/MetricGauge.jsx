import { useEffect } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'

const getColor = (value) => {
  if (value >= 80) return '#F43F5E'
  if (value >= 50) return '#F59E0B'
  return '#22D3A6'
}

export const MetricGauge = ({ value, label, unit = '%', max = 100, size = 100 }) => {
  const progress = useMotionValue(0)
  const rounded = useTransform(progress, (latest) => Math.round(latest))
  const radius = (size - 12) / 2
  const circumference = 2 * Math.PI * radius
  const safeValue = value == null ? null : Math.max(0, Math.min(Number(value), max))
  const dashOffset = useTransform(progress, (latest) => circumference - (Math.min(latest, max) / max) * circumference)

  useEffect(() => {
    if (safeValue == null) return
    const controls = animate(progress, safeValue, { duration: 1.1, ease: 'easeOut' })
    return () => controls.stop()
  }, [progress, safeValue])

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(107,127,163,0.18)" strokeWidth="6" fill="none" />
          {safeValue != null ? (
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={getColor(safeValue)}
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          ) : null}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-mono text-2xl font-medium text-text-primary">{safeValue == null ? '--' : rounded}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.3em] text-text-secondary">{unit}</div>
        </div>
      </div>
      <p className="text-sm text-text-secondary">{label}</p>
    </div>
  )
}
