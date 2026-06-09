'use strict'
require('dotenv').config()

// ============================================================
//  KubeGuard AI — Unified Backend
//  Single Express app combining all 5 microservices.
//  Runs on one port — suitable for Azure App Service.
//
//  Port: process.env.PORT || 3000  (Azure sets PORT automatically)
//
//  Route structure:
//    /health                  → health check (no auth)
//    /api/auth/*              → auth (Entra ID token exchange)
//    /api/webhook/:projectId  → GitHub webhooks (no auth, HMAC)
//    /api/projects/*          → project CRUD
//    /api/events/*            → event queries
//    /api/reports/*           → risk reports
//    /api/notify/*            → approval decisions
//    /internal/*              → blocked externally (404)
// ============================================================

const express    = require('express')
const helmet     = require('helmet')
const cors       = require('cors')
const morgan     = require('morgan')
const mongoose   = require('mongoose')
const crypto     = require('crypto')
const axios      = require('axios')
const jwt        = require('jsonwebtoken')
const jwksRsa    = require('jwks-rsa')
const rateLimit  = require('express-rate-limit')
const { v4: uuidv4 } = require('uuid')
const Joi        = require('joi')
const yaml       = require('js-yaml')
const { BlobServiceClient } = require('@azure/storage-blob')
const { ServiceBusClient }  = require('@azure/service-bus')

const app = express()

// ── Security & logging ────────────────────────────────────────────────────
app.disable('x-powered-by')
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}))
app.use(morgan('combined'))

// ── Rate limiters ─────────────────────────────────────────────────────────
const generalLimiter = rateLimit({ windowMs: 15*60*1000, max: 100,  standardHeaders: true, legacyHeaders: false })
const authLimiter    = rateLimit({ windowMs: 15*60*1000, max: 30,   standardHeaders: true, legacyHeaders: false })
const webhookLimiter = rateLimit({ windowMs: 15*60*1000, max: 500,  standardHeaders: true, legacyHeaders: false })

// ── MongoDB connection ────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('[unified] MongoDB connected'))
  .catch(err => { console.error('[unified] MongoDB connection failed:', err.message); process.exit(1) })

// ─────────────────────────────────────────────────────────────────────────
//  SHARED UTILITIES
// ─────────────────────────────────────────────────────────────────────────

// ── Encryption ────────────────────────────────────────────────────────────
const ALGORITHM = 'aes-256-gcm'
function getEncKey() {
  const raw = process.env.ENCRYPTION_KEY || ''
  if (raw.length < 32) throw new Error('ENCRYPTION_KEY must be at least 32 characters')
  return Buffer.from(raw.slice(0, 32), 'utf8')
}
function encrypt(text) {
  if (!text) return null
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, getEncKey(), iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}
function decrypt(encryptedStr) {
  if (!encryptedStr) return null
  const parts = encryptedStr.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted string format')
  const [ivHex, tagHex, encHex] = parts
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncKey(), Buffer.from(ivHex,'hex'))
  decipher.setAuthTag(Buffer.from(tagHex,'hex'))
  return Buffer.concat([decipher.update(Buffer.from(encHex,'hex')), decipher.final()]).toString('utf8')
}

// ── Internal request check ────────────────────────────────────────────────
function checkInternalSecret(req, res, next) {
  if (req.headers['x-internal-secret'] !== process.env.INTERNAL_SECRET) {
    return res.status(401).json({ error:'Unauthorized', message:'Internal access only.' })
  }
  next()
}

// ── Entra ID JWT validation ───────────────────────────────────────────────
const jwksClient = jwksRsa({
  jwksUri: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/discovery/v2.0/keys`,
  cache: true, rateLimit: true, jwksRequestsPerMinute: 5,
})
function getSigningKey(header, callback) {
  jwksClient.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err)
    callback(null, key.getPublicKey())
  })
}
function validateEntraToken(req, res, next) {
  const [, token] = (req.headers.authorization || '').split(' ')
  if (!token) return res.status(401).json({ error:'Unauthorized', message:'Missing token' })
  jwt.verify(token, getSigningKey, {
    algorithms: ['RS256'],
    audience: [process.env.AZURE_CLIENT_ID, `api://${process.env.AZURE_CLIENT_ID}`],
    issuer: [
      `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0`,
      `https://sts.windows.net/${process.env.AZURE_TENANT_ID}/`,
    ],
  }, (err, decoded) => {
    if (err || !decoded) return res.status(401).json({ error:'Unauthorized', message:'Invalid or expired token' })
    req.entraUser = decoded
    next()
  })
}
function extractUserHeaders(req, res, next) {
  const u = req.entraUser || {}
  req.userId    = u.oid || u.sub || ''
  req.userEmail = u.email || u.preferred_username || ''
  req.userName  = u.name || ''
  req.userRoles = Array.isArray(u.roles) ? u.roles : (u.roles ? [u.roles] : [])
  delete req.headers.authorization
  next()
}
function requireAdmin(req, res, next) {
  if (!req.userRoles.includes('Admin')) {
    return res.status(403).json({ error:'Forbidden', message:'Admin role required.' })
  }
  next()
}

