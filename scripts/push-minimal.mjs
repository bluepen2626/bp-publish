// scripts/push-minimal.mjs
import { spawnSync } from 'child_process';

function sh(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}

const NAME  = process.env.GIT_AUTHOR_NAME  || 'Bluepen Bot';
const EMAIL = process.env.GIT_AUTHOR_EMAIL || 'bot@blue-pen.jp';
const TOKEN = (process.env.GITHUB_TOKEN || '').trim();
let   REPO  = (process.env.GITHUB_REPO  || '').trim(); // 'owner/repo' でも 'repo' でもOK
const USER  = (process.env.GITHUB_USERNAME || '').trim();
const BRANCH = process.env.GIT_BRANCH || 'main';

sh('git', ['config', '--global', 'user.name', NAME]);
sh('git', ['config', '--global', 'user.email', EMAIL]);

REPO = REPO.replace(/^https:\/\/github\.com\//i,'').replace(/\.git$/i,'').replace(/^\/+|\/+$/g,'');
const path = REPO.includes('/') ? REPO : (USER ? `${USER}/${REPO}` : '');
if (!TOKEN || !path) {
  console.error('❌ GITHUB_TOKEN / GITHUB_REPO(/USERNAME) が未設定');
  process.exit(1);
}
const remoteUrl = `https://${TOKEN}@github.com/${path}.git`;
spawnSync('git', ['remote', 'set-url', 'origin', remoteUrl], { stdio: 'inherit' }) ||
sh('git', ['remote', 'add', 'origin', remoteUrl]);

// 変更対象を最小にする
sh('git', ['add', 'data/previous.json', 'data/fetched.json', 'data/diff.json']);
sh('git', ['add', '-A', 'output']); // 出力HTMLのみ

// 変更がなければ終了
const diff = spawnSync('git', ['diff', '--cached', '--quiet']);
if (diff.status === 0) {
  console.log('ℹ️ 変更なし（pushスキップ）');
  process.exit(0);
}

const msg = process.env.GIT_COMMIT_MESSAGE || 'chore: update output & previous.json';
sh('git', ['commit', '-m', msg]);

// detached HEAD 対応：明示的に HEAD→branch
sh('git', ['push', 'origin', `HEAD:refs/heads/${BRANCH}`]);
console.log(`🚀 pushed to ${BRANCH}`);
