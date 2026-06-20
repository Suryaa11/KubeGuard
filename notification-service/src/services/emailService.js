const nodemailer = require('nodemailer')
const PDFDocument = require('pdfkit')

const { generateApprovalToken } = require('./approvalToken')
const logger = require('../utils/logger')

function trimTrailingSlash(url) {
  return String(url || '').replace(/\/$/, '')
}

function publicBaseUrl() {
  const gatewayUrl = trimTrailingSlash(process.env.GATEWAY_URL)
  const frontendUrl = trimTrailingSlash(process.env.FRONTEND_URL)

  if (gatewayUrl && !/localhost|127\.0\.0\.1|^http:\/\/gateway(?::|$)/i.test(gatewayUrl)) {
    return gatewayUrl
  }

  if (frontendUrl && !/localhost|127\.0\.0\.1/i.test(frontendUrl)) {
    return frontendUrl
  }

  return gatewayUrl || frontendUrl || 'https://kubeguard.hmsclinic.online'
}

function decisionLink(token) {
  return `${publicBaseUrl()}/api/notify/decide?token=${encodeURIComponent(token)}`
}

function riskMeta(riskScore) {
  const score = String(riskScore || 'unknown').toLowerCase()
  const map = {
    low: { label: 'LOW', color: '#22c55e', background: '#052e16' },
    medium: { label: 'MEDIUM', color: '#facc15', background: '#422006' },
    high: { label: 'HIGH', color: '#fb923c', background: '#431407' },
    critical: { label: 'CRITICAL', color: '#f87171', background: '#450a0a' },
  }
  return map[score] || { label: score.toUpperCase(), color: '#94a3b8', background: '#1e293b' }
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
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '- ')
    .replace(/^\s*>\s?/gm, '')
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

