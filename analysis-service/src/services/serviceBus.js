const { ServiceBusClient } = require('@azure/service-bus')
const logger = require('../utils/logger')

async function publishMessage(messageBody) {
  let client
  let sender

  try {
    client = new ServiceBusClient(process.env.SERVICE_BUS_CONNECTION_STRING)
    sender = client.createSender(process.env.SERVICE_BUS_QUEUE)

    await sender.sendMessages({
      body: messageBody,
      contentType: 'application/json',
    })

    return { success: true }
  } catch (error) {
    logger.warn(`Service Bus publish failed: ${error.message}`)
    return { success: false, error: error.message }
  } finally {
    if (sender) await sender.close().catch(() => {})
    if (client) await client.close().catch(() => {})
  }
}

async function closeConnection() {
  return Promise.resolve()
}

module.exports = { publishMessage, closeConnection }
