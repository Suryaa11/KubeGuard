const crypto = require('crypto')

function sign(payload) {
  return crypto
    .createHmac('sha256', process.env.NOTIFICATION_SECRET)
    .update(payload)
    .digest('hex')
}

function generateApprovalToken(eventId, decision) {
  const payload = `${eventId}:${decision}:${Date.now()}`
  const signature = sign(payload)
  return Buffer.from(`${payload}:${signature}`).toString('base64url')
}

function timingSafeEqualHex(left, right) {
  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')
  if (leftBuffer.length !== rightBuffer.length) return false
  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function verifyApprovalToken(token, maxAgeMs = 48 * 60 * 60 * 1000) {
  let decoded
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf8')
  } catch (error) {
    throw new Error('Invalid token format')
  }

  const parts = decoded.split(':')
  if (parts.length !== 4) {
    throw new Error('Invalid token format')
  }

  const [eventId, decision, timestamp, signature] = parts
  if (!['approved', 'rejected'].includes(decision)) {
    throw new Error('Invalid decision')
  }

  const timestampNumber = Number(timestamp)
  if (!Number.isFinite(timestampNumber)) {
    throw new Error('Invalid token timestamp')
  }

  if (Date.now() - timestampNumber > maxAgeMs) {
    throw new Error('Token expired')
  }

  const expectedPayload = `${eventId}:${decision}:${timestamp}`
  const expectedSignature = sign(expectedPayload)
  if (!timingSafeEqualHex(expectedSignature, signature)) {
    throw new Error('Invalid token signature')
  }

  return { eventId, decision }
}

module.exports = { generateApprovalToken, verifyApprovalToken }
