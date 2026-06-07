const yaml = require('js-yaml')

const CRITICAL_FIELDS = new Set([
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
])

function flattenObject(obj, prefix = '') {
  const result = {}
  for (const [key, value] of Object.entries(obj || {})) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, path))
    } else {
      result[path] = String(value ?? '')
    }
  }
  return result
}

function determineChangeType(oldVal, newVal) {
  const oldNum = parseFloat(oldVal)
  const newNum = parseFloat(newVal)
  if (!Number.isNaN(oldNum) && !Number.isNaN(newNum)) {
    if (newNum > oldNum) return 'increase'
    if (newNum < oldNum) return 'decrease'
    return 'modified'
  }
  return 'modified'
}

function isCritical(fieldPath) {
  return fieldPath.split('.').some((part) => CRITICAL_FIELDS.has(part))
}

function extractFilesFromDiff(rawDiff) {
  const fileBlocks = []
  const segments = rawDiff.split(/^diff --git /m).filter(Boolean)

  for (const segment of segments) {
    const lines = segment.split('\n')
    const fileMatch = lines[0].match(/a\/.+ b\/(.+)/)
    if (!fileMatch) continue
    const filePath = fileMatch[1].trim()

    const oldLines = []
    const newLines = []
    let inHunk = false

    for (const line of lines) {
      if (line.startsWith('@@')) {
        inHunk = true
        continue
      }
      if (!inHunk) continue
      if (line.startsWith('-') && !line.startsWith('---')) oldLines.push(line.slice(1))
      else if (line.startsWith('+') && !line.startsWith('+++')) newLines.push(line.slice(1))
      else if (!line.startsWith('\\')) {
        oldLines.push(line)
        newLines.push(line)
      }
    }

    fileBlocks.push({ filePath, oldContent: oldLines.join('\n'), newContent: newLines.join('\n') })
  }

  return fileBlocks
}

function parseSemanticChanges(rawDiff) {
  const changes = []
  const fileBlocks = extractFilesFromDiff(rawDiff)

  for (const { filePath, oldContent, newContent } of fileBlocks) {
    if (!filePath.endsWith('.yaml') && !filePath.endsWith('.yml')) continue

    let oldObj
    let newObj
    try {
      oldObj = yaml.load(oldContent) || {}
    } catch {
      oldObj = {}
    }
    try {
      newObj = yaml.load(newContent) || {}
    } catch {
      newObj = {}
    }

    const oldFlat = flattenObject(oldObj)
    const newFlat = flattenObject(newObj)
    const allKeys = new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)])

    for (const key of allKeys) {
      const oldVal = oldFlat[key]
      const newVal = newFlat[key]

      if (oldVal === newVal) continue

      let changeType
      if (oldVal === undefined) changeType = 'added'
      else if (newVal === undefined) changeType = 'removed'
      else changeType = determineChangeType(oldVal, newVal)

      changes.push({
        file: filePath,
        fieldPath: key,
        oldValue: oldVal ?? '',
        newValue: newVal ?? '',
        changeType,
        isCriticalField: isCritical(key),
      })
    }
  }

  return changes
}

function filterMonitoredFiles(changedFiles, folderPath) {
  const normalized = folderPath.replace(/^\//, '')
  return changedFiles.filter((file) => file.replace(/^\//, '').startsWith(normalized))
}

module.exports = { parseSemanticChanges, filterMonitoredFiles }
