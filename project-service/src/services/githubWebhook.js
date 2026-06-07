const axios = require('axios')

function parseGithubUrl(url) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (!match) throw new Error(`Cannot parse GitHub URL: ${url}`)
  return { owner: match[1], repo: match[2] }
}

async function registerWebhook(githubRepoUrl, webhookSecret, projectId) {
  const { owner, repo } = parseGithubUrl(githubRepoUrl)
  const webhookUrl = `${process.env.GATEWAY_PUBLIC_URL}/api/webhook/${projectId}`

  const response = await axios.post(
    `https://api.github.com/repos/${owner}/${repo}/hooks`,
    {
      config: {
        url: webhookUrl,
        content_type: 'json',
        secret: webhookSecret,
        insecure_ssl: '0',
      },
      events: ['push'],
      active: true,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  )

  return response.data.id
}

async function deleteWebhook(githubRepoUrl, webhookId) {
  if (!webhookId) return
  try {
    const { owner, repo } = parseGithubUrl(githubRepoUrl)
    await axios.delete(`https://api.github.com/repos/${owner}/${repo}/hooks/${webhookId}`, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
  } catch (error) {
    if (error.response?.status !== 404) {
      console.error(`[project-service] Failed to delete GitHub webhook ${webhookId}:`, error.message)
    }
  }
}

module.exports = { registerWebhook, deleteWebhook }
