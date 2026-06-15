const axios = require('axios')
const logger = require('../utils/logger')

async function resumeArgocdSync(argocdUrl, argocdToken, appName) {
  if (!argocdUrl || !argocdToken || !appName) {
    return { success: false, error: 'Missing ArgoCD connection details' }
  }

  try {
    await axios.post(
      `${String(argocdUrl).replace(/\/$/, '')}/api/v1/applications/${encodeURIComponent(appName)}/sync`,
      { prune: false, dryRun: false },
      {
        headers: { Authorization: `Bearer ${argocdToken}` },
        timeout: 5000,
      }
    )

    return { success: true }
  } catch (error) {
    logger.warn(`ArgoCD resume failed: ${error.message}`)
    return { success: false, error: error.message }
  }
}

module.exports = { resumeArgocdSync }
