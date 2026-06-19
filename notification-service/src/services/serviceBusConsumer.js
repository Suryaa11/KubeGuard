const axios = require('axios')
const { ServiceBusClient } = require('@azure/service-bus')

const { sendApprovalEmail } = require('./emailService')
const logger = require('../utils/logger')

let client = null
let receiver = null
let reconnectTimer = null

function internalHeaders() {
  return { 'x-internal-secret': process.env.INTERNAL_SECRET }
}

function trimTrailingSlash(url) {
  return String(url || '').replace(/\/$/, '')
}

async function fetchReport(eventId) {
  const response = await axios.get(
    `${trimTrailingSlash(process.env.ANALYSIS_SERVICE_URL)}/internal/reports/${eventId}`,
    {
      headers: internalHeaders(),
      timeout: 15000,
    }
  )
  return response.data?.report || response.data
}

async function fetchProject(projectId) {
  const response = await axios.get(
    `${trimTrailingSlash(process.env.PROJECT_SERVICE_URL)}/internal/projects/${projectId}`,
    {
      headers: internalHeaders(),
      timeout: 15000,
    }
  )
  return response.data?.project || response.data
}

async function processMessage(message) {
  logger.info('Received message from Service Bus')
  const body = message.body || {}

  try {
    const report = await fetchReport(body.eventId)
    const project = await fetchProject(body.projectId || report.projectId)
    await sendApprovalEmail(
      {
        ...body,
        ...report,
        reportBlobUrl: report.reportBlobUrl || body.reportBlobUrl,
      },
      project,
      body.adminEmails || []
    )
    logger.info(`Processed report-ready message for event: ${body.eventId}`)
  } catch (error) {
    logger.error(`Failed to process report-ready message: ${error.message}`)
  } finally {
    if (receiver) {
      await receiver.completeMessage(message).catch((error) => {
        logger.warn(`Failed to complete Service Bus message: ${error.message}`)
      })
    }
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null
    await stopConsumer()
    await startConsumer()
  }, 30000)
}

async function startConsumer() {
  try {
    client = new ServiceBusClient(process.env.SERVICE_BUS_CONNECTION_STRING)
    receiver = client.createReceiver(process.env.SERVICE_BUS_QUEUE, {
      receiveMode: 'peekLock',
    })

    receiver.subscribe(
      {
        processMessage,
        processError: async (error) => {
          logger.error(`Service Bus consumer error: ${error.message}`)
          scheduleReconnect()
        },
      },
      {
        autoCompleteMessages: false,
      }
    )

    logger.info(`Service Bus consumer started for queue: ${process.env.SERVICE_BUS_QUEUE}`)
  } catch (error) {
    logger.error(`Failed to start Service Bus consumer: ${error.message}`)
    scheduleReconnect()
  }
}

async function stopConsumer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  if (receiver) {
    await receiver.close().catch(() => {})
    receiver = null
  }

  if (client) {
    await client.close().catch(() => {})
    client = null
  }
}

module.exports = { startConsumer, stopConsumer, processMessage }
