# KubeGuard AI Development Summary

This file documents the current codebase state for all five KubeGuard AI microservices. It is intended for another AI/developer that has the master reference document but has not seen the actual implementation or the fixes/testing performed here.

Important security note: local `.env` and `.env.docker` files exist for some services and contain real secrets. This summary intentionally documents only `.env.example` content and contract shape, not secret values from local runtime files.

## Repository State Snapshot

- Runtime: Node.js microservices using Express 4 and MongoDB/Mongoose.
- Services present:
  - MS1 Gateway: `gateway`
  - MS2 Project Service: `project-service`
  - MS3 Watcher Service: `watcher-service`
  - MS4 Analysis Service: `analysis-service`
  - MS5 Notification Service: `notification-service`
- Shared local database: MongoDB database `kubeguard`.
- Root `docker-compose.yml` starts MongoDB plus all five services.
- `functions/` exists in the repo but was explicitly ignored for MS5 because MS5 is a standalone Express service, not an Azure Function.

---

# MS1 - Gateway

## File Structure

- `gateway/.env` - local runtime values; contains secrets and is gitignored.
- `gateway/.env.docker` - Docker runtime values; contains real local/Docker values and should not be copied into docs.
- `gateway/.env.example` - environment template for gateway.
- `gateway/Dockerfile` - production Node 20 Alpine container build.
- `gateway/package.json` - package manifest and scripts.
- `gateway/package-lock.json` - npm lockfile.
- `gateway/src/app.js` - Express app, token validation pipeline, rate limits, proxies, webhook raw-body proxy.
- `gateway/src/index.js` - loads dotenv, starts HTTP server, handles SIGTERM.
- `gateway/src/middleware/checkRole.js` - role middleware for gateway-level route protection.
- `gateway/src/middleware/extractHeaders.js` - maps decoded Entra JWT claims to downstream internal headers.
- `gateway/src/middleware/validateToken.js` - validates Microsoft Entra JWTs using JWKS.
- `gateway/src/routes/auth.js` - `/api/auth/token` validation endpoint.
- `gateway/src/utils/logger.js` - `[gateway]` prefixed console logger.

## Key Implementation Decisions

- Gateway validates Entra access tokens directly with `jsonwebtoken` and `jwks-rsa`, not `@azure/msal-node`.
- Gateway strips `Authorization` before proxying and injects `x-user-*` headers.
- Gateway protects all `/api/notify/*` routes with `requireRole('Admin')`. This means the email-link route `GET /api/notify/decide?token=...` would be blocked by gateway auth/role if routed through gateway as currently written. Direct service route `GET http://localhost:3004/notify/decide?token=...` works without Entra. This is a contract mismatch with the master flow and is documented again in cross-service notes.
- GitHub webhook requests are exempt from JSON body parsing and proxied as raw bytes to preserve HMAC verification.
- The gateway does not currently define a 404 handler. Unknown routes after middleware may fall through Express defaults unless intercepted by a proxy/middleware.

## Dependencies

Package manifest dependency ranges:

```json
{
  "cors": "^2.8.5",
  "dotenv": "^16.3.1",
  "express": "^4.18.2",
  "express-rate-limit": "^7.1.5",
  "helmet": "^7.1.0",
  "http-proxy-middleware": "^2.0.6",
  "jsonwebtoken": "^9.0.2",
  "jwks-rsa": "^3.1.0",
  "morgan": "^1.10.0",
  "uuid": "^9.0.0"
}
```

Installed versions observed with `npm.cmd ls --depth=0`:

```text
cors@2.8.6
dotenv@16.6.1
express-rate-limit@7.5.1
express@4.22.2
helmet@7.2.0
http-proxy-middleware@2.0.9
jsonwebtoken@9.0.3
jwks-rsa@3.2.2
morgan@1.11.0
uuid@9.0.1
nodemon@3.1.14
```

## Environment Variables

Exact `gateway/.env.example`:

```env
NODE_ENV=
GATEWAY_PORT=
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
FRONTEND_URL=
PROJECT_SERVICE_URL=
WATCHER_SERVICE_URL=
ANALYSIS_SERVICE_URL=
NOTIFICATION_SERVICE_URL=
INTERNAL_SECRET=
LOG_LEVEL=
```

## Routes and Actual Logic

### `GET /health`

1. Returns `{ status: 'ok', service: 'gateway', timestamp }`.
2. Does not check downstream health.

### `POST /api/auth/token`

1. Uses `verifyAccessToken(req.headers.authorization)`.
2. Requires `Authorization: Bearer <token>`.
3. Verifies token signature through Microsoft JWKS URL for configured tenant.
4. Accepts audience either `AZURE_CLIENT_ID` or `api://AZURE_CLIENT_ID`.
5. Accepts issuer `https://login.microsoftonline.com/{tenant}/v2.0` or `https://sts.windows.net/{tenant}/`.
6. On success returns `{ userId, email, name, roles }`.
7. On failure returns `401 { error:'Unauthorized', message:'Invalid or expired token' }`.

### `POST /api/webhook/:projectId`

1. Uses webhook-specific rate limit.
2. Uses `express.raw({ type: '*/*' })`.
3. Proxies to `WATCHER_SERVICE_URL`.
4. Rewrites path from `/api/webhook/:projectId` to `/webhook/:projectId`.
5. Writes raw buffer to proxy request and sets content length.
6. Adds or forwards `x-request-id`.

### Authenticated proxy routes

Before these routes, Gateway:

1. Applies general rate limit.
2. Validates Entra token.
3. Extracts internal headers:
   - `x-user-id`
   - `x-user-email`
   - `x-user-name`
   - `x-user-roles`
   - `x-request-id`
4. Deletes `authorization`.

Routes:

- `/api/projects/*` proxies to `PROJECT_SERVICE_URL` with `/api` stripped.
- `/api/events/*` proxies to `WATCHER_SERVICE_URL` with `/api` stripped.
- `/api/reports/*` proxies to `ANALYSIS_SERVICE_URL` with `/api` stripped.
- `/api/notify/*` first requires `Admin`, then proxies to `NOTIFICATION_SERVICE_URL` with `/api` stripped.

## Inter-Service Calls

Gateway does not call services with Axios; it proxies using `http-proxy-middleware`.

