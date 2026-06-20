const nodemailer = require('nodemailer')
const PDFDocument = require('pdfkit')

const { generateApprovalToken } = require('./approvalToken')
const logger = require('../utils/logger')

function trimTrailingSlash(url) {
  return String(url || '').replace(/\/$/, '')
}

function publicGatewayUrl() {
  return (
    trimTrailingSlash(process.env.PUBLIC_GATEWAY_URL) ||
    trimTrailingSlash(process.env.FRONTEND_URL) ||
    trimTrailingSlash(process.env.GATEWAY_URL) ||
    'https://kubeguard.hmsclinic.online'
  )
}

function buildDecisionLink(token) {
  return `${publicGatewayUrl()}/api/notify/decide?token=${encodeURIComponent(token)}`
}

function riskMeta(riskScore) {
  const score = String(riskScore || 'unknown').toLowerCase()
  const map = {
    low: { label: 'LOW', emailColor: '#22c55e', pdfRgb: [34, 197, 94] },
    medium: { label: 'MEDIUM', emailColor: '#f59e0b', pdfRgb: [245, 158, 11] },
    high: { label: 'HIGH', emailColor: '#f97316', pdfRgb: [249, 115, 22] },
    critical: { label: 'CRITICAL', emailColor: '#ef4444', pdfRgb: [239, 68, 68] },
  }

  return map[score] || { label: score.toUpperCase(), emailColor: '#64748b', pdfRgb: [100, 116, 139] }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function stripMarkdown(markdown = '') {
  return String(markdown || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[`#>*_]/g, '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-+]\s+/gm, '- ')
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

function shortSha(sha) {
  return String(sha || 'unknown').slice(0, 7)
}

function formatValue(value, fallback = 'Unavailable') {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function getPathValue(source, path) {
  return path.split('.').reduce((current, part) => current?.[part], source)
}

function firstValue(source, paths, fallback = 'Unavailable') {
  for (const path of paths) {
    const value = getPathValue(source, path)
    if (value !== undefined && value !== null && value !== '') {
      return formatValue(value, fallback)
    }
  }

  return fallback
}

function clusterMetrics(report) {
  const live = report.liveMetrics || report.metrics || {}
  const historicalPeak = report.historicalPeak || {}

  return {
    cpuUsagePercent: firstValue(live, ['cpuUsagePercent', 'cpuPercent', 'cpu', 'cpuUsage', 'current.cpu']),
    memoryUsageMB: firstValue(live, ['memoryUsageMB', 'memoryUsageMb', 'memoryMB', 'memoryMb', 'memory', 'current.memory']),
    activePodCount: firstValue(live, ['activePodCount', 'podCount', 'pods', 'current.pods']),
    peakCpuUsagePercent: firstValue(historicalPeak, ['cpuUsagePercent', 'cpuPercent', 'peakCpuPercent', 'cpu', 'peakCpu']),
    peakMemoryUsageMB: firstValue(historicalPeak, ['memoryUsageMB', 'memoryUsageMb', 'memoryMB', 'memoryMb', 'peakMemory']),
  }
}

function semanticChangesRows(report) {
  const changes = Array.isArray(report.semanticChanges) ? report.semanticChanges : []
  return changes.map((change) => ({
    fieldPath: change.fieldPath || change.path || change.field || change.key || 'unknown',
    oldValue: formatValue(change.oldValue, ''),
    newValue: formatValue(change.newValue, ''),
    changeType: change.changeType || 'modified',
    isCriticalField: Boolean(change.isCriticalField),
  }))
}

function recommendationLabel(recommendation) {
  return String(recommendation || 'manual review required').replace(/_/g, ' ').toUpperCase()
}

function buildChangesTableHtml(report) {
  const rows = semanticChangesRows(report)

  if (!rows.length) {
    return '<p style="margin:0;color:#9ca3af">No structural changes detected</p>'
  }

  return `
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <thead>
        <tr>
          <th style="padding:10px;border-bottom:1px solid #2a2f3a;color:#9ca3af;text-align:left">Field</th>
          <th style="padding:10px;border-bottom:1px solid #2a2f3a;color:#9ca3af;text-align:left">Old Value</th>
          <th style="padding:10px;border-bottom:1px solid #2a2f3a;color:#9ca3af;text-align:left">New Value</th>
          <th style="padding:10px;border-bottom:1px solid #2a2f3a;color:#9ca3af;text-align:left">Type</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((change) => {
            const fieldColor = change.isCriticalField ? '#f97316' : '#e5e7eb'
            return `
              <tr>
                <td style="padding:10px;border-bottom:1px solid #20242d;color:${fieldColor};font-weight:700">${escapeHtml(change.fieldPath)}</td>
                <td style="padding:10px;border-bottom:1px solid #20242d;color:#fca5a5">${escapeHtml(change.oldValue)}</td>
                <td style="padding:10px;border-bottom:1px solid #20242d;color:#86efac">${escapeHtml(change.newValue)}</td>
                <td style="padding:10px;border-bottom:1px solid #20242d;color:#cbd5e1;text-transform:uppercase">${escapeHtml(change.changeType)}</td>
              </tr>`
          })
          .join('')}
      </tbody>
    </table>`
}

function buildHtml(report, project, approveLink, rejectLink) {
  const risk = riskMeta(report.riskScore)
  const metrics = clusterMetrics(report)
  const projectName = project.name || report.projectName || report.projectId || 'Unknown project'
  const commitMessage = report.commitMessage || report.message || 'No commit message provided'
  const author = report.author || report.commitAuthor || 'Unknown'
  const authorEmail = report.authorEmail || report.commitAuthorEmail || ''
  const branch = report.branch || project.branch || 'unknown'
  const timestamp = formatValue(report.generatedAt || new Date().toISOString())

  return `
    <div style="background:#0f1117;margin:0;padding:32px 16px;color:#e5e7eb;font-family:Inter,Segoe UI,Arial,sans-serif">
      <div style="max-width:640px;margin:0 auto;background:#151923;border:1px solid #2a2f3a;border-radius:18px;overflow:hidden">
        <div style="padding:28px 30px;border-bottom:1px solid #2a2f3a;background:#121620">
          <div style="color:#6366f1;font-weight:900;font-size:22px;letter-spacing:.04em">KubeGuard AI</div>
          <div style="color:#9ca3af;margin-top:4px">Pre-deployment Risk Report</div>
        </div>

        <div style="padding:28px 30px">
          <h2 style="margin:0 0 14px;color:#f9fafb;font-size:18px">Commit Info</h2>
          <table style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:26px">
            <tr><td style="padding:7px 0;color:#9ca3af;width:120px">Project</td><td style="padding:7px 0;color:#f9fafb">${escapeHtml(projectName)}</td></tr>
            <tr><td style="padding:7px 0;color:#9ca3af">Commit</td><td style="padding:7px 0;color:#f9fafb;font-family:Consolas,monospace">${escapeHtml(shortSha(report.commitSha))}</td></tr>
            <tr><td style="padding:7px 0;color:#9ca3af">Message</td><td style="padding:7px 0;color:#f9fafb">${escapeHtml(commitMessage)}</td></tr>
            <tr><td style="padding:7px 0;color:#9ca3af">Author</td><td style="padding:7px 0;color:#f9fafb">${escapeHtml(author)} &lt;${escapeHtml(authorEmail)}&gt;</td></tr>
            <tr><td style="padding:7px 0;color:#9ca3af">Branch</td><td style="padding:7px 0;color:#f9fafb">${escapeHtml(branch)}</td></tr>
          </table>

          <div style="text-align:center;margin:26px 0">
            <div style="display:inline-block;background:${risk.emailColor};color:#111827;border-radius:999px;padding:14px 34px;font-size:26px;font-weight:900;letter-spacing:.08em">
              ${escapeHtml(risk.label)}
            </div>
          </div>

          <h2 style="margin:28px 0 12px;color:#f9fafb;font-size:18px">What Changed</h2>
          ${buildChangesTableHtml(report)}

          <h2 style="margin:28px 0 12px;color:#f9fafb;font-size:18px">Cluster State at Analysis</h2>
          <table style="border-collapse:collapse;width:100%;font-size:14px">
            <tr><td style="padding:8px 0;color:#9ca3af">CPU</td><td style="padding:8px 0;color:#f9fafb">${escapeHtml(metrics.cpuUsagePercent)}%</td></tr>
            <tr><td style="padding:8px 0;color:#9ca3af">Memory</td><td style="padding:8px 0;color:#f9fafb">${escapeHtml(metrics.memoryUsageMB)} MB</td></tr>
            <tr><td style="padding:8px 0;color:#9ca3af">Active Pods</td><td style="padding:8px 0;color:#f9fafb">${escapeHtml(metrics.activePodCount)}</td></tr>
            <tr><td style="padding:8px 0;color:#9ca3af">Historical Peak CPU</td><td style="padding:8px 0;color:#f9fafb">${escapeHtml(metrics.peakCpuUsagePercent)}%</td></tr>
            <tr><td style="padding:8px 0;color:#9ca3af">Historical Peak Memory</td><td style="padding:8px 0;color:#f9fafb">${escapeHtml(metrics.peakMemoryUsageMB)} MB</td></tr>
          </table>

          <h2 style="margin:28px 0 12px;color:#f9fafb;font-size:18px">AI Recommendation</h2>
          <div style="background:#10141d;border:1px solid #2a2f3a;border-radius:12px;padding:16px">
            <div style="font-size:18px;font-weight:900;color:#f9fafb;margin-bottom:8px">${escapeHtml(recommendationLabel(report.recommendation))}</div>
            <div style="color:#cbd5e1;line-height:1.55">${escapeHtml(report.riskReason || 'No risk reason provided.')}</div>
          </div>

          <div style="margin:30px 0 12px">
            <a href="${approveLink}" style="display:block;background:#16a34a;color:#ffffff;text-align:center;text-decoration:none;border-radius:12px;padding:16px;font-weight:900;margin-bottom:12px">✓ APPROVE DEPLOYMENT</a>
            <a href="${rejectLink}" style="display:block;background:#dc2626;color:#ffffff;text-align:center;text-decoration:none;border-radius:12px;padding:16px;font-weight:900">✕ REJECT &amp; HOLD</a>
          </div>

          <p style="color:#fbbf24;font-size:13px;line-height:1.5">This action will affect production. Approve only if you have reviewed the full report.</p>
        </div>

        <div style="padding:18px 30px;border-top:1px solid #2a2f3a;color:#6b7280;font-size:12px;text-align:center">
          Generated by KubeGuard AI • ${escapeHtml(timestamp)} • This email was sent to admins only
        </div>
      </div>
    </div>`
}

function pdfColor(doc, rgb) {
  doc.fillColor(rgb)
  doc.strokeColor(rgb)
}

function addFooter(doc) {
  const pageNumber = doc.bufferedPageRange().count
  doc.fontSize(8)
  pdfColor(doc, [100, 116, 139])
  doc.text(`Page ${pageNumber}`, 50, 790, { width: 245, align: 'left' })
  doc.text('KubeGuard AI - Confidential', 300, 790, { width: 245, align: 'right' })
}

function ensureSpace(doc, neededHeight) {
  if (doc.y + neededHeight > 760) {
    doc.addPage()
  }
}

function sectionTitle(doc, title) {
  ensureSpace(doc, 38)
  doc.moveDown(1)
  pdfColor(doc, [17, 24, 39])
  doc.font('Helvetica-Bold').fontSize(14).text(title)
  doc.moveDown(0.5)
}

function labelValue(doc, label, value) {
  ensureSpace(doc, 22)
  pdfColor(doc, [17, 24, 39])
  doc.font('Helvetica-Bold').fontSize(10).text(`${label}: `, { continued: true })
  doc.font('Helvetica').text(formatValue(value))
}

function drawMetadataBox(doc, report, project) {
  ensureSpace(doc, 86)
  const y = doc.y
  doc.rect(50, y, 495, 76).fill([243, 244, 246])
  pdfColor(doc, [17, 24, 39])
  doc.font('Helvetica-Bold').fontSize(10).text('Report ID', 65, y + 12)
  doc.font('Helvetica').text(formatValue(report.reportId || report.eventId), 170, y + 12)
  doc.font('Helvetica-Bold').text('Generated At', 65, y + 34)
  doc.font('Helvetica').text(formatValue(report.generatedAt || new Date().toISOString()), 170, y + 34)
  doc.font('Helvetica-Bold').text('Project Name', 65, y + 56)
  doc.font('Helvetica').text(formatValue(project.name || report.projectName || report.projectId), 170, y + 56)
  doc.y = y + 88
}

function drawRiskAssessment(doc, report) {
  const risk = riskMeta(report.riskScore)
  const y = doc.y
  doc.rect(50, y, 495, 38).fill(risk.pdfRgb)
  pdfColor(doc, [255, 255, 255])
  doc.font('Helvetica-Bold').fontSize(18).text(`RISK: ${risk.label}`, 65, y + 10)
  doc.y = y + 50
  pdfColor(doc, [17, 24, 39])
  doc.font('Helvetica').fontSize(10).text(formatValue(report.riskReason || 'No risk reason provided.'), {
    width: 495,
    align: 'left',
  })
  doc.moveDown(0.6)
  labelValue(doc, 'Recommendation', recommendationLabel(report.recommendation))
}

function drawChangesTable(doc, report) {
  const rows = semanticChangesRows(report)
  const columns = [
    { label: 'Field Path', x: 50, width: 150 },
    { label: 'Old Value', x: 200, width: 95 },
    { label: 'New Value', x: 295, width: 95 },
    { label: 'Change Type', x: 390, width: 80 },
    { label: 'Critical', x: 470, width: 75 },
  ]

  if (!rows.length) {
    doc.font('Helvetica').fontSize(10).text('No structural changes detected')
    return
  }

  ensureSpace(doc, 40)
  let y = doc.y
  doc.rect(50, y, 495, 24).fill([31, 41, 55])
  pdfColor(doc, [255, 255, 255])
  doc.font('Helvetica-Bold').fontSize(8)
  columns.forEach((column) => doc.text(column.label, column.x + 4, y + 8, { width: column.width - 8 }))
  y += 24

  rows.forEach((row, index) => {
    ensureSpace(doc, 34)
    y = doc.y
    doc.rect(50, y, 495, 30).fill(index % 2 === 0 ? [249, 250, 251] : [243, 244, 246])
    pdfColor(doc, [17, 24, 39])
    doc.font('Helvetica').fontSize(7)
    doc.text(row.fieldPath, 54, y + 7, { width: 142, height: 18 })
    doc.text(row.oldValue, 204, y + 7, { width: 87, height: 18 })
    doc.text(row.newValue, 299, y + 7, { width: 87, height: 18 })
    doc.text(row.changeType, 394, y + 7, { width: 72, height: 18 })
    doc.text(row.isCriticalField ? '!' : 'No', 474, y + 7, { width: 67, height: 18 })
    doc.y = y + 30
  })
}

function drawMetricsColumns(doc, report) {
  const metrics = clusterMetrics(report)
  const y = doc.y
  const leftX = 50
  const rightX = 305

  ensureSpace(doc, 105)
  doc.font('Helvetica-Bold').fontSize(11)
  pdfColor(doc, [17, 24, 39])
  doc.text('Live Metrics', leftX, y)
  doc.text('Historical Peak', rightX, y)
  doc.font('Helvetica').fontSize(10)
  doc.text(`CPU: ${metrics.cpuUsagePercent}%`, leftX, y + 24)
  doc.text(`Memory: ${metrics.memoryUsageMB} MB`, leftX, y + 44)
  doc.text(`Active Pods: ${metrics.activePodCount}`, leftX, y + 64)
  doc.text(`Peak CPU: ${metrics.peakCpuUsagePercent}%`, rightX, y + 24)
  doc.text(`Peak Memory: ${metrics.peakMemoryUsageMB} MB`, rightX, y + 44)
  doc.y = y + 92
}

function generateReportPdf(report, project) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      bufferPages: true,
    })
    const chunks = []

    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    pdfColor(doc, [99, 102, 241])
    doc.font('Helvetica-Bold').fontSize(24).text('KUBEGUARD AI')
    pdfColor(doc, [107, 114, 128])
    doc.font('Helvetica').fontSize(14).text('Pre-Deployment Risk Report')
    doc.moveDown(0.8)
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke([209, 213, 219])
    doc.moveDown(1)

    drawMetadataBox(doc, report, project)

    sectionTitle(doc, 'Commit Details')
    labelValue(doc, 'SHA', report.commitSha || 'unknown')
    labelValue(doc, 'Message', report.commitMessage || report.message || 'unknown')
    labelValue(doc, 'Author', `${report.author || report.commitAuthor || 'Unknown'} <${report.authorEmail || report.commitAuthorEmail || ''}>`)
    labelValue(doc, 'Branch', report.branch || project.branch || 'unknown')

    sectionTitle(doc, 'Risk Assessment')
    drawRiskAssessment(doc, report)

    sectionTitle(doc, 'What Changed')
    drawChangesTable(doc, report)

    sectionTitle(doc, 'Cluster Metrics')
    drawMetricsColumns(doc, report)

    sectionTitle(doc, 'AI Analysis')
    pdfColor(doc, [17, 24, 39])
    doc.font('Helvetica').fontSize(10).text(
      stripMarkdown(report.reportMarkdown || report.riskReason || 'No AI report text provided.'),
      { width: 495, align: 'left' }
    )

    const range = doc.bufferedPageRange()
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index)
      doc.fontSize(8)
      pdfColor(doc, [100, 116, 139])
      doc.text(`Page ${index + 1}`, 50, 790, { width: 245, align: 'left' })
      doc.text('KubeGuard AI - Confidential', 300, 790, { width: 245, align: 'right' })
    }

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
  const projectName = project.name || report.projectName || report.projectId || 'Unknown project'
  const subject = `KubeGuard - ${riskMeta(report.riskScore).label} risk - ${projectName}`
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
