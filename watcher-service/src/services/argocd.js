const axios = require('axios')
const https = require('https')
const logger = require('../utils/logger')

const httpsAgent = new https.Agent({ rejectUnauthorized: false })

async function pauseArgocdSync(argocdUrl, argocdToken, appName) {
  if (!argocdUrl || !argocdToken || !appName) {
    return { success: false, error: 'Missing ArgoCD configuration' }
  }
  try {
    // First get current app spec
    const getRes = await axios.get(
      `${argocdUrl}/api/v1/applications/${appName}`,
      {
        headers: { Authorization: `Bearer ${argocdToken}` },
        timeout: 5000,
        httpsAgent,
      }
    )
    const app = getRes.data
    // Remove syncPolicy to disable auto-sync
    if (app.spec) {
      app.spec.syncPolicy = null
    }
    // PUT the full app back with syncPolicy removed
    await axios.put(
      `${argocdUrl}/api/v1/applications/${appName}`,
      app,
      {
        headers: {
          Authorization: `Bearer ${argocdToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
        httpsAgent,
      }
    )
    logger.info(`ArgoCD sync paused for ${appName}`)
    return { success: true }
  } catch (error) {
    const message = error.response?.data?.message || error.message
    logger.error(`ArgoCD pause failed for ${appName}: ${message}`)
    return { success: false, error: message }
  }
}

module.exports = { pauseArgocdSync }