- `PROJECT_SERVICE_URL`: target for `/api/projects`.
- `WATCHER_SERVICE_URL`: target for `/api/events` and `/api/webhook`.
- `ANALYSIS_SERVICE_URL`: target for `/api/reports`.
- `NOTIFICATION_SERVICE_URL`: target for `/api/notify`.
- Headers forwarded include injected `x-user-*` and `x-request-id`; `Authorization` is removed for authenticated downstream routes.

## Database Models

Gateway has no Mongoose models and does not connect to MongoDB.

## Testing Done

- Source/import inspection confirmed current routes and middleware.
- Prior implementation smoke intent was gateway token validation and proxying; full Entra token validation was not run here because a fresh Microsoft token was not available.
- Known behavior reviewed: raw webhook path is preserved for HMAC verification.

## Known Issues or Workarounds

- `/api/notify` is protected globally with `Admin`, which conflicts with unauthenticated signed email decision links.
- `GATEWAY_PORT` has no default in `src/index.js`; missing env may start on an undefined/invalid port.
- No startup validation for required Gateway env vars.

## Docker and Startup

Exact `gateway/Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3000
CMD ["node", "src/index.js"]
```

Startup:

```powershell
cd gateway
npm install
npm start
```

---

# MS2 - Project Service

## File Structure

- `project-service/.env` - local runtime values; contains secrets and is gitignored.
- `project-service/.env.docker` - Docker runtime values; contains real local/Docker values and should not be copied into docs.
- `project-service/.env.example` - environment template.
- `project-service/Dockerfile` - production Node 20 Alpine container build.
- `project-service/package.json` - package manifest and scripts.
- `project-service/package-lock.json` - npm lockfile.
- `project-service/src/app.js` - Express app, middleware, health, external/internal route mounting, error handler.
- `project-service/src/index.js` - env validation, MongoDB connection, server startup/shutdown.
- `project-service/src/middleware/checkInternal.js` - validates `x-internal-secret`.
- `project-service/src/middleware/checkRole.js` - generic role middleware; route code mostly does manual ownership checks.
- `project-service/src/middleware/validate.js` - Joi schemas and validation middleware.
- `project-service/src/models/Project.js` - Mongoose model for `projects`.
- `project-service/src/routes/internal.js` - internal project fetch with decrypted secrets.
- `project-service/src/routes/projects.js` - external project CRUD/status routes.
- `project-service/src/services/githubWebhook.js` - GitHub webhook register/delete client.
- `project-service/src/utils/encrypt.js` - AES-256-GCM encrypt/decrypt for tokens.
- `project-service/src/utils/errors.js` - custom app errors.
- `project-service/src/utils/logger.js` - `[project-service]` prefixed logger.

## Key Implementation Decisions

- Project Service owns `projects` and stores encrypted ArgoCD/Kubernetes tokens.
- `webhookSecret` is generated with `crypto.randomBytes(32).toString('hex')` and excluded from normal responses.
- Internal route returns decrypted `argocdToken`, `kubernetesToken`, and selected `webhookSecret`; this enables Watcher and Notification service to operate.
- Prometheus availability and GitHub webhook registration are warning-only: project creation/update continues even if these fail.
- `folderPath` must start with `/`; default in model is `/helm`.
- Duplicate projects are checked explicitly before insert and also backed by a unique compound index.

## Dependencies

Package manifest dependency ranges:

```json
{
  "axios": "^1.6.8",
  "cors": "^2.8.5",
  "dotenv": "^16.4.5",
  "express": "^4.19.2",
  "express-rate-limit": "^7.1.5",
  "helmet": "^7.1.0",
  "joi": "^17.13.1",
  "mongoose": "^8.3.4",
  "morgan": "^1.10.0"
}
```

Installed versions observed:

```text
axios@1.17.0
cors@2.8.6
dotenv@16.6.1
express-rate-limit@7.1.5
express@4.22.2
helmet@7.1.0
joi@17.13.3
mongoose@8.24.0
morgan@1.11.0
nodemon@3.1.14
```

## Environment Variables

Exact `project-service/.env.example`:

```env
NODE_ENV=development
PROJECT_PORT=3001
MONGODB_URI=mongodb+srv://username:password@host.mongodb.net/kubeguard?retryWrites=true&w=majority
INTERNAL_SECRET=replace-with-gateway-internal-secret
ENCRYPTION_KEY=change-me-32-character-key-12345
GITHUB_TOKEN=ghp_replace_with_token
GATEWAY_PUBLIC_URL=http://localhost:3000
WATCHER_SERVICE_URL=http://localhost:3002
LOG_LEVEL=info
SERVICE_NAME=project-service
```

## Routes and Actual Logic

### `GET /health`

Returns service status and `db` as `connected` or `disconnected` using `mongoose.connection.readyState`.

### `POST /projects`

1. Validates body with Joi `projectSchema`.
2. Reads `x-user-id`, `x-user-email`, and `x-user-roles`.
3. Checks for existing project with same `githubRepoUrl`, `branch`, `folderPath`.
4. Calls Prometheus runtime info at `{prometheusUrl}/api/v1/status/runtimeinfo` with 5s timeout.
5. If Prometheus fails, sets `prometheusAvailable=false` and adds warning.
6. Generates `webhookSecret`.
7. Encrypts `argocdToken` and `kubernetesToken`.
8. Calls GitHub to register webhook:
   - `POST https://api.github.com/repos/{owner}/{repo}/hooks`
   - URL is `{GATEWAY_PUBLIC_URL}/api/webhook/{projectId}`.
9. If webhook registration fails, project still saves and warning is returned.
10. Saves Project.
11. Returns `201 { project: safeProject, warnings }`.

### `GET /projects`

1. Reads user headers.
2. Admin sees all projects; non-admin sees only `{ createdBy: userId }`.
3. Optional `status` filter.
4. Paginates with `page` and `limit`, max limit 100.
5. Returns safe projects with secret fields removed.

### `GET /projects/:id/status`

1. Fetches project by id and checks ownership unless Admin.
2. Returns project id, name, status, `prometheusAvailable`, `lastEventAt`, and `githubWebhookId`.

### `GET /projects/:id`

Fetches project by id, checks ownership, returns safe project.

