const nodemailer = require('nodemailer')
const PDFDocument = require('pdfkit')

const { generateApprovalToken } = require('./approvalToken')
const logger = require('../utils/logger')

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/$/, '')
}

function baseUrl() {
  return trimTrailingSlash(process.env.PUBLIC_GATEWAY_URL || 'https://kubeguard.hmsclinic.online')
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatValue(value, fallback = 'N/A') {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function formatNumber(value, digits, fallback = 'N/A') {
  if (value === undefined || value === null || value === '') return fallback
  const number = Number(value)
  if (!Number.isFinite(number)) return formatValue(value, fallback)
  return number.toFixed(digits)
}

function shortSha(value) {
  return String(value || 'unknown').slice(0, 7)
}

function riskTheme(riskScore) {
  const themes = {
    low: {
      label: 'LOW',
      bg: '#14532d',
      color: '#86efac',
      rgbBg: [20, 83, 45],
      rgbText: [134, 239, 172],
    },
    medium: {
      label: 'MEDIUM',
      bg: '#713f12',
      color: '#fde047',
      rgbBg: [113, 63, 18],
      rgbText: [253, 224, 71],
    },
    high: {
      label: 'HIGH',
      bg: '#7c2d12',
      color: '#fb923c',
      rgbBg: [124, 45, 18],
      rgbText: [251, 146, 60],
    },
    critical: {
      label: 'CRITICAL',
      bg: '#7f1d1d',
      color: '#fca5a5',
      rgbBg: [127, 29, 29],
      rgbText: [252, 165, 165],
    },
  }

  return themes[String(riskScore || '').toLowerCase()] || {
    label: String(riskScore || 'UNKNOWN').toUpperCase(),
    bg: '#1e2030',
    color: '#e5e7eb',
    rgbBg: [30, 32, 48],
    rgbText: [229, 231, 235],
  }
}

function recommendationTheme(recommendation) {
  const themes = {
    approve: {
      label: '&#10003; APPROVE - Low risk, safe to deploy',
      text: 'APPROVE - Low risk, safe to deploy',
      bg: '#14532d',
      color: '#86efac',
    },
    approve_with_caution: {
      label: '&#9888; APPROVE WITH CAUTION - Review metrics',
      text: 'APPROVE WITH CAUTION - Review metrics',
      bg: '#713f12',
      color: '#fde047',
    },
    reject: {
      label: '&#10007; REJECT - High risk, do not deploy',
      text: 'REJECT - High risk, do not deploy',
      bg: '#7f1d1d',
      color: '#fca5a5',
    },
  }

  return themes[String(recommendation || '').toLowerCase()] || {
    label: 'MANUAL REVIEW REQUIRED',
    text: 'MANUAL REVIEW REQUIRED',
    bg: '#1e2030',
    color: '#e5e7eb',
  }
}

function resolveRecipients(adminEmails = []) {
  const fromMessage = Array.isArray(adminEmails) ? adminEmails : []
  const fromEnv = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)

  return [...new Set([...fromMessage, ...fromEnv].filter(Boolean))]
}

function stripMarkdown(markdown = '') {
  return String(markdown || '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '')
    .replace(/>/g, '')
    .trim()
}

function formatPdfDate(value) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return 'N/A'

  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const year = date.getUTCFullYear()
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')

  return `${day} ${month} ${year} ${hours}:${minutes} UTC`
}

function semanticRows(report) {
  return Array.isArray(report.semanticChanges) ? report.semanticChanges : []
}

function liveMetrics(report) {
  return report.liveMetrics || {}
}

function peakMetrics(report) {
  return report.historicalPeak || {}
}

function buildChangesTable(report) {
  const changes = semanticRows(report)

  if (!changes.length) {
    return '<div style="color:#6b7280;font-size:13px;">No structural changes detected in YAML.</div>'
  }

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#0f1117;border-radius:8px;overflow:hidden;">
      <tr style="background:#1e2030;">
        <td style="padding:10px 16px;color:#6b7280;font-size:12px;">Field</td>
        <td style="padding:10px 16px;color:#6b7280;font-size:12px;">Old Value</td>
        <td style="padding:10px 16px;color:#6b7280;font-size:12px;">New Value</td>
        <td style="padding:10px 16px;color:#6b7280;font-size:12px;">Type</td>
      </tr>
      ${changes
        .map((change) => {
          const border = change.isCriticalField ? 'border-left:3px solid #f97316;' : ''
          const field = `${change.isCriticalField ? '&#9888; ' : ''}${escapeHtml(change.fieldPath || 'unknown')}`
          return `
            <tr style="background:#0f1117;${border}">
              <td style="padding:10px 16px;color:#e5e7eb;font-size:13px;">${field}</td>
              <td style="padding:10px 16px;color:#e5e7eb;font-size:13px;font-family:monospace;">${escapeHtml(formatValue(change.oldValue, ''))}</td>
              <td style="padding:10px 16px;color:#e5e7eb;font-size:13px;font-family:monospace;">${escapeHtml(formatValue(change.newValue, ''))}</td>
              <td style="padding:10px 16px;color:#e5e7eb;font-size:13px;">${escapeHtml(change.changeType || 'modified')}</td>
            </tr>`
        })
        .join('')}
    </table>`
}

function buildHtmlEmail({ report, project, approveUrl, rejectUrl }) {
  const risk = riskTheme(report.riskScore)
  const recommendation = recommendationTheme(report.recommendation)
  const live = liveMetrics(report)
  const peak = peakMetrics(report)
  const projectName = project.name || report.projectName || report.projectId || 'Unknown project'
  const timestamp = formatPdfDate(report.generatedAt || new Date())
  const author = report.authorEmail
    ? `${formatValue(report.author, 'Unknown')} &lt;${escapeHtml(report.authorEmail)}&gt;`
    : formatValue(report.author, 'Unknown')

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#0f1117;font-family:system-ui,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#1a1d27;border-radius:12px;overflow:hidden;">

  <tr><td style="background:#1e2030;padding:32px 40px;border-bottom:1px solid #2d3048;">
    <div style="font-size:24px;font-weight:700;color:#6366f1;letter-spacing:2px;">KUBEGUARD AI</div>
    <div style="font-size:13px;color:#6b7280;margin-top:4px;">Pre-Deployment Risk Report</div>
  </td></tr>

  <tr><td style="padding:32px 40px 0;">
    <div style="display:inline-block;padding:8px 24px;border-radius:999px;font-size:13px;font-weight:700;letter-spacing:2px;background:${risk.bg};color:${risk.color};">
      ${risk.label} RISK
    </div>
  </td></tr>

  <tr><td style="padding:24px 40px 0;">
    <table width="100%" style="border-collapse:collapse;">
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:13px;width:140px;">Project</td>
        <td style="padding:8px 0;color:#e5e7eb;font-size:13px;">${escapeHtml(projectName)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:13px;">Commit</td>
        <td style="padding:8px 0;color:#a5b4fc;font-size:13px;font-family:monospace;">${escapeHtml(shortSha(report.commitSha))}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:13px;">Message</td>
        <td style="padding:8px 0;color:#e5e7eb;font-size:13px;">${escapeHtml(report.commitMessage || report.message || '')}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:13px;">Author</td>
        <td style="padding:8px 0;color:#e5e7eb;font-size:13px;">${author}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:13px;">Branch</td>
        <td style="padding:8px 0;color:#e5e7eb;font-size:13px;">${escapeHtml(project.branch || report.branch || '')}</td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding:24px 40px 0;">
    <div style="font-size:14px;font-weight:600;color:#e5e7eb;margin-bottom:12px;">WHAT CHANGED</div>
    ${buildChangesTable(report)}
  </td></tr>

  <tr><td style="padding:24px 40px 0;">
    <div style="font-size:14px;font-weight:600;color:#e5e7eb;margin-bottom:12px;">CLUSTER STATE AT TIME OF ANALYSIS</div>
    <table width="100%" style="border-collapse:collapse;background:#0f1117;border-radius:8px;overflow:hidden;">
      <tr style="background:#1e2030;">
        <td style="padding:10px 16px;color:#6b7280;font-size:12px;">CPU Usage</td>
        <td style="padding:10px 16px;color:#6b7280;font-size:12px;">Memory</td>
        <td style="padding:10px 16px;color:#6b7280;font-size:12px;">Active Pods</td>
        <td style="padding:10px 16px;color:#6b7280;font-size:12px;">Peak CPU</td>
        <td style="padding:10px 16px;color:#6b7280;font-size:12px;">Peak Memory</td>
      </tr>
      <tr>
        <td style="padding:10px 16px;color:#e5e7eb;font-size:13px;font-family:monospace;">${escapeHtml(formatNumber(live.cpuUsagePercent, 2))}%</td>
        <td style="padding:10px 16px;color:#e5e7eb;font-size:13px;font-family:monospace;">${escapeHtml(formatNumber(live.memoryUsageMB, 0))} MB</td>
        <td style="padding:10px 16px;color:#e5e7eb;font-size:13px;font-family:monospace;">${escapeHtml(formatValue(live.activePodCount))}</td>
        <td style="padding:10px 16px;color:#e5e7eb;font-size:13px;font-family:monospace;">${escapeHtml(formatNumber(peak.cpuUsagePercent, 2))}%</td>
        <td style="padding:10px 16px;color:#e5e7eb;font-size:13px;font-family:monospace;">${escapeHtml(formatNumber(peak.memoryUsageMB, 0))} MB</td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding:24px 40px 0;">
    <div style="font-size:14px;font-weight:600;color:#e5e7eb;margin-bottom:12px;">AI RISK ANALYSIS</div>
    <div style="background:#0f1117;border-left:3px solid #6366f1;padding:16px;border-radius:4px;color:#d1d5db;font-size:13px;line-height:1.7;">${escapeHtml(report.riskReason || '')}</div>
    <div style="margin-top:12px;padding:12px 16px;border-radius:8px;background:${recommendation.bg};color:${recommendation.color};font-size:13px;font-weight:600;">
      Recommendation: ${recommendation.label}
    </div>
  </td></tr>

  <tr><td style="padding:32px 40px;">
    <div style="font-size:12px;color:#6b7280;margin-bottom:16px;text-align:center;">
      &#9888; This action affects production. Review the report before deciding.
    </div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td width="48%" align="center">
          <a href="${approveUrl}" style="display:block;padding:16px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;text-align:center;">
            &#10003; APPROVE DEPLOYMENT
          </a>
        </td>
        <td width="4%"></td>
        <td width="48%" align="center">
          <a href="${rejectUrl}" style="display:block;padding:16px;background:#dc2626;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;text-align:center;">
            &#10007; REJECT &amp; HOLD
          </a>
        </td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding:24px 40px;border-top:1px solid #2d3048;text-align:center;">
    <div style="color:#4b5563;font-size:12px;">
      Generated by KubeGuard AI &bull; ${escapeHtml(timestamp)} &bull; Sent to authorized admins only
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

function setFill(doc, rgb) {
  doc.fillColor(rgb)
}

function setStroke(doc, rgb) {
  doc.strokeColor(rgb)
}

function ensureSpace(doc, height) {
  if (doc.y + height > 760) {
    doc.addPage()
  }
}

function sectionTitle(doc, title) {
  ensureSpace(doc, 32)
  doc.moveDown(1)
  setFill(doc, [99, 102, 241])
  doc.font('Helvetica-Bold').fontSize(14).text(title)
  doc.moveDown(0.6)
}

function drawHeader(doc) {
  doc.rect(0, 0, doc.page.width, 80).fill([30, 32, 48])
  setFill(doc, [99, 102, 241])
  doc.font('Helvetica-Bold').fontSize(28).text('KUBEGUARD AI', 50, 22)
  setFill(doc, [107, 114, 128])
  doc.font('Helvetica').fontSize(12).text('Pre-Deployment Risk Report', 50, 54)
  doc.y = 110
}

function drawMetadata(doc, report, project) {
  ensureSpace(doc, 104)
  const y = doc.y
  doc.rect(50, y, 495, 94).fill([26, 29, 39])
  setFill(doc, [209, 213, 219])
  doc.font('Helvetica-Bold').fontSize(10).text('Report ID:', 70, y + 18)
  doc.font('Helvetica').text(formatValue(report.reportId || report.eventId), 170, y + 18)
  doc.font('Helvetica-Bold').text('Generated:', 70, y + 42)
  doc.font('Helvetica').text(formatPdfDate(report.generatedAt), 170, y + 42)
  doc.font('Helvetica-Bold').text('Project:', 70, y + 66)
  doc.font('Helvetica').text(formatValue(project.name || report.projectName || report.projectId), 170, y + 66)
  doc.font('Helvetica-Bold').text('ArgoCD App:', 330, y + 66)
  doc.font('Helvetica').text(formatValue(project.argocdAppName), 420, y + 66)
  doc.y = y + 104
}

function labelValue(doc, label, value) {
  ensureSpace(doc, 20)
  setFill(doc, [209, 213, 219])
  doc.font('Helvetica-Bold').fontSize(10).text(`${label}: `, { continued: true })
  doc.font('Helvetica').text(formatValue(value))
}

function drawRiskAssessment(doc, report) {
  const theme = riskTheme(report.riskScore)
  ensureSpace(doc, 132)
  const y = doc.y
  doc.rect(50, y, 495, 50).fill(theme.rgbBg)
  setFill(doc, theme.rgbText)
  doc.font('Helvetica-Bold').fontSize(20).text(`RISK: ${theme.label}`, 68, y + 14)
  doc.y = y + 64
  setFill(doc, [209, 213, 219])
  doc.font('Helvetica').fontSize(10).text(formatValue(report.riskReason, 'No risk reason provided.'), {
    width: 495,
    lineGap: 3,
  })
  doc.moveDown(0.8)
  doc.font('Helvetica-Bold').text(`Recommendation: ${recommendationTheme(report.recommendation).text}`)
}

function drawChangesTable(doc, report) {
  const rows = semanticRows(report)
  const col = [
    { title: 'Field Path', x: 50, w: 150 },
    { title: 'Old Value', x: 200, w: 95 },
    { title: 'New Value', x: 295, w: 95 },
    { title: 'Type', x: 390, w: 75 },
    { title: 'Critical', x: 465, w: 80 },
  ]

  if (!rows.length) {
    setFill(doc, [209, 213, 219])
    doc.font('Helvetica').fontSize(10).text('No structural changes detected')
    return
  }

  ensureSpace(doc, 30)
  let y = doc.y
  doc.rect(50, y, 495, 24).fill([30, 32, 48])
  setFill(doc, [107, 114, 128])
  doc.font('Helvetica-Bold').fontSize(8)
  col.forEach((c) => doc.text(c.title, c.x + 4, y + 8, { width: c.w - 8 }))
  doc.y = y + 24

  rows.forEach((row, index) => {
    ensureSpace(doc, 34)
    y = doc.y
    doc.rect(50, y, 495, 32).fill(index % 2 === 0 ? [15, 17, 23] : [26, 29, 39])
    if (row.isCriticalField) {
      doc.rect(50, y, 3, 32).fill([249, 115, 22])
    }
    setFill(doc, [229, 231, 235])
    doc.font('Helvetica').fontSize(7)
    doc.text(row.fieldPath || 'unknown', 56, y + 8, { width: 140, height: 18 })
    doc.text(formatValue(row.oldValue, ''), 204, y + 8, { width: 87, height: 18 })
    doc.text(formatValue(row.newValue, ''), 299, y + 8, { width: 87, height: 18 })
    doc.text(formatValue(row.changeType, ''), 394, y + 8, { width: 67, height: 18 })
    doc.text(row.isCriticalField ? '!' : 'No', 469, y + 8, { width: 72, height: 18 })
    doc.y = y + 32
  })
}

function drawMetricBox(doc, x, y, title, rows) {
  doc.rect(x, y, 235, 132).fill([26, 29, 39])
  setFill(doc, [99, 102, 241])
  doc.font('Helvetica-Bold').fontSize(10).text(title, x + 16, y + 16)
  setFill(doc, [209, 213, 219])
  doc.font('Helvetica').fontSize(9)
  rows.forEach((row, index) => {
    doc.text(row, x + 16, y + 42 + index * 16)
  })
}

function drawClusterMetrics(doc, report) {
  const live = liveMetrics(report)
  const peak = peakMetrics(report)
  ensureSpace(doc, 148)
  const y = doc.y
  drawMetricBox(doc, 50, y, 'LIVE METRICS', [
    `CPU: ${formatNumber(live.cpuUsagePercent, 2)}%`,
    `Memory: ${formatNumber(live.memoryUsageMB, 0)} MB`,
    `Pods: ${formatValue(live.activePodCount)}`,
    `Requests/sec: ${formatNumber(live.requestsPerSecond, 2)}`,
    `Error Rate: ${formatNumber(live.errorRatePercent, 2)}%`,
    `P95 Latency: ${formatNumber(live.p95LatencyMs, 0)} ms`,
  ])
  drawMetricBox(doc, 310, y, 'HISTORICAL PEAK (30 days)', [
    `Peak CPU: ${formatNumber(peak.cpuUsagePercent, 2)}%`,
    `Peak Memory: ${formatNumber(peak.memoryUsageMB, 0)} MB`,
    `Peak Date: ${formatValue(peak.peakDate)}`,
  ])
  doc.y = y + 148
}

function addFooters(doc) {
  const range = doc.bufferedPageRange()
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index)
    setStroke(doc, [45, 48, 72])
    doc.lineWidth(1).moveTo(50, 775).lineTo(545, 775).stroke()
    setFill(doc, [75, 85, 99])
    doc.font('Helvetica').fontSize(8)
    doc.text('KubeGuard AI - Confidential', 50, 784, { width: 250, align: 'left' })
    doc.text(`Page ${index + 1} of ${range.count}`, 295, 784, { width: 250, align: 'right' })
  }
}

function generatePdf(report, project) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true })
    const chunks = []

    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    drawHeader(doc)
    drawMetadata(doc, report, project)

    sectionTitle(doc, 'RISK ASSESSMENT')
    drawRiskAssessment(doc, report)

    sectionTitle(doc, 'COMMIT DETAILS')
    labelValue(doc, 'SHA', report.commitSha)
    labelValue(doc, 'Message', report.commitMessage || report.message)
    labelValue(doc, 'Author', `${formatValue(report.author, 'Unknown')} <${formatValue(report.authorEmail, '')}>`)
    labelValue(doc, 'Branch', project.branch || report.branch)

    sectionTitle(doc, 'WHAT CHANGED')
    drawChangesTable(doc, report)

    sectionTitle(doc, 'CLUSTER METRICS')
    drawClusterMetrics(doc, report)

    sectionTitle(doc, 'AI ANALYSIS')
    setFill(doc, [209, 213, 219])
    doc.font('Helvetica').fontSize(11).text(stripMarkdown(report.reportMarkdown || report.riskReason || ''), {
      width: 500,
      lineGap: 4,
    })

    addFooters(doc)
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

async function sendApprovalEmail(report, project, adminEmails) {
  const recipients = resolveRecipients(adminEmails)
  if (!recipients.length) {
    logger.warn('No admin email recipients configured')
    return { success: false, provider: process.env.EMAIL_PROVIDER || 'smtp', recipients, error: 'No recipients configured' }
  }

  const approveToken = generateApprovalToken(report.eventId, 'approved')
  const rejectToken = generateApprovalToken(report.eventId, 'rejected')
  const base = baseUrl()
  const approveUrl = `${base}/api/notify/decide?token=${approveToken}`
  const rejectUrl = `${base}/api/notify/decide?token=${rejectToken}`
  const projectName = project.name || report.projectName || report.projectId || 'Unknown project'
  const subject = `KubeGuard AI - ${riskTheme(report.riskScore).label} risk - ${projectName}`
  const html = buildHtmlEmail({ report, project, approveUrl, rejectUrl })
  const pdf = await generatePdf(report, project)
  const provider = process.env.EMAIL_PROVIDER || 'smtp'

  if (provider === 'console') {
    recipients.forEach((recipient) => {
      console.log(`[EMAIL] TO: ${recipient}`)
      console.log(`[EMAIL] SUBJECT: ${subject}`)
      console.log(`[EMAIL] APPROVE LINK: ${approveUrl}`)
      console.log(`[EMAIL] REJECT LINK: ${rejectUrl}`)
      console.log(`[EMAIL] PDF ATTACHMENT BYTES: ${pdf.length}`)
      console.log(`[EMAIL] BODY: ${html}`)
    })

    logger.info(`Email rendered (console) for event: ${report.eventId}`)
    return { success: true, provider: 'console', recipients }
  }

  const transporter = createTransporter()
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: recipients.join(','),
    subject,
    html,
    attachments: [
      {
        filename: `kubeguard-risk-report-${report.eventId || Date.now()}.pdf`,
        content: pdf,
        contentType: 'application/pdf',
      },
    ],
  })

  logger.info(`Email sent (smtp) for event: ${report.eventId}`)
  return { success: true, provider: 'smtp', recipients }
}

module.exports = { sendApprovalEmail }
