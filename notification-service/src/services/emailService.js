const nodemailer = require('nodemailer')
const PDFDocument = require('pdfkit')

const { generateApprovalToken } = require('./approvalToken')
const logger = require('../utils/logger')

const PUBLIC_DECISION_BASE_URL = 'https://kubeguard.hmsclinic.online/api/notify/decide'

function riskColor(riskScore) {
  const colors = {
    low: '#15803d',
    medium: '#ca8a04',
    high: '#ea580c',
    critical: '#dc2626',
  }
  return colors[String(riskScore || '').toLowerCase()] || '#475569'
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function stripMarkdown(markdown = '') {
  return String(markdown || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '- ')
    .trim()
}

function resolveRecipients(adminEmails = []) {
  const fromMessage = Array.isArray(adminEmails) ? adminEmails : []
  const fromEnv = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)

  return [...new Set([...fromMessage, ...fromEnv].filter(Boolean))]
}

function buildDecisionLink(token) {
  return `${PUBLIC_DECISION_BASE_URL}?token=${encodeURIComponent(token)}`
}

function metricValue(metrics, keys) {
  for (const key of keys) {
    const value = key.split('.').reduce((current, part) => current?.[part], metrics)
    if (value !== undefined && value !== null && value !== '') {
      return typeof value === 'object' ? JSON.stringify(value) : String(value)
    }
  }
  return 'Unavailable'
}

function semanticChangesRows(report) {
  const changes = Array.isArray(report.semanticChanges) ? report.semanticChanges : []
  if (!changes.length) {
    return [
      {
        fieldPath: 'No semantic changes provided',
        oldValue: '',
        newValue: '',
        changeType: '',
      },
    ]
  }

  return changes.map((change) => ({
    file: change.file || '',
    fieldPath: change.fieldPath || change.path || change.field || change.key || 'unknown',
    oldValue: change.oldValue ?? '',
    newValue: change.newValue ?? '',
    changeType: change.changeType || 'modified',
  }))
}

function buildHtml(report, project, approveLink, rejectLink) {
  const color = riskColor(report.riskScore)
  const rows = semanticChangesRows(report)
    .map(
      (change) => `
        <tr>
          <td style="border:1px solid #e5e7eb;padding:6px">${escapeHtml(change.file)}</td>
          <td style="border:1px solid #e5e7eb;padding:6px">${escapeHtml(change.fieldPath)}</td>
          <td style="border:1px solid #e5e7eb;padding:6px">${escapeHtml(change.oldValue)}</td>
          <td style="border:1px solid #e5e7eb;padding:6px">${escapeHtml(change.newValue)}</td>
          <td style="border:1px solid #e5e7eb;padding:6px">${escapeHtml(change.changeType)}</td>
        </tr>`
    )
    .join('')

  return [
    '<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">',
    '<h2>KubeGuard Deployment Decision Required</h2>',
    `<p><strong>Project:</strong> ${escapeHtml(project.name || report.projectName || report.projectId)}</p>`,
    `<p><strong>Commit:</strong> ${escapeHtml(report.commitSha || 'unknown')}</p>`,
    `<p><strong>Risk:</strong> <span style="color:${color};font-weight:bold">${escapeHtml(String(report.riskScore || 'unknown').toUpperCase())}</span></p>`,
    `<p><strong>Recommendation:</strong> ${escapeHtml(report.recommendation || 'Manual review required')}</p>`,
    `<p><strong>Changes:</strong> ${escapeHtml(report.changesSummary || 'No summary provided')}</p>`,
    '<table style="border-collapse:collapse;width:100%;margin:16px 0">',
    '<thead><tr>',
    '<th style="border:1px solid #e5e7eb;padding:6px;text-align:left">File</th>',
    '<th style="border:1px solid #e5e7eb;padding:6px;text-align:left">Field</th>',
    '<th style="border:1px solid #e5e7eb;padding:6px;text-align:left">Old</th>',
    '<th style="border:1px solid #e5e7eb;padding:6px;text-align:left">New</th>',
    '<th style="border:1px solid #e5e7eb;padding:6px;text-align:left">Type</th>',
    '</tr></thead>',
    `<tbody>${rows}</tbody>`,
    '</table>',
    `<p><a style="background:#15803d;color:#fff;padding:10px 14px;text-decoration:none;border-radius:6px;display:inline-block" href="${approveLink}">Approve</a></p>`,
    `<p><a style="background:#dc2626;color:#fff;padding:10px 14px;text-decoration:none;border-radius:6px;display:inline-block" href="${rejectLink}">Reject</a></p>`,
    '<p>The full PDF risk report is attached.</p>',
    '</div>',
  ].join('')
}

