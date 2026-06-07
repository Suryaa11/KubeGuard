const axios = require('axios')

function buildApiUrl(prometheusUrl, path) {
  return `${prometheusUrl.replace(/\/$/, '')}${path}`
}

async function queryPrometheus(prometheusUrl, query) {
  if (!prometheusUrl) return null
  try {
    const response = await axios.get(buildApiUrl(prometheusUrl, '/api/v1/query'), {
      params: { query },
      timeout: 10000,
    })
    const result = response.data?.data?.result
    if (!Array.isArray(result) || result.length === 0) return null
    const value = result[0]?.value?.[1]
    return value === undefined ? null : Number(value)
  } catch (error) {
    return null
  }
}

async function getLiveMetrics(prometheusUrl, appName) {
  const [cpu, memory, replicas] = await Promise.allSettled([
    queryPrometheus(
      prometheusUrl,
      `sum(rate(container_cpu_usage_seconds_total{pod=~"${appName}.*",container!="POD"}[5m]))`
    ),
    queryPrometheus(
      prometheusUrl,
      `sum(container_memory_working_set_bytes{pod=~"${appName}.*",container!="POD"})`
    ),
    queryPrometheus(prometheusUrl, `sum(kube_deployment_status_replicas_available{deployment="${appName}"})`),
  ])

  const metrics = {
    available: false,
    cpuUsage: null,
    memoryUsage: null,
    replicas: null,
  }

  const values = [cpu, memory, replicas].map((entry) => (entry.status === 'fulfilled' ? entry.value : null))
  if (values.some((value) => value !== null)) {
    metrics.available = true
    metrics.cpuUsage = values[0]
    metrics.memoryUsage = values[1]
    metrics.replicas = values[2]
  }

  return metrics
}

async function getHistoricalPeak(prometheusUrl, appName, days = 30) {
  const window = `${days}d`
  const [cpu, memory] = await Promise.allSettled([
    queryPrometheus(
      prometheusUrl,
      `max_over_time(sum(rate(container_cpu_usage_seconds_total{pod=~"${appName}.*",container!="POD"}[5m]))[${window}:])`
    ),
    queryPrometheus(
      prometheusUrl,
      `max_over_time(sum(container_memory_working_set_bytes{pod=~"${appName}.*",container!="POD"})[${window}:])`
    ),
  ])

  const values = [cpu, memory].map((entry) => (entry.status === 'fulfilled' ? entry.value : null))
  if (values.every((value) => value === null)) {
    return { available: false, cpuPeak: null, memoryPeak: null }
  }

  return {
    available: true,
    cpuPeak: values[0],
    memoryPeak: values[1],
  }
}

module.exports = { getLiveMetrics, getHistoricalPeak }