### `PUT /projects/:id`

1. Validates body with `updateSchema`.
2. Fetches project by id and checks ownership.
3. If `prometheusUrl` changed, checks Prometheus and records warning if unavailable.
4. Encrypts updated `argocdToken` and/or `kubernetesToken`.
5. Merges fields and saves.
6. Returns safe project and warnings.

### `DELETE /projects/:id`

1. Fetches project by id and checks ownership.
2. Calls GitHub delete webhook if `githubWebhookId` exists.
3. Logs warning if deletion fails.
4. Deletes project.
5. Returns `204`.

### `GET /internal/projects/:id`

1. Requires `x-internal-secret`.
2. Fetches project by id with `+webhookSecret`.
3. Decrypts `argocdToken` and `kubernetesToken`.
4. Returns full project object including secrets needed by internal services.

## Inter-Service Calls

- Project Service calls external GitHub:
  - Register: `POST https://api.github.com/repos/{owner}/{repo}/hooks`
  - Delete: `DELETE https://api.github.com/repos/{owner}/{repo}/hooks/{webhookId}`
  - Headers: `Authorization: Bearer {GITHUB_TOKEN}`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`.
- Project Service calls Prometheus:
  - `GET {prometheusUrl}/api/v1/status/runtimeinfo`
  - No auth headers.
- It does not call other local services despite having `WATCHER_SERVICE_URL` in env.

## Database Models

### `Project`

Collection: `projects`

Fields:

- `name`: String, required, trim, min 1, max 100.
- `createdBy`: String, required.
- `createdByEmail`: String, required.
- `githubRepoUrl`: String, required, must start with `https://github.com/`.
- `branch`: String, required, default `main`.
- `folderPath`: String, required, default `/helm`, must start with `/`.
- `prometheusUrl`: String, required.
- `prometheusAvailable`: Boolean, default `false`.
- `argocdUrl`: String, required.
- `argocdAppName`: String, required.
- `argocdToken`: String, required, encrypted at rest.
- `kubernetesToken`: String, default `null`, encrypted if provided.
- `kubernetesApiUrl`: String, default `null`.
- `webhookSecret`: String, required, `select:false`.
- `githubWebhookId`: Number, default `null`.
- `status`: String enum `active|paused|error`, default `active`.
- `lastEventAt`: Date, default `null`.
- timestamps: `createdAt`, `updatedAt`.

Indexes:

- `{ githubRepoUrl: 1, branch: 1, folderPath: 1 }`, unique.
- `{ createdBy: 1 }`
- `{ status: 1 }`

Instance method:

- `toSafeJSON()` removes `webhookSecret`, `argocdToken`, and `kubernetesToken`.

## Testing Done

- Startup validation was added/confirmed for required env vars.
- `ENCRYPTION_KEY` length validation exists and exits if not exactly 32 characters.
- Prometheus check is intentionally non-blocking for project creation/update.
- GitHub webhook register/delete failures are intentionally warnings, not hard failures.
- Actual end-to-end GitHub webhook registration was not run during this summary pass.

## Known Issues or Workarounds

- `.env.example` includes placeholder `ENCRYPTION_KEY=change-me-32-character-key-12345`; actual runtime requires exactly 32 chars.
- Internal route returns decrypted secrets; this is required for service integration but must be protected carefully by `INTERNAL_SECRET`.

## Docker and Startup

Exact `project-service/Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3001
CMD ["node", "src/index.js"]
```

Startup:

```powershell
cd project-service
npm install
npm start
```

---

# MS3 - Watcher Service

## File Structure

- `watcher-service/.env` - local runtime values; contains secrets and is gitignored.
- `watcher-service/.env.docker` - Docker runtime values; contains real local/Docker values and should not be copied into docs.
- `watcher-service/.env.example` - environment template.
- `watcher-service/Dockerfile` - production Node 20 Alpine container build.
- `watcher-service/package.json` - package manifest and scripts.
- `watcher-service/package-lock.json` - npm lockfile.
- `watcher-service/src/app.js` - Express app, raw webhook mount, JSON routes, error handling.
- `watcher-service/src/index.js` - startup env validation, MongoDB connect, server startup/shutdown.
- `watcher-service/src/middleware/checkInternal.js` - internal secret middleware.
- `watcher-service/src/middleware/checkRole.js` - Admin/DevOps role middleware and user extraction.
- `watcher-service/src/middleware/validate.js` - Joi validation factory.
- `watcher-service/src/models/Event.js` - Mongoose `events` model.
- `watcher-service/src/routes/events.js` - external event list/detail routes.
- `watcher-service/src/routes/internal.js` - internal event fetch/status update routes.
- `watcher-service/src/routes/webhook.js` - GitHub webhook receiver.
- `watcher-service/src/services/analysisClient.js` - triggers MS4 analysis.
- `watcher-service/src/services/argocd.js` - pauses ArgoCD sync.
- `watcher-service/src/services/diffParser.js` - monitored-file filtering and simple semantic change generation.
- `watcher-service/src/services/hmac.js` - GitHub HMAC verification.
- `watcher-service/src/utils/errors.js` - custom errors.
- `watcher-service/src/utils/logger.js` - logger.

## Key Implementation Decisions

- Webhook route uses raw body before JSON parser so HMAC validation works.
- Diff parsing is not a real old-vs-new YAML deep comparison. It classifies added/modified/removed YAML files and infers criticality from file/field names.
- ArgoCD pause runs in background after event response to GitHub.
- Analysis trigger runs in background after event response to GitHub.
- If branch or folder does not match, webhook returns `200` with `monitored:false`.
- Event owner is copied from project using `ownerId || userId || createdBy || createdById || ''`.

## Dependencies

Package manifest dependency ranges:

```json
{
  "axios": "^1.6.8",
  "cors": "^2.8.5",
  "dotenv": "^16.4.5",
  "express": "^4.19.2",
  "express-rate-limit": "^7.2.0",
  "helmet": "^7.1.0",
  "joi": "^17.13.1",
  "js-yaml": "^4.1.0",
  "mongoose": "^8.3.4",
  "morgan": "^1.10.0"
}
```

Installed versions observed:

```text
axios@1.17.0
cors@2.8.6
dotenv@16.6.1
express-rate-limit@7.5.1
express@4.22.2
helmet@7.2.0
joi@17.13.4
js-yaml@4.2.0
mongoose@8.24.0
morgan@1.11.0
nodemon@3.1.14
```

## Environment Variables

Exact `watcher-service/.env.example`:

```env
NODE_ENV=development
WATCHER_PORT=3002
MONGODB_URI=mongodb://localhost:27017/kubeguard
INTERNAL_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
PROJECT_SERVICE_URL=http://localhost:3001
ANALYSIS_SERVICE_URL=http://localhost:3003
LOG_LEVEL=info
SERVICE_NAME=watcher-service
```

## Routes and Actual Logic

### `GET /health`

Returns service status and Mongo connection state.

### `POST /webhook/:projectId`

1. Uses `express.raw({ type:'*/*' })`.
2. Reads `x-hub-signature-256`; missing signature returns `401`.
3. Fetches project from Project Service internal route:
   - `GET {PROJECT_SERVICE_URL}/internal/projects/:projectId`
   - Header `x-internal-secret`.
4. Verifies GitHub HMAC with project `webhookSecret`.
5. Parses raw body as JSON.
6. If payload branch is not `refs/heads/{project.branch}`, returns `200 { monitored:false, message:'Branch not monitored' }`.
7. Collects changed files from all commits.
8. Filters files under project `folderPath`.
9. If no monitored files changed, returns `200 { monitored:false, message:'No monitored files changed' }`.
10. Parses semantic changes using `diffParser`.
11. Starts `pauseArgocdSync(project.argocdUrl, project.argocdToken, project.argocdAppName)`.
12. Creates Event with status `detected`.
13. Responds immediately to GitHub with `200 { message:'Analysis triggered', eventId, monitored:true }`.
14. In `setImmediate`, concurrently:
    - Awaits ArgoCD pause result and writes `argocdPaused/argocdPauseError`.
    - Calls Analysis Service and updates event to `analyzing` if successful.

### `GET /events`

1. Requires role Admin or DevOpsEngineer.
2. Admin sees all events; DevOps sees only `{ projectOwnerId: req.user.id }`.
3. Supports optional `projectId` and `status`.
4. Supports pagination.
5. Returns `{ events, pagination }`.

### `GET /events/:id`

1. Requires Admin or DevOpsEngineer.
2. Fetches event by Mongo id.
3. Non-admin must match `event.projectOwnerId`.
4. Returns `{ event }`.

### `PATCH /internal/events/:id/status`

1. Requires `x-internal-secret`.
2. Validates status enum and optional `reportBlobUrl`.
3. Updates `status`.
4. Sets `analysisStartedAt` when status is `analyzing`.
5. Sets `resolvedAt` when status is `approved` or `rejected`.
6. Saves optional `reportBlobUrl`.
7. Returns `{ event }`.

### `GET /internal/events/:id`

1. Requires `x-internal-secret`.
2. Fetches event by id.
3. Returns `{ event }`.

## Inter-Service Calls

- To Project Service:
  - `GET {PROJECT_SERVICE_URL}/internal/projects/:projectId`
  - Header: `x-internal-secret`.
  - Used to retrieve project config, decrypted ArgoCD token, and webhook secret.
- To Analysis Service:
  - `POST {ANALYSIS_SERVICE_URL}/internal/analyze`
  - Body: `{ eventId, projectId }`
  - Header: `x-internal-secret`.
  - Timeout 10 seconds.
- To ArgoCD:
  - `PATCH {argocdUrl}/api/v1/applications/{appName}`
  - Body `{ spec: { syncPolicy: null } }`
  - Header `Authorization: Bearer {argocdToken}`
  - Timeout 5 seconds.
  - Errors are logged and returned as `{ success:false, error }`, not thrown.

## Database Models

### `Event`

Collection: `events`

Fields:

- `projectId`: ObjectId ref `Project`, required.
- `projectName`: String, required.
- `projectOwnerId`: String, default `''`.
- `commitSha`: String, required.
- `commitMessage`: String, default `''`.
- `commitUrl`: String, default `''`.
- `author`: String, default `''`.
- `authorEmail`: String, default `''`.
- `changedFiles`: [String], default `[]`.
- `monitoredChangedFiles`: [String], default `[]`.
- `semanticChanges`: array of:
  - `file`: String, default `''`
  - `fieldPath`: String, default `''`
  - `oldValue`: String, default `''`
  - `newValue`: String, default `''`
  - `changeType`: enum `increase|decrease|added|removed|modified`, required
  - `isCriticalField`: Boolean, default `false`
- `rawDiff`: String, default `''`.
- `status`: enum `detected|analyzing|pending_approval|approved|rejected|error`, default `detected`.
- `argocdPaused`: Boolean, default `false`.
- `argocdPauseError`: String, default `''`.
- `reportBlobUrl`: String, default `''`.
- `detectedAt`: Date, default Date.now.
- `analysisStartedAt`: Date, default `null`.
- `resolvedAt`: Date, default `null`.
- timestamps enabled.

Indexes:

- `{ projectId: 1 }`
- `{ status: 1 }`
- `{ detectedAt: -1 }`
- `{ projectId: 1, detectedAt: -1 }`

## Testing Done

- Raw webhook body design was verified by code inspection and earlier route construction.
- HMAC helper uses `crypto.timingSafeEqual`; it returns false if signature/body/secret missing or buffer lengths differ.
- Full webhook smoke tests require a real project with webhookSecret and were not rerun in this summary pass.

## Known Issues or Workarounds

- Semantic parsing is simplified and does not perform old/new YAML deep object comparison as the amendment prefers.
- `filterMonitoredFiles` strips leading `/`; works with `folderPath` like `/helm` and changed file `helm/values.yaml`.
- ArgoCD pause is best-effort; event proceeds even if pause fails.

## Docker and Startup

Exact `watcher-service/Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3002
CMD ["node", "src/index.js"]
```

Startup:

```powershell
cd watcher-service
npm install
npm start
```

---

# MS4 - Analysis Service

## File Structure

