const axios = require('axios')
const { v4: uuidv4 } = require('uuid')

const RETRY_DELAYS = [30000, 60000, 120000]

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withRetry(operation) {
  let lastError
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt === RETRY_DELAYS.length) break
      await sleep(RETRY_DELAYS[attempt])
    }
  }
  throw lastError
}

function stripJsonFences(text) {
  if (!text) return ''
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim()
}

function buildPrompt(event, project, metrics) {
  return [
    'You are KubeGuard AI, a Kubernetes deployment risk analyst.',
    'Return ONLY valid JSON with the following keys:',
    '{ "riskScore": number, "recommendation": string, "changesSummary": string, "reasoning": string, "topRisks": string[] }',
    '',
    `Project: ${project.name}`,
    `Repository: ${project.githubRepoUrl}`,
    `Branch: ${project.branch}`,
    `ArgoCD App: ${project.argocdAppName}`,
    `Event ID: ${event._id}`,
    `Commit SHA: ${event.commitSha}`,
    `Commit Message: ${event.commitMessage || ''}`,
    `Changed Files: ${(event.changedFiles || []).join(', ') || 'none'}`,
    `Semantic Changes: ${JSON.stringify(event.semanticChanges || [])}`,
    `Live Metrics: ${JSON.stringify(metrics.live || {})}`,
    `Historical Peak: ${JSON.stringify(metrics.peak || {})}`,
    '',
    'Focus on production risk, resource changes, traffic impact, and rollback safety.',
  ].join('\n')
}

function fallbackReport(event, project, metrics) {
  const criticalChanges = Array.isArray(event.semanticChanges)
    ? event.semanticChanges.filter((change) => change.isCriticalField).length
    : 0
  const riskScore = Math.min(95, 35 + criticalChanges * 10 + (metrics.live?.available ? 0 : 10))

  return {
    reportId: uuidv4(),
    riskScore,
    recommendation: riskScore >= 70 ? 'Reject until the change is reviewed by an admin.' : 'Approve after a manual sanity check.',
    changesSummary: {
      changedFiles: event.changedFiles || [],
      semanticChangeCount: Array.isArray(event.semanticChanges) ? event.semanticChanges.length : 0,
      criticalChangeCount: criticalChanges,
    },
    reasoning: 'Generated fallback report because the AI response could not be parsed.',
    topRisks: ['AI response parsing failed', metrics.live?.available ? 'Metrics were partially available' : 'Metrics were unavailable'],
    metricsAvailable: Boolean(metrics.live?.available || metrics.peak?.available),
  }
}

async function requestAnalysis(event, project, metrics) {
  const apiUrl = process.env.AI_API_URL
  const apiKey = process.env.AI_API_KEY
  const model = process.env.AI_MODEL || 'gpt-4o-mini'

  if (!apiUrl || !apiKey) {
    return fallbackReport(event, project, metrics)
  }

  const payload = buildPrompt(event, project, metrics)

  return withRetry(async () => {
    let response
    if (/anthropic/i.test(apiUrl)) {
      response = await axios.post(
        apiUrl,
        {
          model,
          max_tokens: 1200,
          messages: [{ role: 'user', content: payload }],
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          timeout: 60000,
        }
      )
    } else {
      response = await axios.post(
        apiUrl,
        {
          model,
          messages: [{ role: 'user', content: payload }],
          temperature: 0.2,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          timeout: 60000,
        }
      )
    }

    const text =
      response.data?.choices?.[0]?.message?.content ??
      response.data?.content?.[0]?.text ??
      response.data?.output_text ??
      ''

    const cleaned = stripJsonFences(typeof text === 'string' ? text : JSON.stringify(text))
    try {
      const parsed = JSON.parse(cleaned)
      return {
        reportId: parsed.reportId || uuidv4(),
        riskScore: Number(parsed.riskScore ?? 50),
        recommendation: parsed.recommendation || 'Review the change carefully before approving.',
        changesSummary: parsed.changesSummary ?? {
          summary: 'AI-generated report',
        },
        reasoning: parsed.reasoning || '',
        topRisks: parsed.topRisks || [],
        metricsAvailable: Boolean(metrics.live?.available || metrics.peak?.available),
      }
    } catch (error) {
      return fallbackReport(event, project, metrics)
    }
  })
}

module.exports = { requestAnalysis, stripJsonFences, withRetry }
