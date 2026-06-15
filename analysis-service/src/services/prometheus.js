const axios = require('axios')

function emptyLiveMetrics() {
  return {
    available: false,
    cpuUsagePercent: null,
    memoryUsageMB: null,
    activePodCount: null,
    requestsPerSecond: null,
    errorRatePercent: null,
    p95LatencyMs: null,
    queryTime: new Date().toISOString(),
  }
}

function emptyHistoricalPeak() {
  return {
    available: false,
    cpuUsagePercent: null,
    memoryUsageMB: null,
    peakDate: null,
  }
}

async function queryValue(prometheusUrl, query) {
  if (!prometheusUrl) return null

  try {
    const response = await axios.get(`${prometheusUrl.replace(/\/$/, '')}/api/v1/query`, {
      params: { query },
      timeout: 5000,
    })

    const value = response.data?.data?.result?.[0]?.value?.[1]
    return value === undefined ? null : Number(value)
  } catch (error) {
    return null
  }
}

async function queryLiveMetrics(prometheusUrl, appName) {
  if (!prometheusUrl || !appName) return emptyLiveMetrics()

  const queries = {
    cpuUsagePercent: `sum(rate(container_cpu_usage_seconds_total{pod=~"${appName}.*",container!="POD"}[5m])) * 100`,
    memoryUsageMB: `sum(container_memory_working_set_bytes{pod=~"${appName}.*",container!="POD"}) / 1024 / 1024`,
    activePodCount: `sum(kube_deployment_status_replicas_available{deployment="${appName}"})`,
    requestsPerSecond: `sum(rate(http_requests_total{app="${appName}"}[5m]))`,
    errorRatePercent: `sum(rate(http_requests_total{app="${appName}",status=~"5.."}[5m])) / sum(rate(http_requests_total{app="${appName}"}[5m])) * 100`,
    p95LatencyMs: `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{app="${appName}"}[5m])) by (le)) * 1000`,
  }

  const results = await Promise.allSettled(
    Object.values(queries).map((query) => queryValue(prometheusUrl, query))
  )
  const values = Object.keys(queries).reduce((acc, key, index) => {
    acc[key] = results[index].status === 'fulfilled' ? results[index].value : null
    return acc
  }, {})

  const available = Object.values(values).some((value) => value !== null)
  return {
    available,
    ...values,
    queryTime: new Date().toISOString(),
  }
}

async function queryHistoricalPeak(prometheusUrl, appName) {
  if (!prometheusUrl || !appName) return emptyHistoricalPeak()

  const queries = {
    cpuUsagePercent: `max_over_time((sum(rate(container_cpu_usage_seconds_total{pod=~"${appName}.*",container!="POD"}[5m])) * 100)[30d:])`,
    memoryUsageMB: `max_over_time((sum(container_memory_working_set_bytes{pod=~"${appName}.*",container!="POD"}) / 1024 / 1024)[30d:])`,
  }

  const results = await Promise.allSettled(
    Object.values(queries).map((query) => queryValue(prometheusUrl, query))
  )
  const values = Object.keys(queries).reduce((acc, key, index) => {
    acc[key] = results[index].status === 'fulfilled' ? results[index].value : null
    return acc
  }, {})

  if (Object.values(values).every((value) => value === null)) {
    return emptyHistoricalPeak()
  }

  return {
    available: true,
    ...values,
    peakDate: new Date().toISOString(),
  }
}

module.exports = { queryLiveMetrics, queryHistoricalPeak }