- `analysis-service/.env` - local runtime values; contains secrets and is gitignored.
- `analysis-service/.env.docker` - Docker runtime values; contains real local/Docker values and should not be copied into docs.
- `analysis-service/.env.example` - environment template.
- `analysis-service/Dockerfile` - production Node 20 Alpine container build.
- `analysis-service/package.json` - package manifest and scripts.
- `analysis-service/package-lock.json` - npm lockfile.
- `analysis-service/src/app.js` - Express setup, health, routes, error handling.
- `analysis-service/src/index.js` - dotenv first, env validation, DB connect, server startup/shutdown.
- `analysis-service/src/middleware/checkInternal.js` - validates `x-internal-secret`.
- `analysis-service/src/middleware/checkRole.js` - user header parsing and auth header checks for report routes.
- `analysis-service/src/middleware/validate.js` - Joi validation factory.
- `analysis-service/src/models/Report.js` - Mongoose report metadata model.
- `analysis-service/src/routes/internal.js` - internal analysis trigger, internal report fetch, internal report decision update.
- `analysis-service/src/routes/reports.js` - external report list/detail routes.
- `analysis-service/src/services/aiClient.js` - OpenAI/Groq-compatible AI request and fallback parser.
- `analysis-service/src/services/blobStorage.js` - Azure Blob upload/download and SAS URL generation.
- `analysis-service/src/services/prometheus.js` - Prometheus live and historical metric queries.
- `analysis-service/src/services/serviceBus.js` - Azure Service Bus publisher.
- `analysis-service/src/utils/errors.js` - custom errors.
- `analysis-service/src/utils/logger.js` - logger.
- `analysis-service/src/utils/promptBuilder.js` - AI prompt and change summary builder.

## Key Implementation Decisions

- Analysis route returns `202` before work and starts background analysis with `setImmediate`.
- Prometheus failure never crashes analysis; unavailable metrics become `{ available:false }`.
- AI failure never crashes analysis; fallback report is medium risk with manual review guidance.
- Blob upload failure never crashes analysis; metadata is still saved with `reportBlobUrl:null`.
- Service Bus publish failure never crashes analysis.
- Risk score is string enum `low|medium|high|critical`, not numeric.
- Reports metadata is stored in MongoDB `reports`; full report JSON is stored in Azure Blob.
- Internal route `PATCH /internal/reports/:eventId/decision` was added for MS5.
- `GET /reports/:eventId` merges metadata decision fields over full blob report if blob content exists.

## Dependencies

Package manifest dependency ranges:

```json
{
  "@azure/service-bus": "^7.9.0",
  "@azure/storage-blob": "^12.17.0",
  "axios": "^1.6.2",
  "cors": "^2.8.5",
  "dotenv": "^16.3.1",
  "express": "^4.18.2",
  "express-rate-limit": "^7.1.5",
  "helmet": "^7.1.0",
  "joi": "^17.11.0",
  "mongoose": "^8.0.3",
  "morgan": "^1.10.0",
  "uuid": "^9.0.0"
}
```

Installed versions observed:

```text
@azure/service-bus@7.9.5
@azure/storage-blob@12.32.0
axios@1.17.0
cors@2.8.6
dotenv@16.6.1
express-rate-limit@7.5.1
express@4.22.2
helmet@7.2.0
joi@17.13.4
mongoose@8.24.0
morgan@1.11.0
uuid@9.0.1
nodemon@3.1.14
```

## Environment Variables

Exact `analysis-service/.env.example`:

```env
NODE_ENV=development
ANALYSIS_PORT=3003
MONGODB_URI=mongodb://localhost:27017/kubeguard
INTERNAL_SECRET=replace-with-64-char-random-string

AI_API_URL=https://api.groq.com/openai/v1/chat/completions
AI_API_KEY=replace-with-ai-api-key
AI_MODEL=llama3-8b-8192

AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=youraccount;AccountKey=yourkey;EndpointSuffix=core.windows.net
AZURE_STORAGE_CONTAINER=documents

SERVICE_BUS_CONNECTION_STRING=Endpoint=sb://your-namespace.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=yourkey
SERVICE_BUS_QUEUE=report-ready

PROJECT_SERVICE_URL=http://localhost:3001
WATCHER_SERVICE_URL=http://localhost:3002
LOG_LEVEL=info
SERVICE_NAME=analysis-service
```

## Routes and Actual Logic

### `GET /health`

Returns service status and Mongo DB connection state.

### `POST /internal/analyze`

1. Requires `x-internal-secret`.
2. Validates body `{ eventId, projectId }`.
3. Immediately returns `202 { message:'Analysis started', eventId }`.
4. In `setImmediate`, calls `runAnalysis(eventId, projectId)`.
5. `runAnalysis`:
   - PATCHes Watcher event status to `analyzing`.
   - Fetches event from Watcher.
   - Fetches project from Project Service.
   - If fetch event/project fails, logs and stops; does not currently mark event `error` in that fetch-failure branch.
   - Checks `project.prometheusUrl && project.prometheusAvailable`.
   - Queries live and historical metrics if available; otherwise uses `{ available:false }`.
   - Builds AI prompt.
   - Calls AI client.
   - Builds full report object with reportId, metrics, semantic changes, AI fields, decision placeholders.
   - Uploads full report to Blob path `{projectId}/{eventId}/report.json`.
   - Saves/upserts metadata in MongoDB.
   - Publishes Service Bus `report-ready` message.
   - PATCHes Watcher event status to `pending_approval` with `reportBlobUrl`.
   - On uncaught error, logs and attempts to set event status `error`.

### `GET /internal/reports/:eventId`

1. Requires `x-internal-secret`.
2. Finds metadata by eventId.
3. Downloads full report JSON from Blob using metadata `projectId` and `eventId`.
4. Returns full report if blob exists, else metadata.

### `PATCH /internal/reports/:eventId/decision`

1. Requires `x-internal-secret`.
2. Validates body:
   - `adminDecision`: `approved` or `rejected`, required.
   - `decidedBy`, `decidedByEmail`, `decisionNote`: optional/null/empty allowed.
   - `decidedAt`: date, defaults to current date.
3. Updates Report metadata fields.
4. Returns `{ report: updatedReport }` or `404`.

### `GET /reports`

1. Requires `x-user-id` and `x-user-roles`.
2. Admin sees all reports.
3. DevOpsEngineer sees only reports where `ownerId` equals `x-user-id`.
4. Other roles get an impossible filter.
5. Supports filters `projectId`, `riskScore`, `recommendation`, `decision`.
6. Supports pagination.
7. Returns `{ reports, pagination }`.

