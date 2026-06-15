function buildChangesSummary(semanticChanges) {
  if (!Array.isArray(semanticChanges) || semanticChanges.length === 0) {
    return 'No semantic Kubernetes changes were provided.'
  }

  return semanticChanges
    .map((change) => {
      const path = change.path || change.field || change.key || 'unknown field'
      const oldValue = change.oldValue === undefined ? 'undefined' : JSON.stringify(change.oldValue)
      const newValue = change.newValue === undefined ? 'undefined' : JSON.stringify(change.newValue)
      return `${path}: ${oldValue} -> ${newValue}`
    })
    .join('; ')
}

function buildPrompt({ event, project, liveMetrics, historicalPeak }) {
  const semanticChanges = event.semanticChanges || []

  return [
    'You are KubeGuard AI, an advisory Kubernetes pre-deployment risk analyst.',
    'Analyze this change using semantic Kubernetes/Helm changes, live cluster metrics, and historical peak metrics.',
    'The AI does not approve or reject deployments. A human administrator makes the final decision.',
    '',
    `Project name: ${project.name || project.projectName || 'unknown'}`,
    `Project ID: ${project._id || project.projectId}`,
    `Repository: ${project.githubRepoUrl || 'unknown'}`,
    `Branch: ${project.branch || 'unknown'}`,
    `Folder path: ${project.folderPath || 'unknown'}`,
    `ArgoCD app: ${project.argocdAppName || project.appName || 'unknown'}`,
    '',
    `Event ID: ${event._id || event.eventId}`,
    `Commit SHA: ${event.commitSha || event.commitId || 'unknown'}`,
    `Commit message: ${event.commitMessage || event.message || 'unknown'}`,
    `Changed files: ${JSON.stringify(event.changedFiles || [])}`,
    `Semantic changes summary: ${buildChangesSummary(semanticChanges)}`,
    `Semantic changes JSON: ${JSON.stringify(semanticChanges)}`,
    '',
    `Live metrics JSON: ${JSON.stringify(liveMetrics)}`,
    `Historical peak JSON: ${JSON.stringify(historicalPeak)}`,
    '',
    'Return ONLY valid JSON, with no markdown fences and no surrounding prose.',
    'The JSON must contain exactly these fields:',
    '{',
    '  "riskScore": "low | medium | high | critical",',
    '  "riskReason": "2-3 sentence explanation",',
    '  "prediction": "plain-language prediction of likely deployment impact",',
    '  "recommendation": "approve | approve_with_caution | reject",',
    '  "reportMarkdown": "markdown report with ## Summary, ## What Changed, ## Metrics, ## Risk, ## Recommendation"',
    '}',
  ].join('\n')
}

module.exports = { buildPrompt, buildChangesSummary }