// ─────────────────────────────────────────────────────────────────────────
//  MONGOOSE MODELS
// ─────────────────────────────────────────────────────────────────────────

// ── Project ───────────────────────────────────────────────────────────────
const projectSchema = new mongoose.Schema({
  name:               { type: String, required: true, trim: true },
  createdBy:          { type: String, required: true },
  createdByEmail:     { type: String, required: true },
  githubRepoUrl:      { type: String, required: true },
  branch:             { type: String, required: true, default: 'main' },
  folderPath:         { type: String, required: true, default: '/helm' },
  prometheusUrl:      { type: String, required: true },
  prometheusAvailable:{ type: Boolean, default: false },
  argocdUrl:          { type: String, required: true },
  argocdAppName:      { type: String, required: true },
  argocdToken:        { type: String, required: true },
  kubernetesToken:    { type: String, default: null },
  kubernetesApiUrl:   { type: String, default: null },
  webhookSecret:      { type: String, required: true },
  githubWebhookId:    { type: Number, default: null },
  status:             { type: String, enum: ['active','paused','error'], default: 'active' },
  lastEventAt:        { type: Date, default: null },
}, { timestamps: true })
projectSchema.index({ githubRepoUrl:1, branch:1, folderPath:1 }, { unique: true })
projectSchema.index({ createdBy:1 })
projectSchema.methods.toSafeJSON = function() {
  const o = this.toObject()
  delete o.webhookSecret; delete o.argocdToken; delete o.kubernetesToken
  return o
}
const Project = mongoose.model('Project', projectSchema, 'projects')

