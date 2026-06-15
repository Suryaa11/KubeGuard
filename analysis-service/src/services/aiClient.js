const axios = require('axios')
const logger = require('../utils/logger')

const FALLBACK_REPORT = {
  riskScore: 'medium',
  riskReason: 'AI unavailable - manual review required',
  prediction: 'Unable to predict deployment impact because AI analysis was unavailable.',
  recommendation: 'approve_with_caution',
  reportMarkdown: '## Manual Review Required\n\nAI analysis unavailable. Review the Kubernetes change and cluster metrics before deciding.',
}

function extractText(data) {
  return (
    data?.choices?.[0]?.message?.content ??
    data?.content?.[0]?.text ??
    data?.output_text ??
    ''
  )
}

function extractJsonObject(text) {
  if (!text || typeof text !== 'string') return null

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null

  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch (error) {
    logger.warn(`AI JSON parse failed: ${error.message}`)
    return null
  }
}

function normalizeRiskScore(value) {
  const riskScore = String(value || '').toLowerCase()
  return ['low', 'medium', 'high', 'critical'].includes(riskScore) ? riskScore : 'medium'
}

function normalizeRecommendation(value) {
  const recommendation = String(value || '').toLowerCase()
  return ['approve', 'approve_with_caution', 'reject'].includes(recommendation)
    ? recommendation
    : 'approve_with_caution'
}

function normalizeReport(parsed) {
  if (!parsed) return { ...FALLBACK_REPORT }

  return {
    riskScore: normalizeRiskScore(parsed.riskScore),
    riskReason: parsed.riskReason || parsed.reasoning || FALLBACK_REPORT.riskReason,
    prediction: parsed.prediction || FALLBACK_REPORT.prediction,
    recommendation: normalizeRecommendation(parsed.recommendation),
    reportMarkdown: parsed.reportMarkdown || FALLBACK_REPORT.reportMarkdown,
  }
}

async function generateReport(prompt) {
  try {
    const response = await axios.post(
      process.env.AI_API_URL,
      {
        model: process.env.AI_MODEL,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.AI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    )

    const text = extractText(response.data)
    return normalizeReport(extractJsonObject(text))
  } catch (error) {
    logger.warn(`AI API unavailable, using fallback report: ${error.message}`)
    return { ...FALLBACK_REPORT }
  }
}

module.exports = { generateReport, extractJsonObject, normalizeReport }
