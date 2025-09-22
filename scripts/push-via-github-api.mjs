// scripts/push-via-github-api.mjs
import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const OWNER  = process.env.GITHUB_OWNER;
const REPO   = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const TOKEN  = process.env.GITHUB_TOKEN;

if (!OWNER || !REPO || !TOKEN) {
  console.error('❌ GITHUB_OWNER / GITHUB_REPO / GITHUB_TOKEN が未設定');
  process.exit(1);
}

const API_ROOT = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'bluepen-render-bot'
};

async function getShaIfExists(repoPath) {
  const url = `${API_ROOT}/${encodeURIComponent(repoPath)}?ref=${encodeURIComponent(BRANCH)}`;
  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) {
    const t = await res.text().catch(()=> '');
    throw new Error(`GET ${repoPath} ${res.status}: ${t.slice(0,200)}`);
  }
  const json = await res.json();
  return json.sha || null;
}

async function upsertFile(repoPath, absPath, message) {
  const content = await fs.readFile(absPath);
  const sha = await getShaIfExists(repoPath);
  const body = {
    message,
    branch: BRANCH,
    content: content.toString('base64'),
    ...(sha ? { sha } : {})
  };
  const url = `${API_ROOT}/${encodeURIComponent(repoPath)}`;
  const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const t = await res.text().catch(()=> '');
    throw new Error(`PUT ${repoPath} ${res.status}: ${t.slice(0,200)}`);
  }
  console.log(`✅ pushed: ${repoPath}${sha ? ' (update)' : ' (create)'}`);
}

function toRepoPath(p) { return p.replace(/^[./]+/, ''); }

export async function pushViaGitHubAPI({ jsonPaths = [], htmlPaths = [] } = {}) {
  // JSON
  for (const rel of jsonPaths) {
    const abs = path.resolve(__dirname, '..', rel);
    await upsertFile(toRepoPath(rel), abs, `update ${rel}`);
  }
  // HTML
  for (const rel of htmlPaths) {
    const abs = path.resolve(__dirname, '..', rel);
    await upsertFile(toRepoPath(rel), abs, `update ${rel}`);
  }
}
