const yaml = require('js-yaml')

const CRITICAL_FIELDS = [
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
  'resources',
]

function normalizePath(filePath = '') {
  return filePath.replace(/\\/g, '/').replace(/^\//, '')
}

function filterMonitoredFiles(changedFiles = [], folderPath = '') {
  const normalizedFolder = normalizePath(folderPath)
  return [...new Set(changedFiles.map(normalizePath))].filter((file) => {
    if (!normalizedFolder) return true
    return file === normalizedFolder || file.startsWith(`${normalizedFolder}/`)
  })
}

function isYamlFile(filePath) {
  return filePath.endsWith('.yaml') || filePath.endsWith('.yml')
}

function isCriticalField(fieldPath = '') {
  return CRITICAL_FIELDS.some((field) => fieldPath.toLowerCase().includes(field.toLowerCase()))
}

function inferFieldPath(filePath) {
  const segments = normalizePath(filePath).split('/')
  const fileName = segments[segments.length - 1] || filePath
  try {
    yaml.load(`${fileName}: true`)
  } catch {
    return fileName
  }
  return fileName
}

function createChange(file, changeType) {
  const fieldPath = inferFieldPath(file)
  return {
    file,
    fieldPath,
    oldValue: changeType === 'added' ? '' : 'unknown',
    newValue: changeType === 'removed' ? '' : 'unknown',
    changeType,
    isCriticalField: isCriticalField(fieldPath) || isCriticalField(file),
  }
}

function parseSemanticChanges(commits = [], monitoredFiles = []) {
  const monitoredSet = new Set(monitoredFiles.map(normalizePath))
  const changes = []

  for (const commit of commits || []) {
    for (const file of commit.added || []) {
      const normalized = normalizePath(file)
      if (monitoredSet.has(normalized) && isYamlFile(normalized)) {
        changes.push(createChange(normalized, 'added'))
      }
    }

    for (const file of commit.modified || []) {
      const normalized = normalizePath(file)
      if (monitoredSet.has(normalized) && isYamlFile(normalized)) {
        changes.push(createChange(normalized, 'modified'))
      }
    }

    for (const file of commit.removed || []) {
      const normalized = normalizePath(file)
      if (monitoredSet.has(normalized) && isYamlFile(normalized)) {
        changes.push(createChange(normalized, 'removed'))
      }
    }
  }

  return changes
}

function buildRawDiff(commits = [], monitoredFiles = []) {
  const monitoredSet = new Set(monitoredFiles.map(normalizePath))
  const lines = []

  for (const commit of commits || []) {
    const files = [...(commit.added || []), ...(commit.modified || []), ...(commit.removed || [])]
    for (const file of files) {
      const normalized = normalizePath(file)
      if (monitoredSet.has(normalized)) {
        lines.push(`commit ${commit.id || ''}`)
        lines.push(`file ${normalized}`)
      }
    }
  }

  return lines.join('\n')
}

module.exports = {
  buildRawDiff,
  filterMonitoredFiles,
  parseSemanticChanges,
}