// ── Event ─────────────────────────────────────────────────────────────────
const eventSchema = new mongoose.Schema({
  projectId:            { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  projectName:          { type: String, required: true },
  commitSha:            { type: String, required: true },
  commitMessage:        { type: String, default: '' },
  commitUrl:            { type: String, default: '' },
  author:               { type: String, default: '' },
  authorEmail:          { type: String, default: '' },
  changedFiles:         [String],
  monitoredChangedFiles:[String],
  semanticChanges:      [{
    file: String, fieldPath: String, oldValue: String, newValue: String,
    changeType: { type: String, enum: ['increase','decrease','added','removed','modified'] },
    isCriticalField: { type: Boolean, default: false },
  }],
  rawDiff:              { type: String, default: '' },
  status:               { type: String, enum: ['detected','analyzing','pending_approval','approved','rejected','error'], default: 'detected', index: true },
  argocdPaused:         { type: Boolean, default: false },
  argocdPauseError:     { type: String, default: null },
  reportBlobUrl:        { type: String, default: null },
  detectedAt:           { type: Date, default: Date.now, index: true },
  analysisStartedAt:    { type: Date, default: null },
  resolvedAt:           { type: Date, default: null },
}, { timestamps: true })
eventSchema.index({ projectId:1, detectedAt:-1 })
const Event = mongoose.model('Event', eventSchema, 'events')

// ── Report ────────────────────────────────────────────────────────────────
const reportSchema = new mongoose.Schema({
  reportId:         { type: String, required: true, unique: true },
  eventId:          { type: mongoose.Schema.Types.ObjectId, required: true, index: true, unique: true },
  projectId:        { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  projectName:      { type: String, required: true },
  riskScore:        { type: Number, required: true },
  recommendation:   { type: String, required: true },
  changesSummary:   { type: mongoose.Schema.Types.Mixed, default: null },
  reportBlobPath:   { type: String, required: true },
  reportBlobUrl:    { type: String, required: true },
  metricsAvailable: { type: Boolean, default: false },
  adminDecision:    { type: String, default: 'pending' },
  decidedAt:        { type: Date, default: null },
  decidedBy:        { type: String, default: null },
  decidedByEmail:   { type: String, default: null },
  generatedAt:      { type: Date, default: Date.now },
}, { timestamps: true })
const Report = mongoose.model('Report', reportSchema, 'reports')

// ── Decision ──────────────────────────────────────────────────────────────
const decisionSchema = new mongoose.Schema({
  eventId:        { type: String, required: true, unique: true },
  projectId:      { type: String, required: true },
  decision:       { type: String, enum: ['approved','rejected'], required: true },
  decidedBy:      { type: String, required: true },
  decidedByEmail: { type: String, required: true },
  decisionNote:   { type: String, default: null },
  source:         { type: String, enum: ['dashboard','email'], required: true },
  argocdResumed:  { type: Boolean, default: false },
}, { timestamps: true })
const Decision = mongoose.model('Decision', decisionSchema, 'decisions')

// ─────────────────────────────────────────────────────────────────────────
//  AZURE SERVICES
// ─────────────────────────────────────────────────────────────────────────

// ── Blob Storage ──────────────────────────────────────────────────────────
let _blobClient = null
function getBlobClient() {
  if (!_blobClient) _blobClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING)
  return _blobClient
}
async function uploadReport(projectId, eventId, data) {
  const container = process.env.AZURE_STORAGE_CONTAINER || 'reports'
  const cc = getBlobClient().getContainerClient(container)
  await cc.createIfNotExists({ access: 'private' })
  const blobPath = `${projectId}/${eventId}/report.json`
  const bc = cc.getBlockBlobClient(blobPath)
  const payload = JSON.stringify(data, null, 2)
  await bc.upload(payload, Buffer.byteLength(payload), { blobHTTPHeaders: { blobContentType: 'application/json' } })
  return { blobPath, blobUrl: bc.url }
}
async function getReportBlob(blobPath) {
  const container = process.env.AZURE_STORAGE_CONTAINER || 'reports'
  const cc = getBlobClient().getContainerClient(container)
  const bc = cc.getBlobClient(blobPath)
  if (!await bc.exists()) return null
  const dl = await bc.download()
  const chunks = []
  for await (const chunk of dl.readableStreamBody) chunks.push(Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

// ── Service Bus ───────────────────────────────────────────────────────────
let _sbClient = null, _sbSender = null
async function publishToServiceBus(message) {
  try {
    if (!_sbClient) _sbClient = new ServiceBusClient(process.env.SERVICE_BUS_CONNECTION_STRING)
    if (!_sbSender) _sbSender = _sbClient.createSender(process.env.SERVICE_BUS_QUEUE || 'report-ready')
    await _sbSender.sendMessages({ body: message, contentType: 'application/json', subject: 'report-ready' })
  } catch(err) {
    console.error('[unified] Service Bus publish failed:', err.message)
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  PROMETHEUS & AI
// ─────────────────────────────────────────────────────────────────────────

async function queryPrometheus(url, query) {
  try {
    const r = await axios.get(`${url.replace(/\/$/,'')}/api/v1/query`, { params:{query}, timeout:8000 })
    const result = r.data?.data?.result
    if (!Array.isArray(result) || result.length === 0) return null
    const v = result[0]?.value?.[1]
    return v === undefined ? null : Number(v)
  } catch { return null }
}

async function getLiveMetrics(prometheusUrl, appName) {
  if (!prometheusUrl) return { available:false }
  const [cpu, mem, pods] = await Promise.allSettled([
    queryPrometheus(prometheusUrl, `avg(rate(container_cpu_usage_seconds_total{container=~"${appName}"}[5m])) * 100`),
    queryPrometheus(prometheusUrl, `avg(container_memory_working_set_bytes{container=~"${appName}"}) / 1024 / 1024`),
    queryPrometheus(prometheusUrl, `count(kube_pod_info{pod=~"${appName}.*"})`),
  ])
  const vals = [cpu,mem,pods].map(e => e.status==='fulfilled' ? e.value : null)
  if (vals.every(v => v === null)) return { available:false }
  return { available:true, cpuUsagePercent:vals[0], memoryUsageMB:vals[1], activePodCount:vals[2] }
}

async function getHistoricalPeak(prometheusUrl, appName) {
  if (!prometheusUrl) return { available:false }
  const [cpu, mem] = await Promise.allSettled([
    queryPrometheus(prometheusUrl, `max_over_time(avg(rate(container_cpu_usage_seconds_total{container=~"${appName}"}[5m]))[30d:1h]) * 100`),
    queryPrometheus(prometheusUrl, `max_over_time(avg(container_memory_working_set_bytes{container=~"${appName}"})[30d:1h]) / 1024 / 1024`),
  ])
  const vals = [cpu,mem].map(e => e.status==='fulfilled' ? e.value : null)
  if (vals.every(v => v === null)) return { available:false }
  return { available:true, cpuUsagePercent:vals[0], memoryUsageMB:vals[1] }
}

async function callAI(event, project, liveMetrics, historicalPeak) {
  const apiUrl = process.env.AI_API_URL
  const apiKey = process.env.AI_API_KEY
  const model  = process.env.AI_MODEL || 'gpt-4o-mini'

  const changes = (event.semanticChanges||[]).map(c =>
    `- "${c.fieldPath}": ${c.oldValue||'?'} → ${c.newValue||'?'} (${c.changeType})${c.isCriticalField?' ⚠ CRITICAL':''}`
  ).join('\n') || '- No semantic changes detected'

  const liveText = liveMetrics.available
    ? `CPU: ${liveMetrics.cpuUsagePercent?.toFixed(1)||'n/a'}%, Memory: ${liveMetrics.memoryUsageMB?.toFixed(0)||'n/a'} MB, Pods: ${liveMetrics.activePodCount||'n/a'}`
    : 'Prometheus not reachable — metrics unavailable'

  const histText = historicalPeak.available
    ? `Peak CPU: ${historicalPeak.cpuUsagePercent?.toFixed(1)||'n/a'}%, Peak Memory: ${historicalPeak.memoryUsageMB?.toFixed(0)||'n/a'} MB`
    : 'Historical data unavailable'

  const prompt = `You are a Kubernetes SRE risk analyst. Analyze this deployment change and return ONLY valid JSON, no markdown fences.

PROJECT: ${project.name}
ARGOCD APP: ${project.argocdAppName}
COMMIT: "${event.commitMessage}" by ${event.author}

CHANGES:
${changes}

LIVE METRICS: ${liveText}
HISTORICAL PEAK: ${histText}

Return this exact JSON:
{
  "riskScore": "low"|"medium"|"high"|"critical",
  "riskReason": "2-3 sentence technical explanation",
  "prediction": "What will happen if this change is applied now",
  "recommendation": "approve"|"approve_with_caution"|"reject",
  "reportMarkdown": "Full markdown report with sections: ## Summary, ## What Changed, ## Current State, ## Risk Analysis, ## Recommendation"
}`

  if (!apiUrl || !apiKey) return fallbackAIReport(event)

  try {
    let response
    if (/anthropic/i.test(apiUrl)) {
      response = await axios.post(apiUrl, {
        model, max_tokens:2000,
        messages:[{ role:'user', content:prompt }],
      }, {
        headers:{ 'x-api-key':apiKey, 'anthropic-version':'2023-06-01', 'content-type':'application/json' },
        timeout:60000,
      })
    } else {
      response = await axios.post(apiUrl, {
        model, messages:[{ role:'user', content:prompt }],
      }, {
        headers:{ Authorization:`Bearer ${apiKey}`, 'content-type':'application/json' },
        timeout:60000,
      })
    }
    const text = response.data?.content?.[0]?.text || response.data?.choices?.[0]?.message?.content || ''
    const cleaned = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim()
    const parsed = JSON.parse(cleaned)
    return parsed
  } catch(err) {
    console.error('[unified] AI call failed:', err.message)
    return fallbackAIReport(event)
  }
}

function fallbackAIReport(event) {
  const hasCritical = (event.semanticChanges||[]).some(c => c.isCriticalField)
  return {
    riskScore: hasCritical ? 'high' : 'medium',
    riskReason: 'AI analysis was unavailable. Manual review recommended.',
    prediction: 'Impact cannot be automatically determined. Review the changes manually.',
    recommendation: 'approve_with_caution',
    reportMarkdown: `## Summary\n\nAI analysis unavailable. Manual review required.\n\n## What Changed\n\n${(event.semanticChanges||[]).map(c=>`- ${c.fieldPath}: ${c.oldValue} → ${c.newValue}`).join('\n')||'See commit diff'}\n\n## Recommendation\n\nReview carefully before approving.`,
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  DIFF PARSER (from watcher-service)
// ─────────────────────────────────────────────────────────────────────────
const CRITICAL_FIELDS = new Set(['replicaCount','replicas','cpu','memory','requests','limits','minReplicas','maxReplicas','targetCPUUtilizationPercentage','image','tag','resources'])

function flattenObject(obj, prefix='') {
  const result = {}
  for (const [key, value] of Object.entries(obj||{})) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, path))
    } else {
      result[path] = String(value ?? '')
    }
  }
  return result
}

function parseSemanticChanges(rawDiff) {
  const changes = []
  const segments = rawDiff.split(/^diff --git /m).filter(Boolean)
  for (const segment of segments) {
    const lines = segment.split('\n')
    const fileMatch = lines[0].match(/a\/.+ b\/(.+)/)
    if (!fileMatch) continue
    const filePath = fileMatch[1].trim()
    if (!filePath.endsWith('.yaml') && !filePath.endsWith('.yml')) continue
    const oldLines=[], newLines=[]
    let inHunk=false
    for (const line of lines) {
      if (line.startsWith('@@')) { inHunk=true; continue }
      if (!inHunk) continue
      if (line.startsWith('-') && !line.startsWith('---')) oldLines.push(line.slice(1))
      else if (line.startsWith('+') && !line.startsWith('+++')) newLines.push(line.slice(1))
      else if (!line.startsWith('\\')) { oldLines.push(line); newLines.push(line) }
    }
    let oldObj={}, newObj={}
    try { oldObj = yaml.load(oldLines.join('\n')) || {} } catch {}
    try { newObj = yaml.load(newLines.join('\n')) || {} } catch {}
    const oldFlat = flattenObject(oldObj), newFlat = flattenObject(newObj)
    const allKeys = new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)])
    for (const key of allKeys) {
      const ov=oldFlat[key], nv=newFlat[key]
      if (ov===nv) continue
      let changeType='modified'
      if (ov===undefined) changeType='added'
      else if (nv===undefined) changeType='removed'
      else {
        const on=parseFloat(ov), nn=parseFloat(nv)
        if (!isNaN(on)&&!isNaN(nn)) changeType = nn>on?'increase':'decrease'
      }
      changes.push({ file:filePath, fieldPath:key, oldValue:ov??'', newValue:nv??'', changeType, isCriticalField:key.split('.').some(p=>CRITICAL_FIELDS.has(p)) })
    }
  }
  return changes
}

