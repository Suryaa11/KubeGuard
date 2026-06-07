const axios = require('axios')

module.exports = async function (context, mySbMsg) {
  const body = typeof mySbMsg === 'string' ? JSON.parse(mySbMsg) : mySbMsg

  context.log(`[email-dispatcher] Processing: eventId=${body.eventId}, risk=${body.riskScore}`)

  try {
    const analysisUrl = process.env.ANALYSIS_SERVICE_URL
    const internalSecret = process.env.INTERNAL_SECRET

    const reportResp = await axios.get(`${analysisUrl}/internal/reports/${body.eventId}`, {
      headers: { 'x-internal-secret': internalSecret },
      timeout: 10000,
    })

    context.log(
      `[email-dispatcher] Report fetched for event ${body.eventId}, risk=${reportResp.data.report?.riskScore}`
    )
    const adminEmails = Array.isArray(body.adminEmails)
      ? body.adminEmails
      : String(body.adminEmails || '')
          .split(',')
          .map((email) => email.trim())
          .filter(Boolean)
    context.log(`[email-dispatcher] Admin emails: ${adminEmails.join(', ')}`)
    context.log('[email-dispatcher] Email dispatch delegated to Notification Service consumer.')
  } catch (error) {
    context.log.error(`[email-dispatcher] Failed: ${error.message}`)
    throw error
  }
}
