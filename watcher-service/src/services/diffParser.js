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
  return CRITICAL_FIELDS.some((field) => normalized.includes(field.toLowerCase()))
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
    const encodedPath = encodeURIComponent(filePath).replace(/%2F/g, '/')
    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`,
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

function mergeDeep(target, source) {
  if (!isPlainObject(source)) return target

  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      target[key] = mergeDeep({ ...target[key] }, value)
    } else {
      target[key] = value
    }
  }

  return target
}

function parseYamlContent(content) {
  if (!content) return {}

  const documents = []
  yaml.loadAll(content, (doc) => {
    if (doc !== null && doc !== undefined) {
      documents.push(doc)
    }
  })

  return documents.reduce((merged, doc, index) => {
    if (isPlainObject(doc)) {
      return mergeDeep(merged, doc)
    }

    merged[`document${index}`] = doc
    return merged
  }, {})
}

function flattenObject(value, prefix = '', output = {}) {
  if (isPlainObject(value)) {
    for (const [key, childValue] of Object.entries(value)) {
      flattenObject(childValue, prefix ? `${prefix}.${key}` : key, output)
    }
    return output
  }

  if (Array.isArray(value)) {
    value.forEach((childValue, index) => {
      flattenObject(childValue, `${prefix}[${index}]`, output)
    })

    if (value.length === 0 && prefix) {
      output[prefix] = []
    }

    return output
  }

  if (prefix) {
    output[prefix] = value
  }

  return output
}

function hasPath(flattened, path) {
  return Object.prototype.hasOwnProperty.call(flattened, path)
}

function stringifyValue(value) {
  if (value === undefined) return ''
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function valuesEqual(oldValue, newValue) {
  return JSON.stringify(oldValue) === JSON.stringify(newValue)
}

function getChangeType(oldHasPath, newHasPath, oldValue, newValue) {
  if (!oldHasPath) return 'added'
  if (!newHasPath) return 'removed'
  if (typeof oldValue === 'number' && typeof newValue === 'number') {
    if (newValue > oldValue) return 'increase'
    if (newValue < oldValue) return 'decrease'
  }
  return 'modified'
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

function extractAuthorInfo(payload = {}) {
  const commit = payload.commits?.[0] || payload.head_commit || {}
  return {
    author: commit.author?.name || commit.committer?.name || 'Unknown',
    authorEmail: commit.author?.email || commit.committer?.email || '',
  }
}

function compareFlattenedYaml(file, oldYaml, newYaml) {
  const oldFlat = flattenObject(oldYaml)
  const newFlat = flattenObject(newYaml)
  const allPaths = [...new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)])].sort()

  return allPaths
    .filter((fieldPath) => {
      const oldHasPath = hasPath(oldFlat, fieldPath)
      const newHasPath = hasPath(newFlat, fieldPath)
      return oldHasPath !== newHasPath || !valuesEqual(oldFlat[fieldPath], newFlat[fieldPath])
    })
    .map((fieldPath) => {
      const oldHasPath = hasPath(oldFlat, fieldPath)
      const newHasPath = hasPath(newFlat, fieldPath)
      const oldValue = oldFlat[fieldPath]
      const newValue = newFlat[fieldPath]

      return {
        file,
        fieldPath,
        oldValue: stringifyValue(oldValue),
        newValue: stringifyValue(newValue),
        changeType: getChangeType(oldHasPath, newHasPath, oldValue, newValue),
        isCriticalField: isCriticalField(fieldPath),
      }
    })
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

    changes.push(...compareFlattenedYaml(file, parseYamlContent(oldContent), parseYamlContent(newContent)))
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
  extractAuthorInfo,
  filterMonitoredFiles,
  parseSemanticChanges,
}
