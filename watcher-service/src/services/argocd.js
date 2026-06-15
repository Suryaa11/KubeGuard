const axios = require('axios')
const logger = require('../utils/logger')

async function pauseArgocdSync(argocdUrl, argocdToken, appName) {
  if (!argocdUrl || !argocdToken || !appName) {
    return { success: false, error: 'Missing ArgoCD configuration' }
  }

  try {
    await axios.patch(
      `${argocdUrl}/api/v1/applications/${appName}`,
      { spec: { syncPolicy: null } },
      {
        headers: { Authorization: `Bearer ${argocdToken}` },
        timeout: 5000,
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
