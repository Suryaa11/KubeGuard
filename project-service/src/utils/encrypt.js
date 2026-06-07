const crypto = require('crypto')

const ALGORITHM = 'aes-256-gcm'

function getKey() {
  const raw = process.env.ENCRYPTION_KEY || ''
  if (raw.length < 32) throw new Error('ENCRYPTION_KEY must be at least 32 characters')
  return Buffer.from(raw.slice(0, 32), 'utf8')
}

function encrypt(text) {
  if (!text) return null
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

function decrypt(encryptedStr) {
  if (!encryptedStr) return null
  const parts = encryptedStr.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted string format')
  const [ivHex, tagHex, encHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(encHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

module.exports = { encrypt, decrypt }
