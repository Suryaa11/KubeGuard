const axios = require('axios')

function parseGithubUrl(url) {
  const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (!match) throw new Error(`Cannot parse GitHub URL: ${url}`)
  return { owner: match[1], repo: match[2] }
}

async function registerWebhook(repoUrl, projectId, webhookSecret) {
  try {
    const { owner, repo } = parseGithubUrl(repoUrl)
    const response = await axios.post(
      `https://api.github.com/repos/${owner}/${repo}/hooks`,
      {
        config: {
          url: `${process.env.GATEWAY_PUBLIC_URL}/api/webhook/${projectId}`,
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

    return { success: true, webhookId: response.data.id }
  } catch (error) {
    return { success: false, error: error.response?.data?.message || error.message }
  }
}

async function deleteWebhook(repoUrl, webhookId) {
  if (!webhookId) {
    return { success: true }
  }

  try {
    const { owner, repo } = parseGithubUrl(repoUrl)
    await axios.delete(`https://api.github.com/repos/${owner}/${repo}/hooks/${webhookId}`, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    return { success: true }
  } catch (error) {
    if (error.response?.status === 404) {
      return { success: true }
    }
    return { success: false, error: error.response?.data?.message || error.message }
  }
}

module.exports = { registerWebhook, deleteWebhook }
