# KubeGuard AI Production Deployment

This document describes the Azure resources and release flow for KubeGuard AI.

## Services

- `frontend` on Azure App Service
- `gateway` on Azure App Service
- `project-service` on Azure App Service
- `watcher-service` on Azure App Service
- `analysis-service` on Azure App Service
- `notification-service` on Azure App Service
- `functions` on Azure Functions

## Required Azure resources

- Azure Entra ID app registration with `Admin` and `DevOpsEngineer` roles
- Azure App Service Plan for the containerized services
- Azure Container Registry for the Docker images
- Azure Cosmos DB using the MongoDB API
- Azure Storage Account for report blobs and Function storage
- Azure Service Bus queue named `report-ready`
- Azure Key Vault for secrets
- Azure Monitor and Application Insights for observability

## Environment variables

Set all service variables in your App Service settings or Key Vault references:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `INTERNAL_SECRET`
- `MONGODB_URI`
- `ENCRYPTION_KEY`
- `GITHUB_TOKEN`
- `GATEWAY_PUBLIC_URL`
- `AI_API_URL`
- `AI_API_KEY`
- `AI_MODEL`
- `AZURE_STORAGE_CONNECTION_STRING`
- `AZURE_STORAGE_CONTAINER`
- `SERVICE_BUS_CONNECTION_STRING`
- `SERVICE_BUS_QUEUE`
- `PROJECT_SERVICE_URL`
- `WATCHER_SERVICE_URL`
- `ANALYSIS_SERVICE_URL`
- `NOTIFICATION_SERVICE_URL`
- `ADMIN_EMAILS`

## Build and release flow

1. Push to `main`.
2. Azure DevOps builds and pushes each Docker image.
3. Azure DevOps packages the Azure Functions app.
4. Azure DevOps deploys the containers to App Service.
5. Azure DevOps deploys the Azure Functions zip package.
6. Azure DevOps runs health checks against the deployed services.

## Function app

The Functions app provides:

- Report tier migration from Hot to Cool
- Email dispatcher for Service Bus messages
- Baseline health check for new projects

Local development uses:

- `functions/package.json`
- `functions/host.json`
- `functions/local.settings.json.example`

## Local startup

Use the root launcher:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1
```

If Azure Functions Core Tools is installed, `start-local.sh` can launch the Functions app too.
