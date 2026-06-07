const axios = require('axios')

async function pauseSync(argocdUrl, argocdToken, appName) {
  try {
    await axios.patch(
      `${argocdUrl}/api/v1/applications/${appName}`,
      { spec: { syncPolicy: null } },
      {
        headers: { Authorization: `Bearer ${argocdToken}` },
        timeout: 8000,
      }
    )
    console.log(`[watcher] ArgoCD sync paused for: ${appName}`)
    return { success: true, error: null }
  } catch (error) {
    const message = error.response?.data?.message || error.message
    console.error(`[watcher] ArgoCD pause failed for ${appName}: ${message}`)
    return { success: false, error: message }
  }
}

module.exports = { pauseSync }