function writeWrapped(doc, label, value) {
  doc.font('Helvetica-Bold').text(`${label}: `, { continued: true })
  doc.font('Helvetica').text(String(value || 'Unavailable'))
}

function drawSemanticChanges(doc, report) {
  doc.moveDown()
  doc.fontSize(14).font('Helvetica-Bold').text('What Changed')
  doc.moveDown(0.4)

  for (const change of semanticChangesRows(report)) {
    doc.fontSize(9).font('Helvetica-Bold').text(change.file || 'File unavailable')
    doc.font('Helvetica').text(`Field: ${change.fieldPath}`)
    doc.text(`Old: ${String(change.oldValue || '')}`)
    doc.text(`New: ${String(change.newValue || '')}`)
    doc.text(`Type: ${change.changeType || ''}`)
    doc.moveDown(0.5)
  }
}

function generateReportPdf(report, project) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' })
    const chunks = []

    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    doc.fontSize(20).font('Helvetica-Bold').text('KubeGuard AI Risk Report')
    doc.moveDown()

    doc.fontSize(11)
    writeWrapped(doc, 'Project name', project.name || report.projectName || report.projectId)
    writeWrapped(doc, 'Commit SHA', report.commitSha || 'unknown')
    writeWrapped(doc, 'Commit message', report.commitMessage || report.message || 'unknown')
    writeWrapped(doc, 'Risk score', String(report.riskScore || 'unknown').toUpperCase())
    writeWrapped(doc, 'Recommendation', report.recommendation || 'Manual review required')

    drawSemanticChanges(doc, report)

    doc.moveDown()
    doc.fontSize(14).font('Helvetica-Bold').text('Cluster Metrics At Analysis Time')
    doc.moveDown(0.4)
    doc.fontSize(10).font('Helvetica')
    writeWrapped(doc, 'CPU', metricValue(report.liveMetrics, ['cpu', 'cpuUsage', 'cpuUsagePercent', 'current.cpu']))
    writeWrapped(doc, 'Memory', metricValue(report.liveMetrics, ['memory', 'memoryUsage', 'memoryUsagePercent', 'current.memory']))
    writeWrapped(doc, 'Pods', metricValue(report.liveMetrics, ['pods', 'podCount', 'current.pods']))

    doc.moveDown()
    doc.fontSize(14).font('Helvetica-Bold').text('AI Risk Analysis')
    doc.moveDown(0.4)
    doc.fontSize(10).font('Helvetica').text(stripMarkdown(report.reportMarkdown || report.riskReason || 'No AI report text provided.'), {
      align: 'left',
    })

    doc.end()
  })
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

async function sendApprovalEmail(report, project, adminEmails = []) {
  const recipients = resolveRecipients(adminEmails)
  if (!recipients.length) {
    logger.warn('No admin email recipients configured')
    return { success: false, provider: process.env.EMAIL_PROVIDER || 'smtp', recipients, error: 'No recipients configured' }
  }

  const approveToken = generateApprovalToken(report.eventId, 'approved')
  const rejectToken = generateApprovalToken(report.eventId, 'rejected')
  const approveLink = buildDecisionLink(approveToken)
  const rejectLink = buildDecisionLink(rejectToken)
  const subject = `KubeGuard - Risk: ${String(report.riskScore || 'unknown').toUpperCase()} - ${project.name || report.projectName || report.projectId}`
  const htmlContent = buildHtml(report, project, approveLink, rejectLink)
  const pdfBuffer = await generateReportPdf(report, project)
  const provider = process.env.EMAIL_PROVIDER || 'smtp'

  if (provider === 'console') {
    recipients.forEach((recipient) => {
      console.log(`[EMAIL] TO: ${recipient}`)
      console.log(`[EMAIL] SUBJECT: ${subject}`)
      console.log(`[EMAIL] APPROVE LINK: ${approveLink}`)
      console.log(`[EMAIL] REJECT LINK: ${rejectLink}`)
      console.log(`[EMAIL] PDF ATTACHMENT BYTES: ${pdfBuffer.length}`)
      console.log(`[EMAIL] BODY: ${htmlContent}`)
    })

    logger.info(`Email rendered (console) for event: ${report.eventId}`)
    return { success: true, provider: 'console', recipients }
  }

  const transporter = createTransporter()
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: recipients.join(','),
    subject,
    html: htmlContent,
    attachments: [
      {
        filename: `kubeguard-risk-report-${report.eventId || Date.now()}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  })

  logger.info(`Email sent (smtp) for event: ${report.eventId}`)
  return { success: true, provider: 'smtp', recipients }
}

module.exports = { sendApprovalEmail, buildHtml, resolveRecipients, generateReportPdf }