### `GET /reports/:eventId`

1. Requires user headers.
2. Applies same ownership filtering.
3. Finds metadata by eventId.
4. Downloads full report JSON from Blob.
5. If full report exists, merges metadata decision fields over it.
6. If blob missing/unavailable, returns metadata only.

## Inter-Service Calls

- To Watcher:
  - `GET {WATCHER_SERVICE_URL}/internal/events/:eventId`
  - `PATCH {WATCHER_SERVICE_URL}/internal/events/:eventId/status`
  - Header: `x-internal-secret`.
- To Project Service:
  - `GET {PROJECT_SERVICE_URL}/internal/projects/:projectId`
  - Header: `x-internal-secret`.
- To AI provider:
  - `POST {AI_API_URL}`
  - Header `Authorization: Bearer {AI_API_KEY}`
  - OpenAI-compatible body with model, max_tokens, messages, temperature.
- To Prometheus:
  - `GET {prometheusUrl}/api/v1/query?query=...`
  - No auth headers.
- To Azure Blob:
  - Uses connection string and container from env.
  - Uploads `{projectId}/{eventId}/report.json`.
  - Generates read SAS for 7 days when AccountName/AccountKey parse successfully.
- To Azure Service Bus:
  - Queue from `SERVICE_BUS_QUEUE`.
  - Message body includes `{ eventId, projectId, projectName, riskScore, changesSummary, reportBlobUrl, adminEmails: [] }`.

## Database Models

### `Report`

Collection: `reports`

Fields:

- `reportId`: String, required, unique.
- `eventId`: String, required.
- `projectId`: String, required.
- `projectName`: String.
- `riskScore`: String enum `low|medium|high|critical`, required.
- `recommendation`: String enum `approve|approve_with_caution|reject`, required.
- `reportBlobPath`: String.
- `reportBlobUrl`: String.
- `generatedAt`: Date, default Date.now.
- `adminDecision`: String enum `approved|rejected|null`, default `null`.
- `decidedAt`: Date.
- `decidedBy`: String.
- `decidedByEmail`: String.
- `decisionNote`: String.
- `changesSummary`: String.
- `ownerId`: String.
- timestamps enabled.

Indexes:

- `{ projectId: 1 }`
- `{ riskScore: 1 }`
- `{ generatedAt: -1 }`
- `{ adminDecision: 1 }`
- `{ eventId: 1 }`, unique.

## Testing Done

- `npm.cmd install` completed after initial PowerShell `npm.ps1` execution policy issue. Fix/workaround: use `npm.cmd install`.
- `node --check` passed for all MS4 source files.
- `node -e "require('dotenv').config(); require('./src/app'); console.log('app loaded')"` printed `app loaded`.
- Prometheus unreachable test:
  - Command called `queryLiveMetrics('http://127.0.0.1:1','demo')` and `queryHistoricalPeak(...)`.
  - Actual result returned `available:false` with null metric fields.
  - This confirmed no crash on Prometheus failure.
- AI failure test:
  - First command had PowerShell/Node quoting error: `SyntaxError: Unexpected token '='`.
  - Reran with a plain Node expression setting `process.env.AI_API_URL='http://127.0.0.1:1'`.
  - Actual result was fallback report:
    - `riskScore:"medium"`
    - `riskReason:"AI unavailable - manual review required"`
    - `recommendation:"approve_with_caution"`
  - Log included `AI API unavailable, using fallback report: connect ECONNREFUSED 127.0.0.1:1`.
- Full 15 end-to-end smoke tests were not run because they require MS1-MS3, MongoDB, Azure Blob, Azure Service Bus, and a real pending event to be running together.

## Known Issues or Workarounds

- Fetch event/project failure branch logs and returns without setting event status `error`.
- Real Azure Blob and Service Bus were not end-to-end verified in this pass.
- Service Bus publish intentionally returns failure object and logs instead of throwing.
- Local `.env` uses real secrets and must remain ignored.

## Docker and Startup

Exact `analysis-service/Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

EXPOSE 3003

CMD ["node", "src/index.js"]
```

Startup:

```powershell
cd analysis-service
npm install
npm start
```

---

# MS5 - Notification Service

## File Structure

- `notification-service/.env` - local runtime values; contains secrets and is gitignored.
- `notification-service/.env.docker` - Docker runtime values; contains real local/Docker values and should not be copied into docs.
- `notification-service/.env.example` - environment template.
- `notification-service/Dockerfile` - production Node 20 Alpine container build.
- `notification-service/package.json` - package manifest and scripts.
- `notification-service/package-lock.json` - npm lockfile.
- `notification-service/src/app.js` - Express setup, health, notify route mount, error handling.
- `notification-service/src/index.js` - dotenv first, env validation, DB connect, starts Service Bus consumer and HTTP server.
- `notification-service/src/middleware/checkInternal.js` - internal secret middleware; currently not mounted by any MS5 route.
- `notification-service/src/middleware/checkRole.js` - parses roles and requires Admin for dashboard routes.
- `notification-service/src/models/Decision.js` - Mongoose model for `decisions`.
- `notification-service/src/routes/notify.js` - email-link and dashboard decision routes plus decision listing.
- `notification-service/src/services/approvalToken.js` - HMAC approve/reject token generate/verify.
- `notification-service/src/services/argocd.js` - resumes ArgoCD sync.
- `notification-service/src/services/emailService.js` - console email provider and HTML email builder.
- `notification-service/src/services/serviceBusConsumer.js` - Azure Service Bus report-ready consumer.
- `notification-service/src/utils/errors.js` - custom errors.
- `notification-service/src/utils/logger.js` - logger.

## Key Implementation Decisions

- MS5 is a standalone Express service, not an Azure Function.
- `EMAIL_PROVIDER=console` logs the full email content and links to stdout.
- SendGrid is not implemented; `EMAIL_PROVIDER=sendgrid` returns `{ success:false, error:'SendGrid not configured' }`.
- The Service Bus consumer starts during service startup after MongoDB connects.
- Consumer errors do not crash the process; reconnect is scheduled after 30 seconds.
- Decisions are unique per `eventId`; duplicates return `409 ConflictError`.
- ArgoCD resume is best-effort and never thrown from `resumeArgocdSync`.
- Current `updateReportDecision` in `routes/notify.js` contains temporary `[DEBUG]` console logs for URL, payload, secret presence, response/failure. These should be removed before production.

