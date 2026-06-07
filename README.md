# KubeGuard AI

AI-powered pre-deployment risk analysis for Kubernetes clusters.

## What is this?

KubeGuard AI sits between your Git repository and your Kubernetes cluster.
When an engineer pushes a Helm values change, KubeGuard:
1. Pauses the ArgoCD deployment
2. Fetches live cluster metrics from Prometheus
3. Generates an AI risk report
4. Requires admin approval before the change reaches production

## Services

| Service | Port | Status |
| --- | ---: | --- |
| Frontend | 5173 | Built |
| API Gateway | 3000 | Built |
| Project Service | 3001 | Built |
| Watcher Service | 3002 | Built |
| Analysis Service | 3003 | Built |
| Notification Service | 3004 | Pending |

## Prerequisites

- Node.js v20+
- Docker and Docker Compose
- Azure account with Entra ID configured

## Environment Variables

### Frontend (`frontend/.env`)

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_AZURE_CLIENT_ID` | Yes | Azure App Registration client ID |
| `VITE_AZURE_TENANT_ID` | Yes | Azure Entra ID tenant ID |
| `VITE_AZURE_REDIRECT_URI` | Yes | OAuth redirect URI (`http://localhost:5173` local) |
| `VITE_API_BASE_URL` | Yes | API Gateway URL (`http://localhost:3000` local) |

### Gateway (`gateway/.env`)

| Variable | Required | Description |
| --- | --- | --- |
| `AZURE_TENANT_ID` | Yes | Microsoft Entra tenant ID |
| `AZURE_CLIENT_ID` | Yes | App registration client ID |
| `INTERNAL_SECRET` | Yes | Shared secret for internal service calls |
| `FRONTEND_URL` | Yes | Allowed CORS origin for the SPA |

### Project Service (`project-service/.env`)

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | Yes | Cosmos DB MongoDB API connection string |
| `ENCRYPTION_KEY` | Yes | 32-character AES-256 key for token encryption |
| `GITHUB_TOKEN` | Yes | GitHub PAT used to create webhooks |
| `GATEWAY_PUBLIC_URL` | Yes | Public URL used for webhook registration |

### Watcher Service (`watcher-service/.env`)

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | Yes | Cosmos DB MongoDB API connection string |
| `INTERNAL_SECRET` | Yes | Shared secret for internal service calls |
| `PROJECT_SERVICE_URL` | Yes | Internal URL for Project Service |
| `ANALYSIS_SERVICE_URL` | Yes | Internal URL for Analysis Service |

### Analysis Service (`analysis-service/.env`)

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | Yes | Cosmos DB MongoDB API connection string |
| `INTERNAL_SECRET` | Yes | Shared secret for internal service calls |
| `AI_API_URL` | Yes | OpenAI or Anthropic-compatible API endpoint |
| `AI_API_KEY` | Yes | API key for the AI provider |
| `AI_MODEL` | Yes | Model name to use for report generation |
| `AZURE_STORAGE_CONNECTION_STRING` | Yes | Storage account connection string for report blobs |
| `AZURE_STORAGE_CONTAINER` | Yes | Blob container for reports |
| `SERVICE_BUS_CONNECTION_STRING` | Yes | Azure Service Bus connection string |
| `SERVICE_BUS_QUEUE` | Yes | Queue used for report-ready notifications |
| `PROJECT_SERVICE_URL` | Yes | Internal URL for Project Service |
| `WATCHER_SERVICE_URL` | Yes | Internal URL for Watcher Service |
| `ADMIN_EMAILS` | Yes | Comma-separated list of admin email addresses |

## Quick Start (Frontend Only)

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Quick Start on Windows

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1
```

This starts the frontend, gateway, project service, watcher service, and analysis service together.

## Quick Start (Gateway)

```bash
cd gateway
cp .env.example .env
npm install
npm start
```

## Quick Start (Project Service)

```bash
cd project-service
cp .env.example .env
npm install
npm start
```

## Quick Start (Watcher Service)

```bash
cd watcher-service
cp .env.example .env
npm install
npm start
```

## Quick Start (Analysis Service)

```bash
cd analysis-service
cp .env.example .env
npm install
npm start
```

## Quick Start (Full Stack)

```bash
cp .env.example .env
docker-compose up --build
```

## Production Deployment

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for the Azure App Service, Azure Functions, and Azure DevOps release flow.
