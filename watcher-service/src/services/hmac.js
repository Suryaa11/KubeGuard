const crypto = require('crypto')

function verifyGithubSignature(rawBody, signature, secret) {
  if (!signature || !secret || !Buffer.isBuffer(rawBody)) {
    return false
  }

  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(signature)

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
}

module.exports = { verifyGithubSignature }
