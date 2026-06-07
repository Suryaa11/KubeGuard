import { motion } from 'framer-motion'
import { AlertTriangle, BarChart2, CheckCircle2, GitBranch, Shield, Sparkles, Zap } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { msalInstance, loginRequest } from '../auth/msalConfig'
import { useAuthStore } from '../store/authStore'

const features = [
  { icon: Zap, title: 'Changes deploy silently', body: 'ArgoCD applies every Git push automatically. A small config change can crash production before anyone notices.' },
  { icon: BarChart2, title: 'No context for decisions', body: 'Engineers change resource limits without knowing current CPU usage or peak traffic history.' },
  { icon: Shield, title: 'No gate before production', body: 'Existing tools check YAML syntax. None of them check what is actually running in your cluster right now.' },
]

const steps = [
  { icon: GitBranch, title: 'Change detected', body: 'Push to your monitored branch. KubeGuard intercepts before ArgoCD applies.' },
  { icon: Sparkles, title: 'AI analysis', body: 'Live metrics + 30-day history + semantic diff = risk report in seconds.' },
  { icon: CheckCircle2, title: 'Admin decides', body: 'Approve from dashboard or email. ArgoCD only proceeds with your approval.' },
]

const MicrosoftLogo = () => (
  <span className="grid grid-cols-2 gap-1">
    <span className="h-3 w-3 rounded-sm bg-[#F25022]" />
    <span className="h-3 w-3 rounded-sm bg-[#7FBA00]" />
    <span className="h-3 w-3 rounded-sm bg-[#00A4EF]" />
    <span className="h-3 w-3 rounded-sm bg-[#FFB900]" />
  </span>
)

export const LandingPage = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  const handleSignIn = async () => {
    await msalInstance.loginRedirect(loginRequest)
  }

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-grid" />
      <section className="relative mx-auto flex min-h-screen max-w-7xl items-center px-4 py-20 md:px-8">
        <div className="grid w-full gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-200">
              <Sparkles size={14} />
              AI-powered deployment intelligence
            </span>
            <h1 className="mt-8 max-w-3xl text-5xl leading-[0.95] text-text-primary md:text-7xl">
              Stop guessing.
              <span className="gradient-text block">Know the risk.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-text-secondary md:text-2xl">
              AI-powered pre-deployment analysis for Kubernetes. Get a risk report before every change reaches production.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button variant="primary" size="lg" icon={MicrosoftLogo} onClick={handleSignIn}>
                Sign in with Microsoft
              </Button>
              <Button variant="secondary" size="lg" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>
                See how it works
              </Button>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="glass-card relative rounded-[2rem] p-6 shadow-2xl shadow-indigo-950/30"
          >
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-indigo-500/10 blur-3xl" />
            <div className="absolute -bottom-8 left-10 h-24 w-24 rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="rounded-[1.6rem] border border-border bg-surface/90 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-secondary">Risk Analysis Report</p>
                  <h3 className="mt-1 text-2xl font-semibold">Production readiness</h3>
                </div>
                <div className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-sm text-amber-100 animate-glow-pulse">
                  HIGH RISK
                </div>
              </div>
              <div className="mt-6 space-y-4">
                {[
                  ['CPU', '78%'],
                  ['Memory', '412MB'],
                  ['Replicas', '3 → 1'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between rounded-2xl border border-border bg-white/5 px-4 py-3">
                    <span className="text-sm text-text-secondary">{label}</span>
                    <span className="font-mono text-sm text-text-primary">{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex gap-3">
                <button className="flex-1 rounded-2xl border border-green-500/25 bg-green-500/10 px-4 py-3 text-sm text-green-100">
                  ✓ Approve
                </button>
                <button className="flex-1 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  ✕ Reject
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-4 py-24 md:px-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="glass-card rounded-3xl p-6">
              <feature.icon className="text-indigo-300" />
              <h3 className="mt-4 text-xl font-semibold">{feature.title}</h3>
              <p className="mt-3 leading-7 text-text-secondary">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="relative mx-auto max-w-7xl px-4 py-24 md:px-8">
        <h2 className="text-4xl font-semibold">How KubeGuard AI protects your cluster</h2>
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step.title} className="glass-card rounded-3xl p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-200">
                <step.icon size={20} />
              </div>
              <p className="mt-4 text-sm uppercase tracking-[0.35em] text-text-secondary">Step {index + 1}</p>
              <h3 className="mt-2 text-xl font-semibold">{step.title}</h3>
              <p className="mt-3 leading-7 text-text-secondary">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative border-t border-border/70 px-4 py-10 text-sm text-text-secondary md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <p>KubeGuard AI · Built for DevOps teams who care about production stability</p>
          <a href="https://github.com/" className="text-indigo-300">
            GitHub
          </a>
        </div>
      </footer>
      {isAuthenticated ? null : null}
    </div>
  )
}
