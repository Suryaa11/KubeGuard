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
  folderPath: '/helm',        // was '' — Joi requires it to start with /
  prometheusUrl: '',
  argocdUrl: '',
  argocdAppName: '',
  argocdToken: '',
  kubernetesToken: '',
  kubernetesApiUrl: '',
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
        argocdToken: '',         // intentionally blank — user must re-enter to change
        kubernetesToken: '',
        kubernetesApiUrl: project.kubernetesApiUrl || '',
      })
    } else {
      setForm(initialState)
    }
    setErrors({})
  }, [project, isOpen])

  const handleChange = (event) =>
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))

  const buildPayload = () => {
    if (!project) return form   // create — send everything

    // update — only send fields that have values
    // argocdToken is blank when user didn't change it — omit it so Joi doesn't fail min(1)
    const payload = {
      name: form.name,
      prometheusUrl: form.prometheusUrl,
      argocdUrl: form.argocdUrl,
      argocdAppName: form.argocdAppName,
      kubernetesApiUrl: form.kubernetesApiUrl || null,
      kubernetesToken: form.kubernetesToken || null,
    }
    if (form.argocdToken.trim()) payload.argocdToken = form.argocdToken
    return payload
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setErrors({})
    try {
      const payload = buildPayload()
      if (project?._id) {
        await updateProject(project._id, payload)
        addToast({ type: 'success', title: 'Project updated', message: 'Settings were saved successfully.' })
      } else {
        await createProject(payload)
        addToast({ type: 'success', title: 'Project created', message: 'Your repository is now monitored.' })
      }
      onSaved?.()
      onClose?.()
    } catch (error) {
      // Safely extract message — avoid toLowerCase crash on undefined
      const msg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'Unable to save project.'

      const detail = error?.response?.data?.details
        ? Object.entries(error.response.data.details)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')
        : null

      setErrors({ form: detail || msg })
      addToast({ type: 'error', title: 'Save failed', message: msg })
    } finally {
      setLoading(false)
    }
  }

  const isEdit = Boolean(project?._id)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Project' : 'Add Project'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Project name" name="name" value={form.name} onChange={handleChange} icon={FolderKanban} required />
          <Input
            label="GitHub repo URL"
            name="githubRepoUrl"
            value={form.githubRepoUrl}
            onChange={handleChange}
            icon={LinkIcon}
            required
            disabled={isEdit}   // immutable after creation
          />
          <Input
            label="Branch"
            name="branch"
            value={form.branch}
            onChange={handleChange}
            icon={GitBranch}
            required
            disabled={isEdit}   // immutable after creation
          />
          <Input
            label="Folder path"
            name="folderPath"
            value={form.folderPath}
            onChange={handleChange}
            icon={Waypoints}
            required
            disabled={isEdit}   // immutable after creation
            placeholder="/helm"
          />
          <Input label="ArgoCD app name" name="argocdAppName" value={form.argocdAppName} onChange={handleChange} icon={FolderKanban} required />
          <Input
            label="ArgoCD token"
            name="argocdToken"
            value={form.argocdToken}
            onChange={handleChange}
            icon={Save}
            placeholder={isEdit ? 'Leave blank to keep existing' : ''}
            required={!isEdit}   // only required on create
          />
          <Input
            label="Prometheus URL"
            name="prometheusUrl"
            value={form.prometheusUrl}
            onChange={handleChange}
            icon={LinkIcon}
            required
            placeholder="http://prometheus.monitoring.svc:9090"
          />
          <Input
            label="ArgoCD URL"
            name="argocdUrl"
            value={form.argocdUrl}
            onChange={handleChange}
            icon={LinkIcon}
            required
            placeholder="https://argocd.company.com"
          />
          <Input
            label="Kubernetes API URL"
            name="kubernetesApiUrl"
            value={form.kubernetesApiUrl}
            onChange={handleChange}
            icon={Waypoints}
            placeholder="https://your-cluster-api:6443 (optional)"
          />
          <Input
            label="Kubernetes token"
            name="kubernetesToken"
            value={form.kubernetesToken}
            onChange={handleChange}
            icon={Save}
            placeholder="Optional"
          />
        </div>

        {errors.form ? <p className="text-sm text-rose-400">{errors.form}</p> : null}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" loading={loading} icon={Save}>
            {isEdit ? 'Update Settings' : 'Create Project'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}