import { useEffect, useState } from 'react'
import { FolderKanban, GitBranch, Link as LinkIcon, Save, Waypoints } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { createProject, updateProject } from '../../services/api'
import { useToastStore } from '../../store/toastStore'

const initialState = {
  name: '',
  githubRepoUrl: '',
  branch: 'main',
  folderPath: '/helm',
  prometheusUrl: '',
  argocdUrl: '',
  argocdAppName: '',
  argocdToken: '',
  kubernetesToken: '',
  kubernetesApiUrl: '',
}

// Auto-fix common user input mistakes before sending to API
const sanitizePayload = (form) => {
  const out = { ...form }

  // folderPath must start with /
  if (out.folderPath && !out.folderPath.startsWith('/')) {
    out.folderPath = '/' + out.folderPath
  }
  if (!out.folderPath) out.folderPath = '/helm'

  // URLs must have http:// or https://
  const fixUrl = (val) => {
    if (!val) return val
    val = val.trim()
    if (val && !val.startsWith('http://') && !val.startsWith('https://')) {
      return 'http://' + val
    }
    return val
  }

  out.prometheusUrl = fixUrl(out.prometheusUrl)
  out.argocdUrl = fixUrl(out.argocdUrl)
  if (out.kubernetesApiUrl) out.kubernetesApiUrl = fixUrl(out.kubernetesApiUrl)

  // githubRepoUrl must start with https://github.com/
  if (out.githubRepoUrl && !out.githubRepoUrl.startsWith('https://github.com/')) {
    if (out.githubRepoUrl.startsWith('github.com/')) {
      out.githubRepoUrl = 'https://' + out.githubRepoUrl
    }
  }

  // empty optional fields → null so Joi doesn't trip on empty string uri
  if (!out.kubernetesToken) out.kubernetesToken = null
  if (!out.kubernetesApiUrl) out.kubernetesApiUrl = null

  return out
}

export const ProjectForm = ({ project, isOpen, onClose, onSaved }) => {
  const [form, setForm] = useState(initialState)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const addToast = useToastStore((state) => state.addToast)

  useEffect(() => {
    if (project) {
      setForm({
        name: project.name || '',
        githubRepoUrl: project.githubRepoUrl || '',
        branch: project.branch || 'main',
        folderPath: project.folderPath || '/helm',
        prometheusUrl: project.prometheusUrl || '',
        argocdUrl: project.argocdUrl || '',
        argocdAppName: project.argocdAppName || '',
        argocdToken: '',
        kubernetesToken: '',
        kubernetesApiUrl: project.kubernetesApiUrl || '',
      })
    } else {
      setForm(initialState)
    }
    setErrors({})
  }, [project, isOpen])

  const handleChange = (e) =>
    setForm((cur) => ({ ...cur, [e.target.name]: e.target.value }))

  const buildPayload = () => {
    if (!project) return sanitizePayload(form)

    // update — only send editable fields
    const payload = {
      name: form.name,
      prometheusUrl: form.prometheusUrl,
      argocdUrl: form.argocdUrl,
      argocdAppName: form.argocdAppName,
      kubernetesApiUrl: form.kubernetesApiUrl || null,
      kubernetesToken: form.kubernetesToken || null,
    }
    if (form.argocdToken.trim()) payload.argocdToken = form.argocdToken
    return sanitizePayload(payload)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErrors({})
    try {
      const payload = buildPayload()
      if (project?._id) {
        await updateProject(project._id, payload)
        addToast({ type: 'success', title: 'Project updated', message: 'Settings saved.' })
      } else {
        await createProject(payload)
        addToast({ type: 'success', title: 'Project created', message: 'Your repository is now monitored.' })
      }
      onSaved?.()
      onClose?.()
    } catch (err) {
      // Safe error extraction — never call toLowerCase on unknown value
      const serverDetails = err?.response?.data?.details
      const serverMessage = err?.response?.data?.message
      const fallback = err?.message || 'Unable to save project.'

      if (serverDetails && typeof serverDetails === 'object') {
        // Show per-field validation errors
        setErrors(serverDetails)
        const summary = Object.entries(serverDetails)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' · ')
        addToast({ type: 'error', title: 'Validation failed', message: summary })
      } else {
        setErrors({ form: serverMessage || fallback })
        addToast({ type: 'error', title: 'Save failed', message: serverMessage || fallback })
      }
    } finally {
      setLoading(false)
    }
  }

  const isEdit = Boolean(project?._id)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Project' : 'Add Project'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Project name" name="name" value={form.name}
            onChange={handleChange} icon={FolderKanban} required
            error={errors.name}
          />
          <Input
            label="GitHub repo URL" name="githubRepoUrl" value={form.githubRepoUrl}
            onChange={handleChange} icon={LinkIcon} required disabled={isEdit}
            placeholder="https://github.com/org/repo"
            error={errors.githubRepoUrl}
          />
          <Input
            label="Branch" name="branch" value={form.branch}
            onChange={handleChange} icon={GitBranch} required disabled={isEdit}
            error={errors.branch}
          />
          <Input
            label="Folder path" name="folderPath" value={form.folderPath}
            onChange={handleChange} icon={Waypoints} required disabled={isEdit}
            placeholder="/helm"
            error={errors.folderPath}
          />
          <Input
            label="ArgoCD app name" name="argocdAppName" value={form.argocdAppName}
            onChange={handleChange} icon={FolderKanban} required
            error={errors.argocdAppName}
          />
          <Input
            label="ArgoCD token" name="argocdToken" value={form.argocdToken}
            onChange={handleChange} icon={Save}
            placeholder={isEdit ? 'Leave blank to keep existing' : ''}
            required={!isEdit}
            error={errors.argocdToken}
          />
          <Input
            label="Prometheus URL" name="prometheusUrl" value={form.prometheusUrl}
            onChange={handleChange} icon={LinkIcon} required
            placeholder="http://prometheus.monitoring.svc:9090"
            error={errors.prometheusUrl}
          />
          <Input
            label="ArgoCD URL" name="argocdUrl" value={form.argocdUrl}
            onChange={handleChange} icon={LinkIcon} required
            placeholder="https://argocd.company.com"
            error={errors.argocdUrl}
          />
          <Input
            label="Kubernetes API URL" name="kubernetesApiUrl" value={form.kubernetesApiUrl}
            onChange={handleChange} icon={Waypoints}
            placeholder="https://your-cluster-api:6443 (optional)"
            error={errors.kubernetesApiUrl}
          />
          <Input
            label="Kubernetes token" name="kubernetesToken" value={form.kubernetesToken}
            onChange={handleChange} icon={Save} placeholder="Optional"
          />
        </div>

        {errors.form ? (
          <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
            {errors.form}
          </p>
        ) : null}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading} icon={Save}>
            {isEdit ? 'Update Settings' : 'Create Project'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}