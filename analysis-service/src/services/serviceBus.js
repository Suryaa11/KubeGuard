const { ServiceBusClient } = require('@azure/service-bus')

let client = null
let sender = null

function getClient() {
  const connectionString = process.env.SERVICE_BUS_CONNECTION_STRING
  if (!connectionString) {
    throw new Error('SERVICE_BUS_CONNECTION_STRING is required')
  }
  if (!client) {
    client = new ServiceBusClient(connectionString)
  }
  return client
}

async function getSender() {
  if (!sender) {
    const queueName = process.env.SERVICE_BUS_QUEUE || 'report-ready'
    sender = getClient().createSender(queueName)
  }
  return sender
}

async function publishReportReady(message) {
  const currentSender = await getSender()
  await currentSender.sendMessages({
    body: message,
    contentType: 'application/json',
    subject: 'report-ready',
  })
}

async function closeConnection() {
  try {
    if (sender) {
      await sender.close()
      sender = null
    }
  } finally {
    if (client) {
      await client.close()
      client = null
    }
  }
}

module.exports = { publishReportReady, closeConnection }
