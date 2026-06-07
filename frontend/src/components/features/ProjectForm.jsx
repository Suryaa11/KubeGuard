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
  folderPath: '',
  argoCdAppName: '',
  argoCdToken: '',
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
        folderPath: project.folderPath || '',
        argoCdAppName: project.argoCdAppName || '',
        argoCdToken: '',
      })
    } else {
      setForm(initialState)
    }
  }, [project, isOpen])

  const handleChange = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setErrors({})
    try {
      if (project?._id) {
        await updateProject(project._id, form)
        addToast({ type: 'success', title: 'Project updated', message: 'Settings were saved successfully.' })
      } else {
        await createProject(form)
        addToast({ type: 'success', title: 'Project created', message: 'Your repository is now monitored.' })
      }
      onSaved?.()
      onClose?.()
    } catch (error) {
      setErrors({ form: error.message || 'Unable to save project.' })
      addToast({ type: 'error', title: 'Save failed', message: error.message || 'Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={project ? 'Edit Project' : 'Add Project'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Project name" name="name" value={form.name} onChange={handleChange} icon={FolderKanban} required />
          <Input label="GitHub repo URL" name="githubRepoUrl" value={form.githubRepoUrl} onChange={handleChange} icon={LinkIcon} required />
          <Input label="Branch" name="branch" value={form.branch} onChange={handleChange} icon={GitBranch} required />
          <Input label="Folder path" name="folderPath" value={form.folderPath} onChange={handleChange} icon={Waypoints} required />
          <Input label="ArgoCD app name" name="argoCdAppName" value={form.argoCdAppName} onChange={handleChange} icon={FolderKanban} required />
          <Input label="ArgoCD token" name="argoCdToken" value={form.argoCdToken} onChange={handleChange} icon={Save} placeholder={project ? '••••••••' : ''} />
        </div>
        {errors.form ? <p className="text-sm text-rose-400">{errors.form}</p> : null}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={loading} icon={Save}>
            {project ? 'Update Settings' : 'Create Project'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
