import { AlertTriangle, CheckCircle2, Info, XCircle, X } from 'lucide-react'
import { motion } from 'framer-motion'

const icons = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const tone = {
  success: 'border-green-500/30 bg-green-500/10 text-green-200',
  error: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
  info: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100',
}

export const Toast = ({ toast, onClose }) => {
  const Icon = icons[toast.type] || Info

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 48 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 48 }}
      className={`overflow-hidden rounded-2xl border p-4 shadow-2xl ${tone[toast.type]}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-white/10 p-2">
          <Icon size={16} />
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-text-primary">{toast.title}</p>
              {toast.message ? <p className="mt-1 text-sm text-text-secondary">{toast.message}</p> : null}
            </div>
            <button onClick={onClose} className="rounded-full p-1 text-text-secondary transition hover:text-text-primary">
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-full origin-left animate-[shimmer_2s_linear_infinite] bg-white/30" />
      </div>
    </motion.div>
  )
}