## Dependencies

Package manifest dependency ranges:

```json
{
  "@azure/service-bus": "^7.9.0",
  "axios": "^1.6.2",
  "cors": "^2.8.5",
  "dotenv": "^16.3.1",
  "express": "^4.18.2",
  "express-rate-limit": "^7.1.5",
  "helmet": "^7.1.0",
  "joi": "^17.11.0",
  "mongoose": "^8.0.3",
  "morgan": "^1.10.0"
}
```

Installed versions observed:

```text
@azure/service-bus@7.9.5
axios@1.18.0
cors@2.8.6
dotenv@16.6.1
express-rate-limit@7.5.1
express@4.22.2
helmet@7.2.0
joi@17.13.4
mongoose@8.24.0
morgan@1.11.0
nodemon@3.1.14
```

## Environment Variables

Exact `notification-service/.env.example`:

```env
NODE_ENV=development
NOTIFICATION_PORT=3004
MONGODB_URI=mongodb://localhost:27017/kubeguard
INTERNAL_SECRET=replace-with-64-char-random-string
NOTIFICATION_SECRET=replace-with-notification-signing-secret
SERVICE_BUS_CONNECTION_STRING=Endpoint=sb://your-namespace.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=yourkey
SERVICE_BUS_QUEUE=report-ready
ANALYSIS_SERVICE_URL=http://localhost:3003
WATCHER_SERVICE_URL=http://localhost:3002
PROJECT_SERVICE_URL=http://localhost:3001
FRONTEND_URL=http://localhost:5173
GATEWAY_URL=http://localhost:3000
EMAIL_FROM=noreply@kubeguard.com
EMAIL_PROVIDER=console
ADMIN_EMAILS=
LOG_LEVEL=info
SERVICE_NAME=notification-service
```

## Routes and Actual Logic

### `GET /health`

Returns service status and Mongo DB connection state.

### `GET /notify/decide?token=...`

1. No Entra auth required when called directly on MS5.
2. Missing token throws `ValidationAppError('Token is required')`, returned as 400.
3. Verifies HMAC token with `NOTIFICATION_SECRET`.
4. Invalid/expired token throws `UnauthorizedError('Invalid token')`, returned as 401.
5. Checks duplicate decision by eventId; if found redirects to `{FRONTEND_URL}/projects/already-decided`.
6. Calls `recordDecision` with actor `{ id:'email-link', email:'via-email' }` and source `email`.
7. Redirects to `{FRONTEND_URL}/events/{eventId}?decided=true&decision={decision}`.

### `POST /notify/decide`

1. Requires `x-user-roles` to contain `Admin`.
2. Validates body:
   - `eventId`: required string.
   - `decision`: `approved` or `rejected`.
   - `note`: optional.
3. Calls `recordDecision` with actor from `x-user-id` and `x-user-email`, source `dashboard`.
4. Returns `{ decision, eventId, argocdResumed }`.

### `GET /notify/decisions`

1. Requires Admin role.
2. Supports optional filters `projectId`, `decision`.
3. Supports `page` and `limit`, max 100.
4. Returns `{ decisions, pagination }`.

### `recordDecision` internal flow

1. Checks duplicate Decision by `eventId`.
2. Fetches report from MS4 internal route.
3. Reads `projectId` from report.
4. If decision is `approved`, fetches project from MS2 and calls ArgoCD resume.
5. Creates Decision document.
6. Updates Watcher event status to `approved` or `rejected`.
7. Updates Analysis report metadata via MS4 PATCH decision route.
8. Returns saved decision.

## Inter-Service Calls

- To Analysis Service:
  - `GET {ANALYSIS_SERVICE_URL}/internal/reports/:eventId`
  - `PATCH {ANALYSIS_SERVICE_URL}/internal/reports/:eventId/decision`
  - Header: `x-internal-secret`.
  - PATCH body: `{ adminDecision, decidedBy, decidedByEmail, decisionNote, decidedAt }`.
- To Project Service:
  - `GET {PROJECT_SERVICE_URL}/internal/projects/:projectId`
  - Header: `x-internal-secret`.
  - Used for ArgoCD connection details and email project display data.
- To Watcher Service:
  - `PATCH {WATCHER_SERVICE_URL}/internal/events/:eventId/status`
  - Header: `x-internal-secret`.
  - Body: `{ status:'approved' }` or `{ status:'rejected' }`.
- To ArgoCD:
  - `POST {argocdUrl}/api/v1/applications/{encodeURIComponent(appName)}/sync`
  - Body `{ prune:false, dryRun:false }`
  - Header `Authorization: Bearer {argocdToken}`
  - Timeout 5 seconds.
- To Azure Service Bus:
  - Creates receiver for queue `SERVICE_BUS_QUEUE`, receive mode `peekLock`.
  - On message, fetches full report and project, then sends console email.

## Database Models

### `Decision`

Collection: `decisions`

Fields:

- `eventId`: String, required, unique.
- `projectId`: String, required.
- `reportBlobUrl`: String.
- `decision`: String enum `approved|rejected`, required.
- `decidedBy`: String, required.
- `decidedByEmail`: String.
- `decisionNote`: String.
- `decidedAt`: Date, default Date.now.
- `argocdResumed`: Boolean, default `false`.
- `argocdResumeError`: String.
- `emailSentAt`: Date.
- `emailRecipients`: [String].
- `source`: String enum `email|dashboard`, default `dashboard`.
- `createdAt`: Date, default Date.now.
- Schema option `{ timestamps:false }`.

Indexes:

- Unique index comes from `eventId: { unique:true }`.
- `{ projectId: 1 }`
- `{ decidedAt: -1 }`
- `{ decidedBy: 1 }`

## Testing Done

- `npm.cmd install` initially timed out in the sandbox. It was rerun with escalated approval and completed:
  - `added 209 packages`
  - `found 0 vulnerabilities`
