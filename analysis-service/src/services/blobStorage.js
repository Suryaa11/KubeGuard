const {
  BlobSASPermissions,
  BlobServiceClient,
  SASProtocol,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} = require('@azure/storage-blob')

const logger = require('../utils/logger')

function parseConnectionString(connectionString) {
  return connectionString.split(';').reduce((acc, part) => {
    const [key, ...valueParts] = part.split('=')
    if (key) acc[key] = valueParts.join('=')
    return acc
  }, {})
}

function getContainerClient() {
  const blobServiceClient = BlobServiceClient.fromConnectionString(
    process.env.AZURE_STORAGE_CONNECTION_STRING
  )
  return blobServiceClient.getContainerClient(process.env.AZURE_STORAGE_CONTAINER)
}

function generateSasUrl(blobName) {
  const settings = parseConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING)
  const accountName = settings.AccountName
  const accountKey = settings.AccountKey

  if (!accountName || !accountKey) {
    return null
  }

  const credential = new StorageSharedKeyCredential(accountName, accountKey)
  const startsOn = new Date()
  const expiresOn = new Date(startsOn.getTime() + 7 * 24 * 60 * 60 * 1000)

  const sas = generateBlobSASQueryParameters(
    {
      containerName: process.env.AZURE_STORAGE_CONTAINER,
      blobName,
      permissions: BlobSASPermissions.parse('r'),
      protocol: SASProtocol.Https,
      startsOn,
      expiresOn,
    },
    credential
  ).toString()

  const blobClient = getContainerClient().getBlobClient(blobName)
  return `${blobClient.url}?${sas}`
}

async function uploadReport(projectId, eventId, reportObject) {
  const blobName = `${projectId}/${eventId}/report.json`

  try {
    const containerClient = getContainerClient()
    await containerClient.createIfNotExists()
    const blockBlobClient = containerClient.getBlockBlobClient(blobName)
    const content = JSON.stringify(reportObject, null, 2)

    await blockBlobClient.upload(content, Buffer.byteLength(content), {
      blobHTTPHeaders: { blobContentType: 'application/json' },
    })

    return {
      blobName,
      sasUrl: generateSasUrl(blobName),
    }
  } catch (error) {
    logger.warn(`Blob upload failed: ${error.message}`)
    return {
      blobName,
      sasUrl: null,
    }
  }
}

async function downloadReport(projectId, eventId) {
  const blobName = `${projectId}/${eventId}/report.json`

  try {
    const blobClient = getContainerClient().getBlobClient(blobName)
    const exists = await blobClient.exists()
    if (!exists) return null

    const downloadResponse = await blobClient.download()
    const chunks = []
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(Buffer.from(chunk))
    }

    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (error) {
    logger.warn(`Blob download failed: ${error.message}`)
    return null
  }
}

module.exports = { uploadReport, downloadReport, generateSasUrl }
