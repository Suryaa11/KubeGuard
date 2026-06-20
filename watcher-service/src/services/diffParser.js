const axios = require('axios')
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isCriticalField(fieldPath = '') {
  const normalized = fieldPath.toLowerCase()
  return CRITICAL_FIELDS.some((field) => {
    const critical = field.toLowerCase()
    return normalized === critical || normalized.endsWith(`.${critical}`) || normalized.includes(`.${critical}.`)
  })
}

function parseGithubRepoUrl(githubRepoUrl = '') {
  const match = githubRepoUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i)
  if (!match) {
    throw new Error(`Invalid GitHub repository URL: ${githubRepoUrl}`)
  }

  return {
    owner: match[1],
    repo: match[2],
  }
}

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  return headers
}

async function fetchGithubFile({ owner, repo, filePath, ref }) {
  if (!ref) return null

  try {
    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, '/')}`,
      {
        headers: githubHeaders(),
        params: { ref },
        timeout: 10000,
      }
    )

    if (!response.data || Array.isArray(response.data) || !response.data.content) {
      return null
    }

    return Buffer.from(response.data.content, response.data.encoding || 'base64').toString('utf8')
  } catch (error) {
    if (error.response?.status === 404) {
      return null
    }
    throw error
  }
}

function parseYamlContent(content) {
  if (!content) return undefined
  const parsed = yaml.load(content)
  return parsed === null ? undefined : parsed
}

function valueToString(value) {
  if (value === undefined) return ''
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function changeTypeForValues(oldValue, newValue) {
  if (oldValue === undefined) return 'added'
  if (newValue === undefined) return 'removed'
  if (typeof oldValue === 'number' && typeof newValue === 'number') {
    if (newValue > oldValue) return 'increase'
    if (newValue < oldValue) return 'decrease'
  }
  return 'modified'
}

function childPath(parentPath, key) {
  if (typeof key === 'number') {
    return `${parentPath}[${key}]`
  }
  return parentPath ? `${parentPath}.${key}` : key
}

function compareValues(oldValue, newValue, fieldPath, file, changes) {
  if (valuesEqual(oldValue, newValue)) return

  if (isPlainObject(oldValue) || isPlainObject(newValue)) {
    const keys = new Set([
      ...Object.keys(isPlainObject(oldValue) ? oldValue : {}),
      ...Object.keys(isPlainObject(newValue) ? newValue : {}),
    ])

    for (const key of keys) {
      compareValues(
        isPlainObject(oldValue) ? oldValue[key] : undefined,
        isPlainObject(newValue) ? newValue[key] : undefined,
        childPath(fieldPath, key),
        file,
        changes
      )
    }
    return
  }

  if (Array.isArray(oldValue) || Array.isArray(newValue)) {
    const oldArray = Array.isArray(oldValue) ? oldValue : []
    const newArray = Array.isArray(newValue) ? newValue : []
    const maxLength = Math.max(oldArray.length, newArray.length)

    for (let index = 0; index < maxLength; index += 1) {
      compareValues(oldArray[index], newArray[index], childPath(fieldPath, index), file, changes)
    }
    return
  }

  changes.push({
    file,
    fieldPath: fieldPath || file,
    oldValue: valueToString(oldValue),
    newValue: valueToString(newValue),
    changeType: changeTypeForValues(oldValue, newValue),
    isCriticalField: isCriticalField(fieldPath) || isCriticalField(file),
  })
}

function collectChangedYamlFiles(payload = {}, monitoredFiles = []) {
  const monitoredSet = new Set(monitoredFiles.map(normalizePath))
  const fileChanges = new Map()

  for (const commit of payload.commits || []) {
    for (const file of commit.added || []) {
      const normalized = normalizePath(file)
      if (monitoredSet.has(normalized) && isYamlFile(normalized)) {
        fileChanges.set(normalized, 'added')
      }
    }

    for (const file of commit.modified || []) {
      const normalized = normalizePath(file)
      if (monitoredSet.has(normalized) && isYamlFile(normalized)) {
        fileChanges.set(normalized, fileChanges.get(normalized) === 'added' ? 'added' : 'modified')
      }
    }

    for (const file of commit.removed || []) {
      const normalized = normalizePath(file)
      if (monitoredSet.has(normalized) && isYamlFile(normalized)) {
        fileChanges.set(normalized, 'removed')
      }
    }
  }

  return [...fileChanges.entries()].map(([file, changeType]) => ({ file, changeType }))
}

async function parseSemanticChanges(payload = {}, project = {}, monitoredFiles = []) {
  const repoInfo = parseGithubRepoUrl(project.githubRepoUrl)
  const oldCommitSha = payload.before
  const newCommitSha = payload.after
  const changes = []
  const yamlFiles = collectChangedYamlFiles(payload, monitoredFiles)

  for (const { file, changeType } of yamlFiles) {
    const [oldContent, newContent] = await Promise.all([
      changeType === 'added'
        ? Promise.resolve(null)
        : fetchGithubFile({ ...repoInfo, filePath: file, ref: oldCommitSha }),
      changeType === 'removed'
        ? Promise.resolve(null)
        : fetchGithubFile({ ...repoInfo, filePath: file, ref: newCommitSha }),
    ])

    const oldYaml = parseYamlContent(oldContent)
    const newYaml = parseYamlContent(newContent)
    compareValues(oldYaml, newYaml, '', file, changes)
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