function formatValue(value) {
  if (value === undefined || value === null || value === '') return 'Unavailable'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function firstMetric(metrics, keys) {
  for (const key of keys) {
    const value = key.split('.').reduce((current, part) => current?.[part], metrics)
    if (value !== undefined && value !== null && value !== '') {
      return formatValue(value)
    }
  }
  return 'Unavailable'
}

function clusterMetrics(report) {
  const live = report.liveMetrics || report.metrics || {}
  return {
    cpu: firstMetric(live, ['cpuPercent', 'cpuUsagePercent', 'cpu', 'cpuUsage', 'current.cpu']),
    memory: firstMetric(live, ['memoryMb', 'memoryMB', 'memoryUsageMb', 'memory', 'memoryUsage', 'current.memory']),
    pods: firstMetric(live, ['podCount', 'pods', 'current.pods']),
  }
}

function historicalPeakMetrics(report) {
  const peak = report.historicalPeak || report.historicalMetrics || {}
  return {
    cpu: firstMetric(peak, ['peakCpuPercent', 'cpuPercent', 'cpu', 'peakCpu']),
    memory: firstMetric(peak, ['peakMemoryMb', 'memoryMb', 'memory', 'peakMemory']),
  }
}

function semanticChangesRows(report) {
  const changes = Array.isArray(report.semanticChanges) ? report.semanticChanges : []
  if (!changes.length) {
    return []
  }

  return changes.map((change) => ({
    fieldPath: change.fieldPath || change.path || change.field || change.key || 'unknown',
    oldValue: formatValue(change.oldValue),
    newValue: formatValue(change.newValue),
    changeType: change.changeType || 'modified',
  }))
}

function buildChangesHtml(report) {
  const changes = semanticChangesRows(report)

  if (!changes.length) {
    return '<p style="color:#94a3b8;margin:0">No semantic changes detected.</p>'
  }

  return changes
    .map(
      (change) => `
        <div style="border:1px solid #243244;background:#111827;border-radius:10px;padding:12px;margin:10px 0">
          <div style="color:#e5e7eb;font-weight:700;margin-bottom:6px">${escapeHtml(change.fieldPath)}</div>
          <div style="color:#94a3b8;font-size:13px">
            <span style="color:#fca5a5">${escapeHtml(change.oldValue)}</span>
            <span style="color:#64748b;margin:0 8px">-&gt;</span>
            <span style="color:#86efac">${escapeHtml(change.newValue)}</span>
            <span style="float:right;color:#cbd5e1;text-transform:uppercase">${escapeHtml(change.changeType)}</span>
          </div>
        </div>`
    )
    .join('')
}

function buildMetricTableHtml(report) {
  const metrics = clusterMetrics(report)
  return `
    <table style="border-collapse:collapse;width:100%;margin-top:10px">
      <tr>
        <th style="border:1px solid #243244;padding:10px;color:#94a3b8;text-align:left">CPU%</th>
        <th style="border:1px solid #243244;padding:10px;color:#94a3b8;text-align:left">Memory MB</th>
        <th style="border:1px solid #243244;padding:10px;color:#94a3b8;text-align:left">Pod count</th>
      </tr>
      <tr>
        <td style="border:1px solid #243244;padding:10px;color:#e5e7eb">${escapeHtml(metrics.cpu)}</td>
        <td style="border:1px solid #243244;padding:10px;color:#e5e7eb">${escapeHtml(metrics.memory)}</td>
        <td style="border:1px solid #243244;padding:10px;color:#e5e7eb">${escapeHtml(metrics.pods)}</td>
      </tr>
    </table>`
}

function buildHtml(report, project, approveLink, rejectLink) {
  const risk = riskMeta(report.riskScore)
  const projectName = project.name || report.projectName || report.projectId || 'Unknown project'
  const commitMessage = report.commitMessage || report.message || 'No commit message provided'
  const author = report.author || report.commitAuthor || 'Unknown author'

  return `
    <div style="margin:0;padding:0;background:#020617;color:#e5e7eb;font-family:Inter,Segoe UI,Arial,sans-serif">
      <div style="max-width:760px;margin:0 auto;padding:28px">
        <div style="border:1px solid #1e293b;background:#0f172a;border-radius:16px;overflow:hidden">
          <div style="background:#111827;padding:24px 28px;border-bottom:1px solid #1e293b">
            <div style="color:#38bdf8;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">KubeGuard AI</div>
            <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25;color:#f8fafc">Deployment decision required</h1>
          </div>

          <div style="padding:28px">
            <div style="display:inline-block;background:${risk.background};color:${risk.color};border:1px solid ${risk.color};border-radius:999px;padding:7px 12px;font-size:13px;font-weight:800;letter-spacing:.06em">
              ${escapeHtml(risk.label)} RISK
            </div>

            <h2 style="margin:18px 0 8px;color:#f8fafc;font-size:21px">${escapeHtml(projectName)}</h2>
            <p style="margin:0 0 18px;color:#94a3b8">${escapeHtml(commitMessage)}</p>

            <table style="border-collapse:collapse;width:100%;margin:18px 0">
              <tr>
                <td style="border:1px solid #243244;padding:10px;color:#94a3b8;width:34%">Commit</td>
                <td style="border:1px solid #243244;padding:10px;color:#e5e7eb;font-family:Consolas,monospace">${escapeHtml(shortSha(report.commitSha))}</td>
              </tr>
              <tr>
                <td style="border:1px solid #243244;padding:10px;color:#94a3b8">Author</td>
                <td style="border:1px solid #243244;padding:10px;color:#e5e7eb">${escapeHtml(author)}</td>
              </tr>
              <tr>
                <td style="border:1px solid #243244;padding:10px;color:#94a3b8">AI recommendation</td>
                <td style="border:1px solid #243244;padding:10px;color:#f8fafc;font-weight:800;text-transform:uppercase">${escapeHtml(report.recommendation || 'Manual review required')}</td>
              </tr>
            </table>

            <h3 style="margin:22px 0 8px;color:#f8fafc">Cluster metrics</h3>
            ${buildMetricTableHtml(report)}

            <h3 style="margin:22px 0 8px;color:#f8fafc">What changed</h3>
            ${buildChangesHtml(report)}

            <div style="margin-top:28px">
              <a href="${approveLink}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;border-radius:10px;padding:14px 18px;font-weight:800;margin:0 10px 10px 0">APPROVE DEPLOYMENT</a>
              <a href="${rejectLink}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;border-radius:10px;padding:14px 18px;font-weight:800;margin:0 0 10px 0">REJECT &amp; HOLD</a>
            </div>

            <p style="color:#64748b;font-size:12px;margin-top:22px">A PDF risk report is attached to this email.</p>
          </div>
        </div>
      </div>
    </div>`
}

function writeLabelValue(doc, label, value) {
  doc.font('Helvetica-Bold').text(`${label}: `, { continued: true })
  doc.font('Helvetica').text(formatValue(value))
}

function drawSectionTitle(doc, title) {
  doc.moveDown(1)
  doc.fontSize(14).fillColor('#111827').font('Helvetica-Bold').text(title)
  doc.moveDown(0.4)
}

function drawRiskLine(doc, report) {
  const risk = riskMeta(report.riskScore)
  doc.fontSize(11).font('Helvetica-Bold').fillColor(risk.color).text(`Risk Score: ${risk.label}`)
  doc.fillColor('#111827')
}

function drawChangeTable(doc, report) {
  const changes = semanticChangesRows(report)
  if (!changes.length) {
    doc.fontSize(10).font('Helvetica').text('No semantic changes detected.')
    return
  }

  doc.fontSize(9).font('Helvetica-Bold')
  doc.text('Field', 48, doc.y, { width: 155, continued: true })
  doc.text('Old Value', { width: 115, continued: true })
  doc.text('New Value', { width: 115, continued: true })
  doc.text('Type', { width: 80 })
  doc.moveDown(0.3)
  doc.font('Helvetica')

  for (const change of changes) {
    const y = doc.y
    doc.text(change.fieldPath, 48, y, { width: 155 })
    doc.text(change.oldValue, 210, y, { width: 115 })
    doc.text(change.newValue, 330, y, { width: 115 })
    doc.text(change.changeType, 450, y, { width: 80 })
    doc.moveDown(0.7)
  }
}

function generateReportPdf(report, project) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' })
    const chunks = []
    const projectName = project.name || report.projectName || report.projectId || 'Unknown project'
    const generatedAt = report.generatedAt || new Date().toISOString()
    const metrics = clusterMetrics(report)
    const peak = historicalPeakMetrics(report)

    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    doc.fontSize(22).fillColor('#111827').font('Helvetica-Bold').text('KubeGuard AI Risk Report')
    doc.fontSize(9).fillColor('#64748b').font('Helvetica').text('Generated by KubeGuard AI', { align: 'right' })
    doc.moveDown()

    drawSectionTitle(doc, 'Project')
    doc.fontSize(10).fillColor('#111827')
    writeLabelValue(doc, 'Project name', projectName)
    writeLabelValue(doc, 'Report timestamp', generatedAt)

    drawSectionTitle(doc, 'Commit Details')
    writeLabelValue(doc, 'SHA', report.commitSha || 'unknown')
    writeLabelValue(doc, 'Message', report.commitMessage || report.message || 'unknown')
    writeLabelValue(doc, 'Author', report.author || report.commitAuthor || 'Unknown author')
    writeLabelValue(doc, 'Branch', report.branch || project.branch || 'unknown')

    drawSectionTitle(doc, 'Risk')
    drawRiskLine(doc, report)
    writeLabelValue(doc, 'Recommendation', report.recommendation || 'Manual review required')

    drawSectionTitle(doc, 'What Changed')
    drawChangeTable(doc, report)

    drawSectionTitle(doc, 'Cluster State')
    writeLabelValue(doc, 'CPU', metrics.cpu)
    writeLabelValue(doc, 'Memory', metrics.memory)
    writeLabelValue(doc, 'Pods', metrics.pods)

    drawSectionTitle(doc, 'Historical Peak')
    writeLabelValue(doc, 'Peak CPU', peak.cpu)
    writeLabelValue(doc, 'Peak Memory', peak.memory)

    drawSectionTitle(doc, 'AI Analysis')
    doc.fontSize(10).font('Helvetica').fillColor('#111827').text(
      stripMarkdown(report.reportMarkdown || report.riskReason || 'No AI report text provided.'),
      { align: 'left' }
    )

    drawSectionTitle(doc, 'Decision')
    doc.fontSize(10).font('Helvetica').text('Approve: ____________________')
    doc.moveDown(0.4)
    doc.text('Reject: _____________________')

    doc.fontSize(8).fillColor('#64748b').text('Generated by KubeGuard AI', 48, 780, { align: 'center' })
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
  const approveLink = decisionLink(approveToken)
  const rejectLink = decisionLink(rejectToken)
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
