const { BlobServiceClient } = require('@azure/storage-blob')

let blobServiceClient = null

function getBlobServiceClient() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is required')
  }
  if (!blobServiceClient) {
    blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)
  }
  return blobServiceClient
}

async function ensureContainer() {
  const containerName = process.env.AZURE_STORAGE_CONTAINER || 'kubeguard-reports'
  const containerClient = getBlobServiceClient().getContainerClient(containerName)
  await containerClient.createIfNotExists({ access: 'private' })
  return containerClient
}

async function uploadReport(projectId, eventId, reportObject) {
  const containerClient = await ensureContainer()
  const blobPath = `${projectId}/${eventId}/report.json`
  const blockBlobClient = containerClient.getBlockBlobClient(blobPath)
  const payload = JSON.stringify(reportObject, null, 2)
  await blockBlobClient.upload(payload, Buffer.byteLength(payload), {
    blobHTTPHeaders: { blobContentType: 'application/json' },
  })

  return {
    blobPath,
    blobUrl: blockBlobClient.url,
  }
}

async function getReportContent(blobPath) {
  const containerClient = await ensureContainer()
  const blobClient = containerClient.getBlobClient(blobPath)
  const exists = await blobClient.exists()
  if (!exists) return null
  const downloadResponse = await blobClient.download()
  const chunks = []
  for await (const chunk of downloadResponse.readableStreamBody) {
    chunks.push(Buffer.from(chunk))
  }
  const content = Buffer.concat(chunks).toString('utf8')
  return JSON.parse(content)
}

module.exports = { uploadReport, getReportContent }
