// utils/github-client.js
import 'dotenv/config';
import fetch from 'node-fetch'; // node-fetch は ESM を明示的に import
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

const BASE_URL = `https://api.github.com/repos/${GITHUB_REPO}/contents`;

export async function uploadFile(filePath, content, message) {
  const url = `${BASE_URL}/${filePath}`;
  const headers = {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
  };

  let sha = null;
  try {
    const res = await fetch(`${url}?ref=${GITHUB_BRANCH}`, { headers });
    if (res.ok) {
      const json = await res.json();
      sha = json.sha;
    }
  } catch (_) {}

  const payload = {
    message,
    content: Buffer.from(content).toString('base64'),
    branch: GITHUB_BRANCH,
    ...(sha && { sha }),
  };

  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`GitHub push failed: ${res.status} ${error}`);
  }

  return await res.json();
}