function filterMonitoredFiles(changedFiles, folderPath) {
  const normalized = folderPath.replace(/^\//,'')
  return changedFiles.filter(f => f.replace(/^\//,'').startsWith(normalized))
}

// ─────────────────────────────────────────────────────────────────────────
//  ARGOCD
// ─────────────────────────────────────────────────────────────────────────
async function pauseArgoCD(argocdUrl, argocdToken, appName) {
  if (!argocdUrl || !argocdToken || !appName) return { success:false, error:'ArgoCD not configured' }
  try {
    await axios.patch(`${argocdUrl}/api/v1/applications/${appName}`, { spec:{syncPolicy:null} }, {
      headers:{ Authorization:`Bearer ${argocdToken}` }, timeout:8000,
    })
    return { success:true, error:null }
  } catch(err) {
    return { success:false, error:err.message }
  }
}

async function resumeArgoCD(argocdUrl, argocdToken, appName) {
  if (!argocdUrl || !argocdToken || !appName) return { success:false, error:'ArgoCD not configured' }
  try {
    await axios.post(`${argocdUrl}/api/v1/applications/${appName}/sync`, { prune:false, dryRun:false }, {
      headers:{ Authorization:`Bearer ${argocdToken}` }, timeout:10000,
    })
    return { success:true, error:null }
  } catch(err) {
    return { success:false, error:err.message }
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  GITHUB WEBHOOK REGISTRATION
// ─────────────────────────────────────────────────────────────────────────
function parseGithubUrl(url) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (!match) throw new Error(`Cannot parse GitHub URL: ${url}`)
  return { owner:match[1], repo:match[2] }
}

async function registerWebhook(githubRepoUrl, webhookSecret, projectId) {
  if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN not set')
  const { owner, repo } = parseGithubUrl(githubRepoUrl)
  const webhookUrl = `${process.env.GATEWAY_PUBLIC_URL}/api/webhook/${projectId}`
  const response = await axios.post(
    `https://api.github.com/repos/${owner}/${repo}/hooks`,
    { config:{ url:webhookUrl, content_type:'json', secret:webhookSecret, insecure_ssl:'0' }, events:['push'], active:true },
    { headers:{ Authorization:`Bearer ${process.env.GITHUB_TOKEN}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28' } }
  )
  return response.data.id
}

async function deleteWebhook(githubRepoUrl, webhookId) {
  if (!webhookId || !process.env.GITHUB_TOKEN) return
  try {
    const { owner, repo } = parseGithubUrl(githubRepoUrl)
    await axios.delete(`https://api.github.com/repos/${owner}/${repo}/hooks/${webhookId}`, {
      headers:{ Authorization:`Bearer ${process.env.GITHUB_TOKEN}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28' }
    })
  } catch(err) {
    if (err.response?.status !== 404) console.error('[unified] Webhook delete failed:', err.message)
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  ANALYSIS PIPELINE
// ─────────────────────────────────────────────────────────────────────────
async function runAnalysis(eventId, projectId) {
  try {
    await Event.findByIdAndUpdate(eventId, { status:'analyzing', analysisStartedAt:new Date() })

    const [event, project] = await Promise.all([
      Event.findById(eventId).lean(),
      Project.findById(projectId).lean(),
    ])
    if (!event || !project) throw new Error('Event or project not found')

    const decryptedToken = decrypt(project.argocdToken)
    const [liveMetrics, historicalPeak] = await Promise.all([
      getLiveMetrics(project.prometheusUrl, project.argocdAppName),
      getHistoricalPeak(project.prometheusUrl, project.argocdAppName),
    ])

    const aiResult = await callAI(event, project, liveMetrics, historicalPeak)

    const reportId = uuidv4()
    const fullReport = {
      reportId, eventId:String(event._id), projectId:String(project._id),
      projectName:project.name, generatedAt:new Date().toISOString(),
      semanticChanges:event.semanticChanges||[], liveMetrics, historicalPeak,
      riskScore:aiResult.riskScore, riskReason:aiResult.riskReason,
      prediction:aiResult.prediction, recommendation:aiResult.recommendation,
      reportMarkdown:aiResult.reportMarkdown,
      adminDecision:null, decidedBy:null, decidedByEmail:null, decidedAt:null, argocdResumed:false,
    }

    const { blobPath, blobUrl } = await uploadReport(String(project._id), String(event._id), fullReport)

    await Report.findOneAndUpdate({ eventId:event._id }, {
      reportId, eventId:event._id, projectId:project._id,
      projectName:project.name,
      riskScore: typeof aiResult.riskScore==='number' ? aiResult.riskScore : { low:20, medium:50, high:75, critical:95 }[aiResult.riskScore] || 50,
      recommendation:aiResult.recommendation||'approve_with_caution',
      changesSummary:aiResult.riskReason,
      reportBlobPath:blobPath, reportBlobUrl:blobUrl,
      metricsAvailable:liveMetrics.available||historicalPeak.available,
      adminDecision:'pending', generatedAt:new Date(),
    }, { upsert:true, new:true })

    await publishToServiceBus({
      reportId, eventId:String(event._id), projectId:String(project._id),
      projectName:project.name, riskScore:aiResult.riskScore,
      recommendation:aiResult.recommendation, reportBlobUrl:blobUrl,
      adminEmails:(process.env.ADMIN_EMAILS||'').split(',').filter(Boolean),
    })

    await Event.findByIdAndUpdate(eventId, { status:'pending_approval', reportBlobUrl:blobUrl })
    console.log(`[unified] Analysis complete for event ${eventId}, risk: ${aiResult.riskScore}`)
  } catch(err) {
    console.error(`[unified] Analysis failed for event ${eventId}:`, err.message)
    await Event.findByIdAndUpdate(eventId, { status:'error' }).catch(()=>{})
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  JOI VALIDATION
// ─────────────────────────────────────────────────────────────────────────
const projectJoiSchema = Joi.object({
  name:              Joi.string().min(1).max(100).required(),
  githubRepoUrl:     Joi.string().uri().pattern(/^https:\/\/github\.com\//).required(),
  branch:            Joi.string().min(1).max(100).default('main'),
  folderPath:        Joi.string().pattern(/^\//).default('/helm'),
  prometheusUrl:     Joi.string().uri().required(),
  argocdUrl:         Joi.string().uri().required(),
  argocdAppName:     Joi.string().min(1).required(),
  argocdToken:       Joi.string().min(1).required(),
  kubernetesToken:   Joi.string().optional().allow('',null),
  kubernetesApiUrl:  Joi.string().uri().optional().allow('',null),
})

function validateProject(req, res, next) {
  const { error, value } = projectJoiSchema.validate(req.body, { abortEarly:false, stripUnknown:true })
  if (error) {
    const details = {}
    error.details.forEach(d => { details[d.context?.key||'field'] = d.message })
    return res.status(400).json({ error:'ValidationError', message:'Validation failed', details })
  }
  req.body = value
  next()
}

// ─────────────────────────────────────────────────────────────────────────
//  ROUTES
// ─────────────────────────────────────────────────────────────────────────

// ── Health ────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status:'ok', service:'kubeguard-unified', timestamp:new Date().toISOString(), db:mongoose.connection.readyState===1?'connected':'disconnected' })
})

// ── Auth ──────────────────────────────────────────────────────────────────
app.post('/api/auth/token', authLimiter, validateEntraToken, (req, res) => {
  const u = req.entraUser
  res.json({
    userId: u.oid||u.sub,
    email:  u.email||u.preferred_username||'',
    name:   u.name||'',
    roles:  Array.isArray(u.roles) ? u.roles : (u.roles ? [u.roles] : []),
  })
})

// ── GitHub Webhook ────────────────────────────────────────────────────────
app.post('/api/webhook/:projectId', webhookLimiter, express.raw({ type:'*/*' }), async (req, res) => {
  const { projectId } = req.params
  let project
  try {
    project = await Project.findById(projectId)
    if (!project) return res.status(404).json({ error:'NotFound', message:'Project not found.' })
  } catch {
    return res.status(400).json({ error:'BadRequest', message:'Invalid project ID.' })
  }

  const signature = req.headers['x-hub-signature-256']
  if (!signature) return res.status(401).json({ error:'Unauthorized', message:'Missing signature.' })

  const expected = `sha256=${crypto.createHmac('sha256', project.webhookSecret).update(req.body).digest('hex')}`
  let match = false
  try { match = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature)) } catch {}
  if (!match) return res.status(401).json({ error:'Unauthorized', message:'Invalid signature.' })

  let payload
  try { payload = JSON.parse(req.body.toString('utf8')) } catch { return res.status(400).json({ error:'BadRequest', message:'Invalid JSON.' }) }

  const pushedBranch = (payload.ref||'').replace('refs/heads/','')
  if (pushedBranch !== project.branch) return res.status(200).json({ message:`Branch not monitored.` })

  const commits = payload.commits || []
  const allChanged = commits.flatMap(c => [...(c.added||[]),(c.modified||[]),(c.removed||[])])
  const monitored = filterMonitoredFiles(allChanged, project.folderPath)
  if (!monitored.length) return res.status(200).json({ message:'No monitored files changed.' })

  const latestCommit = commits[commits.length-1] || {}
  const rawDiff = commits.flatMap(c => (c.modified||[]).filter(f=>monitored.includes(f)).map(f=>`diff --git a/${f} b/${f}\n--- a/${f}\n+++ b/${f}\n${c.patch||''}`)).join('\n')
  const semanticChanges = parseSemanticChanges(rawDiff)
  const argoResult = await pauseArgoCD(project.argocdUrl, decrypt(project.argocdToken), project.argocdAppName)

  const event = await new Event({
    projectId:project._id, projectName:project.name,
    commitSha:payload.after||latestCommit.id||'',
    commitMessage:latestCommit.message||'', commitUrl:latestCommit.url||'',
    author:latestCommit.author?.name||payload.pusher?.name||'',
    authorEmail:latestCommit.author?.email||'',
    changedFiles:allChanged, monitoredChangedFiles:monitored,
    semanticChanges, rawDiff, status:'detected',
    argocdPaused:argoResult.success, argocdPauseError:argoResult.error,
  }).save()

  res.status(200).json({ message:'Change detected. Analysis triggered.', eventId:event._id.toString() })
  setImmediate(() => runAnalysis(event._id.toString(), project._id.toString()))
})

// ── Apply auth middleware for all routes below ────────────────────────────
app.use('/api', express.json(), generalLimiter, validateEntraToken, extractUserHeaders)

// ── Projects ──────────────────────────────────────────────────────────────
app.post('/api/projects', validateProject, async (req, res) => {
  try {
    const existing = await Project.findOne({ githubRepoUrl:req.body.githubRepoUrl, branch:req.body.branch, folderPath:req.body.folderPath })
    if (existing) return res.status(409).json({ error:'DuplicateProject', message:'This repo/branch/folder is already monitored.' })

    let prometheusAvailable = false
    try { await axios.get(`${req.body.prometheusUrl}/api/v1/status/runtimeinfo`, { timeout:5000 }); prometheusAvailable=true } catch {}

    const webhookSecret = crypto.randomBytes(32).toString('hex')
    const project = new Project({
      ...req.body,
      createdBy:req.userId, createdByEmail:req.userEmail,
      prometheusAvailable, webhookSecret,
      argocdToken:encrypt(req.body.argocdToken),
      kubernetesToken:req.body.kubernetesToken ? encrypt(req.body.kubernetesToken) : null,
    })

    const warnings = []
    try { project.githubWebhookId = await registerWebhook(project.githubRepoUrl, webhookSecret, project._id.toString()) }
    catch(err) { warnings.push(`Webhook registration failed: ${err.message}`) }

    await project.save()
    res.status(201).json({ project:project.toSafeJSON(), warnings })
  } catch(err) {
    if (err.code===11000) return res.status(409).json({ error:'DuplicateProject', message:'Already monitored.' })
    res.status(500).json({ error:'InternalError', message:err.message })
  }
})

app.get('/api/projects', async (req, res) => {
  try {
    const isAdmin = req.userRoles.includes('Admin')
    const query = isAdmin ? {} : { createdBy:req.userId }
    const projects = await Project.find(query).sort({ createdAt:-1 })
    res.json({ projects:projects.map(p=>p.toSafeJSON()) })
  } catch(err) { res.status(500).json({ error:'InternalError', message:err.message }) }
})

app.get('/api/projects/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
    if (!project) return res.status(404).json({ error:'NotFound', message:'Project not found.' })
    if (!req.userRoles.includes('Admin') && project.createdBy !== req.userId)
      return res.status(404).json({ error:'NotFound', message:'Project not found.' })
    res.json({ project:project.toSafeJSON() })
  } catch(err) { res.status(500).json({ error:'InternalError', message:err.message }) }
})

app.put('/api/projects/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
    if (!project) return res.status(404).json({ error:'NotFound', message:'Project not found.' })
    if (!req.userRoles.includes('Admin') && project.createdBy !== req.userId)
      return res.status(404).json({ error:'NotFound', message:'Project not found.' })
    const { githubRepoUrl, branch, folderPath, argocdToken, kubernetesToken, ...rest } = req.body
    Object.assign(project, rest)
    if (argocdToken) project.argocdToken = encrypt(argocdToken)
    if (kubernetesToken) project.kubernetesToken = encrypt(kubernetesToken)
    await project.save()
    res.json({ project:project.toSafeJSON() })
  } catch(err) { res.status(500).json({ error:'InternalError', message:err.message }) }
})

app.delete('/api/projects/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
    if (!project) return res.status(404).json({ error:'NotFound', message:'Project not found.' })
    if (!req.userRoles.includes('Admin') && project.createdBy !== req.userId)
      return res.status(404).json({ error:'NotFound', message:'Project not found.' })
    await deleteWebhook(project.githubRepoUrl, project.githubWebhookId)
    await Project.deleteOne({ _id:project._id })
    res.json({ success:true })
  } catch(err) { res.status(500).json({ error:'InternalError', message:err.message }) }
})

app.get('/api/projects/:id/status', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
    if (!project) return res.status(404).json({ error:'NotFound', message:'Project not found.' })
    res.json({ projectId:project._id, name:project.name, status:project.status, prometheusAvailable:project.prometheusAvailable, lastEventAt:project.lastEventAt })
  } catch(err) { res.status(500).json({ error:'InternalError', message:err.message }) }
})

// ── Events ────────────────────────────────────────────────────────────────
app.get('/api/events', async (req, res) => {
  try {
    const { projectId, status, page=1, limit=20 } = req.query
    const query = {}
    if (projectId) query.projectId = projectId
    if (status) query.status = status
    const skip = (parseInt(page,10)-1) * parseInt(limit,10)
    const [events, total] = await Promise.all([
      Event.find(query).sort({ detectedAt:-1 }).skip(skip).limit(parseInt(limit,10)).lean(),
      Event.countDocuments(query),
    ])
    res.json({ events, total, page:parseInt(page,10), limit:parseInt(limit,10) })
  } catch(err) { res.status(500).json({ error:'InternalError', message:err.message }) }
})

app.get('/api/events/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).lean()
    if (!event) return res.status(404).json({ error:'NotFound', message:'Event not found.' })
    res.json({ event })
  } catch(err) { res.status(500).json({ error:'InternalError', message:err.message }) }
})

// ── Reports ───────────────────────────────────────────────────────────────
app.get('/api/reports', async (req, res) => {
  try {
    const { projectId, page=1, limit=20 } = req.query
    const query = projectId ? { projectId } : {}
    const skip = (parseInt(page,10)-1)*parseInt(limit,10)
    const [reports, total] = await Promise.all([
      Report.find(query).sort({ generatedAt:-1 }).skip(skip).limit(parseInt(limit,10)).lean(),
      Report.countDocuments(query),
    ])
    res.json({ reports, total, page:parseInt(page,10), limit:parseInt(limit,10) })
  } catch(err) { res.status(500).json({ error:'InternalError', message:err.message }) }
})

app.get('/api/reports/:eventId', async (req, res) => {
  try {
    const report = await Report.findOne({ eventId:req.params.eventId }).lean()
    if (!report) return res.status(404).json({ error:'NotFound', message:'Report not found.' })
    const blobContent = await getReportBlob(report.reportBlobPath).catch(()=>null)
    res.json({ report:{ ...report, ...(blobContent||{}) } })
  } catch(err) { res.status(500).json({ error:'InternalError', message:err.message }) }
})

// ── Notify / Decisions ────────────────────────────────────────────────────

// Email link — no Entra ID auth, uses HMAC-signed token
app.get('/api/notify/decide', webhookLimiter, async (req, res) => {
  const { token } = req.query
  if (!token) return res.status(400).send('<h2>Invalid link — token missing.</h2>')
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const parts = decoded.split(':')
    if (parts.length !== 4) throw new Error('Invalid token')
    const [eventId, decision, timestamp, sig] = parts
    if (Date.now() - parseInt(timestamp) > 48*60*60*1000) throw new Error('Token expired')
    const expected = crypto.createHmac('sha256', process.env.NOTIFICATION_SECRET||process.env.INTERNAL_SECRET)
      .update(`${eventId}:${decision}:${timestamp}`).digest('hex')
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) throw new Error('Invalid signature')
    await processDecision({ eventId, decision, decidedBy:'email-link', decidedByEmail:'admin-via-email', source:'email' })
    res.redirect(`${process.env.FRONTEND_URL||'/'}/events/${eventId}?decided=true&decision=${decision}`)
  } catch(err) {
    res.status(400).send(`<h2>Invalid or expired link.</h2><p>${err.message}</p>`)
  }
})

// Dashboard approval — Admin only
app.post('/api/notify/decide', requireAdmin, async (req, res) => {
  const { eventId, decision, note } = req.body
  if (!eventId || !['approved','rejected'].includes(decision))
    return res.status(400).json({ error:'ValidationError', message:'eventId and valid decision required.' })
  try {
    const result = await processDecision({ eventId, decision, decidedBy:req.userId, decidedByEmail:req.userEmail, decisionNote:note, source:'dashboard' })
    if (!result) return res.status(409).json({ error:'AlreadyDecided', message:'Decision already recorded.' })
    res.json({ success:true, decision:result })
  } catch(err) { res.status(500).json({ error:'InternalError', message:err.message }) }
})

app.get('/api/notify/decisions', requireAdmin, async (req, res) => {
  try {
    const decisions = await Decision.find().sort({ createdAt:-1 }).limit(50).lean()
    res.json({ decisions })
  } catch(err) { res.status(500).json({ error:'InternalError', message:err.message }) }
})

async function processDecision({ eventId, decision, decidedBy, decidedByEmail, decisionNote, source }) {
  const existing = await Decision.findOne({ eventId })
  if (existing) return null

  const report = await Report.findOne({ eventId }).lean()
  const project = report ? await Project.findById(report.projectId) : null

  let argoResumed = false
  if (decision === 'approved' && project) {
    const r = await resumeArgoCD(project.argocdUrl, decrypt(project.argocdToken), project.argocdAppName)
    argoResumed = r.success
  }

  const doc = await Decision.create({ eventId, projectId:report?.projectId?.toString()||'', decision, decidedBy, decidedByEmail, decisionNote:decisionNote||null, source, argocdResumed:argoResumed })
  await Event.findByIdAndUpdate(eventId, { status:decision==='approved'?'approved':'rejected', resolvedAt:new Date() })
  await Report.findOneAndUpdate({ eventId }, { adminDecision:decision, decidedBy, decidedByEmail, decidedAt:new Date() })
  return doc
}

// ── Block all /internal/* from external access ────────────────────────────
app.all('/internal/*', (req, res) => res.status(404).json({ error:'NotFound' }))

// ── Global error handler ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[unified] Error:', err.message)
  res.status(err.status||500).json({ error:err.code||'InternalError', message:err.message||'Unexpected error' })
})

// ─────────────────────────────────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`[unified] KubeGuard backend running on port ${PORT}`)
  console.log(`[unified] Health: http://localhost:${PORT}/health`)
})

process.on('SIGTERM', async () => {
  await mongoose.connection.close()
  process.exit(0)
})