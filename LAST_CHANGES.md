# Last Changes

This file documents exactly what was done during the previous full audit/fix prompt.

Commit created and pushed:

```text
1c1ed2e fix: full audit and endpoint fixes
```

Repository root:

```text
C:\Users\Admin\Desktop\New folder (2)\KubeGuard
```

## Files Changed

### `C:\Users\Admin\Desktop\New folder (2)\KubeGuard\gateway\src\app.js`

Purpose of change:

- Added explicit proxy timeouts of at least `60000ms` to the shared Gateway proxy factory.
- Added `app.set('trust proxy', 1)` so `express-rate-limit` works correctly behind a proxy using `X-Forwarded-For`.
- Added an unauthenticated Gateway route for signed notification email decisions: `GET /api/notify/decide`.
- Left all other `/api/notify/*` routes behind normal token validation and Admin role protection.

Before:

```js
const createProxy = (target, options = {}) =>
  createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: options.pathRewrite || { '^/api': '' },
    onProxyReq: (proxyReq, req) => {
      addRequestId(proxyReq, req)
```

After:

```js
const createProxy = (target, options = {}) =>
  createProxyMiddleware({
    target,
    changeOrigin: true,
    proxyTimeout: options.proxyTimeout || 60000,
    timeout: options.timeout || 60000,
    pathRewrite: options.pathRewrite || { '^/api': '' },
    onProxyReq: (proxyReq, req) => {
      addRequestId(proxyReq, req)
```

Before:

```js
app.disable('x-powered-by')
app.use(helmet())
```

After:

```js
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(helmet())
```

Before:

```js
app.post(
  '/api/webhook/:projectId',
  webhookLimiter,
  express.raw({ type: '*/*' }),
  createProxy(process.env.WATCHER_SERVICE_URL, {
    pathRewrite: { '^/api': '' },
    onProxyReq: (proxyReq, req) => {
      if (Buffer.isBuffer(req.body)) {
        proxyReq.setHeader('content-length', req.body.length)
        proxyReq.write(req.body)
      }
    },
  })
)

app.use(generalLimiter)
app.use(validateToken)
```

After:

```js
app.post(
  '/api/webhook/:projectId',
  webhookLimiter,
  express.raw({ type: '*/*' }),
  createProxy(process.env.WATCHER_SERVICE_URL, {
    pathRewrite: { '^/api': '' },
    onProxyReq: (proxyReq, req) => {
      if (Buffer.isBuffer(req.body)) {
        proxyReq.setHeader('content-length', req.body.length)
        proxyReq.write(req.body)
      }
    },
  })
)

app.get(
  '/api/notify/decide',
  generalLimiter,
  createProxy(process.env.NOTIFICATION_SERVICE_URL)
)

app.use(generalLimiter)
app.use(validateToken)
```

### `C:\Users\Admin\Desktop\New folder (2)\KubeGuard\project-service\src\routes\projects.js`

Purpose of change:

- Made `POST /projects` respond quickly by saving the project first and moving Prometheus availability checking into a background task.
- Reduced the Prometheus availability probe timeout from `5000ms` to `3000ms`.
- Added `refreshPrometheusAvailability(projectId, prometheusUrl)`.
- Kept GitHub webhook registration in the existing background path.
- Confirmed `kubernetesToken` remains optional and is only encrypted when provided.

Before:

```js
async function checkPrometheus(prometheusUrl) {
  try {
    await axios.get(`${prometheusUrl}/api/v1/status/runtimeinfo`, { timeout: 5000 })
    return true
  } catch (error) {
    return false
  }
}
```

After:

```js
async function checkPrometheus(prometheusUrl) {
  try {
    await axios.get(`${prometheusUrl}/api/v1/status/runtimeinfo`, { timeout: 3000 })
    return true
  } catch (error) {
    return false
  }
}

async function refreshPrometheusAvailability(projectId, prometheusUrl) {
  const prometheusAvailable = await checkPrometheus(prometheusUrl)
  await Project.findByIdAndUpdate(projectId, { prometheusAvailable })
  return prometheusAvailable
}
```

Before:

```js
    const prometheusAvailable = await checkPrometheus(req.body.prometheusUrl)
    if (!prometheusAvailable) {
      warnings.push('Prometheus check failed. Project was still saved.')
    }

    const webhookSecret = crypto.randomBytes(32).toString('hex')
    const project = new Project({
      ...req.body,
      createdBy: userId,
      createdByEmail: email,
      prometheusAvailable,
      argocdToken: encrypt(req.body.argocdToken),
      kubernetesToken: req.body.kubernetesToken ? encrypt(req.body.kubernetesToken) : null,
      webhookSecret,
    })

    // Save project immediately and respond — do not block on webhook registration
    await project.save()
    res.status(201).json({ project: project.toSafeJSON(), warnings })

    // Register webhook in background (non-blocking)
    registerWebhook(project.githubRepoUrl, project._id.toString(), webhookSecret)
```

After:

```js
    const webhookSecret = crypto.randomBytes(32).toString('hex')
    const project = new Project({
      ...req.body,
      createdBy: userId,
      createdByEmail: email,
      prometheusAvailable: false,
      argocdToken: encrypt(req.body.argocdToken),
      kubernetesToken: req.body.kubernetesToken ? encrypt(req.body.kubernetesToken) : null,
      webhookSecret,
    })

    warnings.push('Prometheus availability check is running in the background.')

    // Save project immediately and respond; do not block on external dependency checks.
    await project.save()
    res.status(201).json({ project: project.toSafeJSON(), warnings })

    refreshPrometheusAvailability(project._id, req.body.prometheusUrl)
      .then((prometheusAvailable) => {
        logger.info(`Prometheus availability for project ${project._id}: ${prometheusAvailable}`)
      })
      .catch((err) => {
        logger.warn(`Prometheus availability check failed for project ${project._id}: ${err.message}`)
      })

    // Register webhook in background (non-blocking)
    registerWebhook(project.githubRepoUrl, project._id.toString(), webhookSecret)
```

Before:

```js
module.exports = router
```

After:

```js
module.exports = router
```

Note: the final line content did not change; only the missing trailing newline was fixed.

### `C:\Users\Admin\Desktop\New folder (2)\KubeGuard\notification-service\src\routes\notify.js`

Purpose of change:

- Removed temporary `[DEBUG]` console logging from the Analysis Service decision update call.
- Preserved the same PATCH endpoint, payload, headers, and timeout behavior.

Before:

```js
async function updateReportDecision(eventId, payload) {
  const url = `${trimTrailingSlash(process.env.ANALYSIS_SERVICE_URL)}/internal/reports/${eventId}/decision`;
  console.log('[DEBUG] updateReportDecision URL:', url);
  console.log('[DEBUG] payload:', JSON.stringify(payload));
  console.log('[DEBUG] secret set:', !!process.env.INTERNAL_SECRET);
  try {
    const resp = await axios.patch(url, payload, { headers: internalHeaders(), timeout: 15000 });
    console.log('[DEBUG] response status:', resp.status);
    return resp;
  } catch (err) {
    console.error('[DEBUG] PATCH failed:', err.message, err.response?.status, JSON.stringify(err.response?.data));
    throw err;
  }
}
```

After:

```js
async function updateReportDecision(eventId, payload) {
  return axios.patch(
    `${trimTrailingSlash(process.env.ANALYSIS_SERVICE_URL)}/internal/reports/${eventId}/decision`,
    payload,
    {
      headers: internalHeaders(),
      timeout: 15000,
    }
  )
}
```

### `C:\Users\Admin\Desktop\New folder (2)\KubeGuard\notification-service\src\services\serviceBusConsumer.js`

Purpose of change:

- Made Service Bus message settlement explicit.
- Added `completeMessage(message)` in a `finally` block after processing attempts.
- Disabled SDK auto-complete by passing `{ autoCompleteMessages: false }` to `receiver.subscribe`.

Before:

```js
async function processMessage(message) {
  try {
    const body = message.body
    logger.info(`Received report-ready message for event: ${body.eventId}`)

    const report = await fetchReport(body.eventId)
    const project = await fetchProject(report.projectId || body.projectId)
    const adminEmails = getAdminEmails(body)

    if (!adminEmails.length) {
      logger.warn('No admin emails configured; skipping notification email')
      return
    }

    const emailResult = await sendApprovalEmail({ report, project, adminEmails })
    if (!emailResult.success) {
      logger.warn(`Approval email failed: ${emailResult.error}`)
    }

    logger.info(`Processed report-ready message for event: ${body.eventId}`)
  } catch (error) {
    logger.error(`Failed to process report-ready message: ${error.message}`)
  }
}
```

After:

```js
async function processMessage(message) {
  try {
    const body = message.body
    logger.info(`Received report-ready message for event: ${body.eventId}`)

    const report = await fetchReport(body.eventId)
    const project = await fetchProject(report.projectId || body.projectId)
    const adminEmails = getAdminEmails(body)

    if (!adminEmails.length) {
      logger.warn('No admin emails configured; skipping notification email')
      return
    }

    const emailResult = await sendApprovalEmail({ report, project, adminEmails })
    if (!emailResult.success) {
      logger.warn(`Approval email failed: ${emailResult.error}`)
    }

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
```

Before:

```js
    receiver.subscribe({
      processMessage,
      processError: async (error) => {
        logger.error(`Service Bus consumer error: ${error.message}`)
        scheduleReconnect()
      },
    })
```

After:

```js
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
```

### `C:\Users\Admin\Desktop\New folder (2)\KubeGuard\frontend\src\services\api.js`

Purpose of change:

- Added explicit frontend handling for `504` timeout responses.
- Added explicit frontend handling for generic `5xx` server errors.
- Preserved the original Axios response object on normalized errors.
- Fixed the dashboard approval payload to send `eventId`, which matches Notification Service `POST /notify/decide`.

Before:

```js
    if (error.response.status === 403) {
      const normalizedError = new Error(error.response.data?.message || 'Forbidden')
      normalizedError.status = 403
      normalizedError.response = error.response
      throw normalizedError
    }

    if (error.response.status === 401) {
```

After:

```js
    if (error.response.status === 403) {
      const normalizedError = new Error(error.response.data?.message || 'Forbidden')
      normalizedError.status = 403
      normalizedError.response = error.response
      throw normalizedError
    }

    const serverMessage = error.response.data?.message
    if (error.response.status === 504) {
      const timeoutError = new Error(serverMessage || 'The server timed out while processing the request. Please try again.')
      timeoutError.status = 504
      timeoutError.response = error.response
      throw timeoutError
    }

    if (error.response.status >= 500) {
      const serverError = new Error(serverMessage || 'Server error. Please try again.')
      serverError.status = error.response.status
      serverError.response = error.response
      throw serverError
    }

    if (error.response.status === 401) {
```

Before:

```js
export const decideReport = (id, data) => api.post('/notify/decide', { reportId: id, ...data })
```

After:

```js
export const decideReport = (eventId, data) => api.post('/notify/decide', { eventId, ...data })
```

### `C:\Users\Admin\Desktop\New folder (2)\KubeGuard\frontend\src\pages\Dashboard.jsx`

Purpose of change:

- Fixed unsafe `.toLowerCase()` usage on `e.key`.
- This prevents a crash if `e.key` is missing, null, or undefined.

Before:

```jsx
      if (
        e.key.toLowerCase() === 'n' &&
        !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
      ) {
```

After:

```jsx
      if (
        String(e.key || '').toLowerCase() === 'n' &&
        !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
      ) {
```

Before:

```jsx
}
```

After:

```jsx
}
```

Note: the final line content did not change; only the missing trailing newline was fixed.

## New Files Created

### `C:\Users\Admin\Desktop\New folder (2)\KubeGuard\KUBEGUARD_DEV_SUMMARY.md`

Purpose:

- Created a full project knowledge file covering all five microservices.
- Documents service file structures, dependencies, `.env.example` contents, routes, inter-service calls, Mongoose models, Dockerfiles, known issues, and verification notes.
- Intended for handoff to another AI/developer that has the master reference file but not the implementation/testing history.

Before:

```text
File did not exist.
```

After:

```md
# KubeGuard AI Development Summary

This file documents the current codebase state for all five KubeGuard AI microservices. It is intended for another AI/developer that has the master reference document but has not seen the actual implementation or the fixes/testing performed here.

Important security note: local `.env` and `.env.docker` files exist for some services and contain real secrets. This summary intentionally documents only `.env.example` content and contract shape, not secret values from local runtime files.
```

The full file content is in `KUBEGUARD_DEV_SUMMARY.md`.

## What I Checked And Confirmed Was Already Correct

### Gateway

- `gateway/src/middleware/validateToken.js` already validated Bearer tokens with JWKS, accepted both configured Entra audience formats, and handled validation errors as `401`.
- `gateway/src/middleware/extractHeaders.js` already passed decoded user identity and roles downstream through `x-user-*` headers.
- Gateway webhook proxy already preserved raw request bodies for HMAC-sensitive GitHub webhook handling.
- Gateway proxy `pathRewrite` already stripped `/api` for normal service proxy routes.