- `node --check` passed for all MS5 source files.
- `node -e "require('dotenv').config(); require('./src/app'); console.log('notification app loaded')"` loaded successfully.
- Initial app-load check produced Mongoose warning:
  - `Warning: Duplicate schema index on {"eventId":1} found...`
  - Fix applied: removed explicit `decisionSchema.index({ eventId: 1 }, { unique: true })` because `eventId` already has `unique:true` on the field.
  - Rerun loaded cleanly.
- Approval token round-trip test:
  - Generated token for `evt123`/`approved`.
  - Verified token returned `{"eventId":"evt123","decision":"approved"}`.
- Full 12 MS5 smoke tests were not run because they require all other services, MongoDB, a real pending approval event, and Service Bus integration.

## Known Issues or Workarounds

- Temporary `[DEBUG]` logs remain in `notification-service/src/routes/notify.js` inside `updateReportDecision`.
- Email link through Gateway likely fails because Gateway protects all `/api/notify` routes with Admin token validation. Direct MS5 email link route works.
- `checkInternal.js` exists but is not currently used by any MS5 route.
- Service Bus message completion behavior relies on Azure SDK auto-complete defaults; code does not explicitly call `completeMessage`.
- `emailSentAt` and `emailRecipients` exist on Decision model but are not currently populated when emails are sent; email sends are triggered by Service Bus before decisions are made.

## Docker and Startup

Exact `notification-service/Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

EXPOSE 3004

CMD ["node", "src/index.js"]
```

Startup:

```powershell
cd notification-service
npm install
npm start
```

---

# Cross-Service Integration Notes

## Contract Mismatches Found

1. **Gateway vs Notification email links**
   - Master flow says email links hit `GET /api/notify/decide?token=...` without Entra auth and use signed token only.
   - Current Gateway applies `validateToken`, `extractHeaders`, and `requireRole('Admin')` before proxying all `/api/notify/*`.
   - Effect: signed email links through Gateway likely return `401`/`403` unless the browser also sends a valid Admin Entra token.
   - Workaround: call MS5 directly at `http://localhost:3004/notify/decide?token=...` or change Gateway to exempt `GET /api/notify/decide`.

2. **Watcher semantic diff vs amendment**
   - Amendment prefers YAML old/new deep object comparison.
   - Current Watcher only classifies changed YAML files from webhook commit metadata; it does not fetch old/new file contents.

3. **Analysis report decision update was missing**
   - MS5 needs to PATCH report admin decision in MS4.
   - Added `PATCH /internal/reports/:eventId/decision` to `analysis-service/src/routes/internal.js`.
   - Added `decidedBy`, `decidedByEmail`, `decisionNote` to MS4 Report model.

4. **MS5 Service Bus completion**
   - Spec says complete message explicitly.
   - Current code uses `receiver.subscribe` without manual settlement; Azure SDK defaults may auto-complete successful `processMessage`.

5. **Project ownership field names**
   - Project uses `createdBy`; Watcher/Analysis/Reports need owner id.
   - Watcher maps owner from `ownerId || userId || createdBy || createdById || ''`.
   - Analysis stores `ownerId` from `project.ownerId || project.createdBy || project.userId || project.createdByUserId || project.owner?.id`.

## Header, URL, and Data Format Adjustments

- Gateway injects:
  - `x-user-id`
  - `x-user-email`
  - `x-user-name`
  - `x-user-roles`
  - `x-request-id`
- Internal calls use:
  - Header `x-internal-secret: {INTERNAL_SECRET}`.
- Project internal route returns `{ project }`.
- Watcher internal event route returns `{ event }`.
- Analysis internal report route returns full report object directly if Blob exists, else metadata directly. Some callers defensively accept `response.data.report || response.data`.
- MS4 Service Bus message body format:
  - `{ eventId, projectId, projectName, riskScore, changesSummary, reportBlobUrl, adminEmails: [] }`
- MS5 decision PATCH to MS4 format:
  - `{ adminDecision, decidedBy, decidedByEmail, decisionNote, decidedAt }`

## Local Startup Order

Recommended local startup order:

1. MongoDB on port 27017.
2. MS2 Project Service on 3001.
3. MS3 Watcher Service on 3002.
4. MS4 Analysis Service on 3003.
5. MS5 Notification Service on 3004.
6. MS1 Gateway on 3000.
7. Frontend on 5173 if testing browser flows.

Reasoning:

- Project, Watcher, Analysis, Notification all require MongoDB.
- Watcher calls Project and Analysis.
- Analysis calls Project and Watcher.
- Notification calls Analysis, Project, and Watcher.
- Gateway should start after downstream services for clean proxy behavior.

## Docker Compose Notes

Root `docker-compose.yml` includes:

- `mongodb` with healthcheck.
- `gateway`, depends on all four service containers.
- `project-service`, `watcher-service`, `analysis-service`, `notification-service`, each depends on healthy MongoDB.
- Services use `.env.docker` files.
- Docker service URLs use container names:
  - `http://project-service:3001`
  - `http://watcher-service:3002`
  - `http://analysis-service:3003`
  - `http://notification-service:3004`

Known Docker concerns:

- `.env.docker` files contain real secrets and should not be committed/shared casually.
- Gateway depends on services but not on their healthchecks; it may start before downstream HTTP servers are fully ready.
- Notification Service starts Service Bus consumer at startup; if Azure Service Bus is unreachable, it logs failure and schedules reconnect rather than crashing.

## Verification Summary

Verified in this environment:

- MS4 `npm.cmd install` completed after `npm.ps1` execution policy workaround.
- MS4 all source files passed `node --check`.
- MS4 app module loaded.
- MS4 unreachable Prometheus returned safe `available:false`.
- MS4 AI API failure returned fallback medium-risk report.
- MS5 `npm.cmd install` completed after sandbox timeout rerun with approval.
- MS5 all source files passed `node --check`.
- MS5 app module loaded.
- MS5 approval token generate/verify passed.
- MS5 duplicate index warning was fixed.

Not fully run in this summary pass:

- End-to-end MS1 Entra token validation with real fresh token.
- End-to-end GitHub webhook registration and webhook event creation.
- End-to-end Azure Blob upload/download with real report.
- End-to-end Azure Service Bus publish/consume.
- Full approval flow through Gateway because of the `/api/notify` auth mismatch.

