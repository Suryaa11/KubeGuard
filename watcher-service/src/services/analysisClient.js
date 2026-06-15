const axios = require('axios')

async function triggerAnalysis(eventId, projectId) {
  await axios.post(
    `${process.env.ANALYSIS_SERVICE_URL}/internal/analyze`,
    { eventId, projectId },
    {
      headers: { 'x-internal-secret': process.env.INTERNAL_SECRET },
      timeout: 10000,
    }
  )
}

module.exports = { triggerAnalysis }
