const { BlobServiceClient } = require('@azure/storage-blob')

module.exports = async function (context, myTimer) {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
  const containerName = process.env.AZURE_STORAGE_CONTAINER || 'kubeguard-reports'
  const daysThreshold = parseInt(process.env.BLOB_HOT_TO_COOL_DAYS || '7', 10)

  if (!connectionString) {
    context.log.error('[tier-migration] AZURE_STORAGE_CONNECTION_STRING is not set')
    return
  }

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysThreshold)

  context.log(
    `[tier-migration] Starting. Moving blobs older than ${daysThreshold} days (before ${cutoffDate.toISOString()}) to Cool tier.`
  )

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)
  const containerClient = blobServiceClient.getContainerClient(containerName)
  await containerClient.createIfNotExists()

  let movedCount = 0
  let errorCount = 0

  for await (const blob of containerClient.listBlobsFlat({ includeMetadata: true })) {
    const lastModified = blob.properties.lastModified
    const currentTier = blob.properties.accessTier

    if (currentTier === 'Cool' || currentTier === 'Archive') continue

    if (lastModified && lastModified < cutoffDate) {
      try {
        const blockBlobClient = containerClient.getBlockBlobClient(blob.name)
        await blockBlobClient.setAccessTier('Cool')
        movedCount += 1
        context.log(`[tier-migration] Moved to Cool: ${blob.name}`)
      } catch (error) {
        errorCount += 1
        context.log.error(`[tier-migration] Failed to move ${blob.name}: ${error.message}`)
      }
    }
  }

  context.log(`[tier-migration] Complete. Moved: ${movedCount}, Errors: ${errorCount}`)
}