### Project Service

- `project-service/src/middleware/validate.js` already treated `kubernetesToken` as optional.
- `project-service/src/models/Project.js` already had `kubernetesToken` defaulting to `null` and not required.
- `project-service/src/services/githubWebhook.js` already returned structured failure results instead of throwing for normal registration/delete failures.
- `project-service/src/routes/projects.js` already encrypted `kubernetesToken` only when it was truthy.

### Watcher Service

- `watcher-service/src/app.js` and `watcher-service/src/routes/webhook.js` already mounted the GitHub webhook route with raw body parsing before JSON parsing.
- `watcher-service/src/routes/webhook.js` already responded `200` to GitHub after creating the event and before triggering background analysis.
- `watcher-service/src/routes/events.js` already implemented `GET /events` and `GET /events/:id`.
- `watcher-service/src/routes/internal.js` already protected internal routes with `x-internal-secret`.
- `PATCH /internal/events/:id/status` already updated status fields and timestamps correctly.

### Analysis Service

- `analysis-service/src/routes/internal.js` already returned `202` from `POST /internal/analyze` before background processing.
- `analysis-service/src/routes/reports.js` already queried MongoDB report metadata before trying to download full blob content.
- `analysis-service/src/services/blobStorage.js` already uploaded reports and attempted SAS URL generation.
- `analysis-service/src/services/serviceBus.js` already published report-ready messages and handled publish failures without crashing the analysis flow.

### Notification Service

- `notification-service/src/index.js` already started the Service Bus consumer during boot after MongoDB connection.
- `notification-service/src/routes/notify.js` already handled `GET /notify/decide?token=...` using approval-token verification.
- `notification-service/src/services/approvalToken.js` already enforced a 48-hour token lifetime.
- `notification-service/src/services/argocd.js` already returned failure objects instead of crashing on ArgoCD resume errors.

### Cross-Service

- All checked `.env.docker` files used the same `INTERNAL_SECRET` value. The value is intentionally not copied here.
- Internal service-to-service routes checked during the audit used the `x-internal-secret` header.
- Existing path rewrites for `/api/projects`, `/api/events`, `/api/reports`, and `/api/notify` stripped `/api` before proxying.

## What I Did Not Change

- I did not rewrite Watcher semantic diff parsing into a full old/new YAML deep comparison. It remains a simplified changed-file/classification parser.
- I did not add a Gateway startup env validation layer.
- I did not add a default fallback for missing `GATEWAY_PORT`.
- I did not implement SendGrid email sending. `EMAIL_PROVIDER=console` remains the working provider; `sendgrid` still returns a not-configured result.
- I did not change Notification Service `checkInternal.js`; it still exists but is not mounted by any route.
- I did not populate `Decision.emailSentAt` or `Decision.emailRecipients` during email sending.
- I did not change Docker Compose health dependencies so Gateway waits for downstream HTTP health, beyond the existing service dependency structure.
- I did not remove the obsolete `version` field warning from `docker-compose.yml`.
- I did not run real Entra token validation because no fresh Microsoft token was available.
- I did not run real GitHub webhook registration against GitHub as part of the final smoke path.
- I did not run real Azure Blob upload/download or Azure Service Bus publish/consume end-to-end.
- I did not complete Docker rebuild/start because Docker Desktop's Linux engine was unavailable.

## Verification Performed

- Ran `node --check` across backend service source files.
- Loaded each backend app module successfully.
- Built the frontend successfully with `npm.cmd run build`.
- Confirmed local health checks returned `200` for:
  - `http://localhost:3001/health`
  - `http://localhost:3002/health`
  - `http://localhost:3003/health`
  - `http://localhost:3004/health`
- Confirmed Gateway returned `200` for `/health` when launched directly during the audit, but it was not still running at the final local health snapshot.
- Confirmed `POST http://localhost:3001/projects` returned `201` in about `0.214s` with `kubernetesToken: null`.
- Confirmed `GET http://localhost:3001/projects` returned `200`.
- Pushed commit `1c1ed2e` to GitHub branch `main`.

## Docker Rebuild Status

Requested command sequence:

```powershell
docker compose down
docker compose build --no-cache
docker compose up -d
```

Actual result:

```text
docker compose down
```

failed because Docker Desktop's Linux engine pipe was unavailable:

```text
open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```

Because Compose could not connect to Docker, the no-cache build, container startup, and post-Docker curl sequence were not completed.
