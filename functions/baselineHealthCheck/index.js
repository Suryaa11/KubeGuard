const axios = require('axios')
const { BlobServiceClient } = require('@azure/storage-blob')

async function queryPrometheus(prometheusUrl, query) {
  try {
    const response = await axios.get(`${prometheusUrl.replace(/\/$/, '')}/api/v1/query`, {
      params: { query },
      timeout: 8000,
    })
    const result = response.data?.data?.result
    if (!result || result.length === 0) return null
    const val = parseFloat(result[0]?.value?.[1])
    return Number.isNaN(val) ? null : parseFloat(val.toFixed(2))
  } catch {
    return null
  }
}

async function uploadBaseline(projectId, content) {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
  const containerName = process.env.AZURE_STORAGE_CONTAINER || 'kubeguard-reports'

  if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set')
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)
  const containerClient = blobServiceClient.getContainerClient(containerName)
  await containerClient.createIfNotExists()

  const blobPath = `${projectId}/baseline/report.json`
  const blockBlobClient = containerClient.getBlockBlobClient(blobPath)
  const data = JSON.stringify(content, null, 2)
  await blockBlobClient.upload(data, Buffer.byteLength(data), {
    blobHTTPHeaders: { blobContentType: 'application/json' },
  })

  return { blobPath, blobUrl: blockBlobClient.url }
}

module.exports = async function (context, req) {
  const { projectId, prometheusUrl, argocdAppName } = req.body || {}

  if (!projectId || !prometheusUrl || !argocdAppName) {
    context.res = {
      status: 400,
      body: { error: 'ValidationError', message: 'projectId, prometheusUrl, and argocdAppName are required.' },
    }
    return
  }

  context.log(`[baseline] Starting for project ${projectId}, app ${argocdAppName}`)

  const [cpu, memory, pods] = await Promise.all([
    queryPrometheus(
      prometheusUrl,
      `avg(rate(container_cpu_usage_seconds_total{container=~"${argocdAppName}"}[5m])) * 100`
    ),
    queryPrometheus(prometheusUrl, `avg(container_memory_working_set_bytes{container=~"${argocdAppName}"}) / 1024 / 1024`),
    queryPrometheus(prometheusUrl, `count(kube_pod_info{pod=~"${argocdAppName}.*"})`),
  ])

  const metricsAvailable = cpu !== null || memory !== null || pods !== null

  const baseline = {
    type: 'baseline',
    projectId,
    argocdAppName,
    generatedAt: new Date().toISOString(),
    metricsAvailable,
    metrics: {
      cpuUsagePercent: cpu,
      memoryUsageMB: memory,
      activePodCount: pods,
    },
    summary: metricsAvailable
      ? `Baseline recorded. CPU: ${cpu?.toFixed(1) ?? 'n/a'}%, Memory: ${memory?.toFixed(0) ?? 'n/a'} MB, Pods: ${pods ?? 'n/a'}.`
      : 'Baseline could not be recorded - Prometheus was not reachable at project creation time.',
    status: metricsAvailable ? 'healthy' : 'metrics_unavailable',
  }

  try {
    const { blobPath, blobUrl } = await uploadBaseline(projectId, baseline)
    context.log(`[baseline] Saved to ${blobPath}`)
    context.res = { status: 200, body: { success: true, blobPath, blobUrl, baseline } }
  } catch (error) {
    context.log.error(`[baseline] Failed to save: ${error.message}`)
    context.res = { status: 500, body: { error: 'StorageError', message: error.message } }
  }
}
