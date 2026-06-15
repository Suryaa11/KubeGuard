const { generateApprovalToken } = require('./approvalToken')
const logger = require('../utils/logger')

function riskColor(riskScore) {
  const colors = {
    low: '#15803d',
    medium: '#ca8a04',
    high: '#ea580c',
    critical: '#dc2626',
  }
  return colors[String(riskScore || '').toLowerCase()] || '#475569'
}

function resolveRecipients(adminEmails = []) {
  const fromMessage = Array.isArray(adminEmails) ? adminEmails : []
  const fromEnv = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)

  const recipients = [...new Set([...fromMessage, ...fromEnv])]
  return recipients.length > 0 ? recipients : [process.env.EMAIL_FROM || 'noreply@kubeguard.com']
}

function buildHtml(report, project, approveLink, rejectLink) {
  const color = riskColor(report.riskScore)
  const reportUrl = report.reportBlobUrl
    ? `<p><a href="${report.reportBlobUrl}">Open full report</a></p>`
    : ''

  return [
    '<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">',
    `<h2>KubeGuard Deployment Decision Required</h2>`,
    `<p><strong>Project:</strong> ${project.name || report.projectName || report.projectId}</p>`,
    `<p><strong>Risk:</strong> <span style="color:${color};font-weight:bold">${String(report.riskScore || 'unknown').toUpperCase()}</span></p>`,
    `<p><strong>Changes:</strong> ${report.changesSummary || 'No summary provided'}</p>`,
    `<p><strong>Recommendation:</strong> ${report.recommendation || 'Manual review required'}</p>`,
    `<p><strong>Risk reason:</strong> ${report.riskReason || 'No risk reason provided'}</p>`,
    reportUrl,
    `<p><a style="background:#15803d;color:#fff;padding:10px 14px;text-decoration:none;border-radius:6px" href="${approveLink}">Approve Deployment</a></p>`,
    `<p><a style="background:#dc2626;color:#fff;padding:10px 14px;text-decoration:none;border-radius:6px" href="${rejectLink}">Reject Deployment</a></p>`,
    '</div>',
  ].join('')
}

async function sendApprovalEmail(report, project, adminEmails = []) {
  const recipients = resolveRecipients(adminEmails)
  const approveToken = generateApprovalToken(report.eventId, 'approved')
  const rejectToken = generateApprovalToken(report.eventId, 'rejected')
  const gatewayUrl = String(process.env.GATEWAY_URL || '').replace(/\/$/, '')
  const approveLink = `${gatewayUrl}/api/notify/decide?token=${approveToken}`
  const rejectLink = `${gatewayUrl}/api/notify/decide?token=${rejectToken}`
  const subject = `KubeGuard - Risk: ${String(report.riskScore || 'unknown').toUpperCase()} - ${project.name || report.projectName || report.projectId}`
  const htmlContent = buildHtml(report, project, approveLink, rejectLink)

  if ((process.env.EMAIL_PROVIDER || 'console') === 'console') {
    recipients.forEach((recipient) => {
      console.log(`[EMAIL] TO: ${recipient}`)
      console.log(`[EMAIL] SUBJECT: ${subject}`)
      console.log(`[EMAIL] APPROVE LINK: ${approveLink}`)
      console.log(`[EMAIL] REJECT LINK: ${rejectLink}`)
      console.log(`[EMAIL] BODY: ${htmlContent}`)
    })

    logger.info(`Email sent (console) for event: ${report.eventId}`)
    return { success: true, provider: 'console', recipients }
  }

  logger.warn('EMAIL_PROVIDER=sendgrid requested, but SendGrid is not configured in this build')
  return { success: false, provider: 'sendgrid', recipients, error: 'SendGrid not configured' }
}

module.exports = { sendApprovalEmail, buildHtml, resolveRecipients }
