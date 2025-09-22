import fs from 'fs/promises';
import fss from 'fs';
import path from 'path';

const VERSION = 'fetch-id-info.mjs v2025-09-21f';

// API
const API_BASE = process.env.WP_API_BASE || process.env.WP_API_URL || 'https://www.blue-pen.jp/wp-json/wp/v2/id_info';
const API_SEARCH = (API_BASE.replace(/\/wp\/v2\/.*/,'') || 'https://www.blue-pen.jp/wp-json') + '/wp/v2/search';
const PER_PAGE = Math.max(1, parseInt(process.env.WP_PER_PAGE || '100', 10));

// 保存先
const DATA_DIR     = path.resolve(process.cwd(), 'data');
const FETCHED_ALL  = path.join(DATA_DIR, 'fetched_all.json');
const FETCHED      = path.join(DATA_DIR, 'fetched.json');
const SKIP_FLAG    = path.join(DATA_DIR, 'skip.flag');

// 認証（WP_USER/WP_APP_PASS 互換）
const AUTH_USER   = process.env.WP_API_USER || process.env.WP_USER || '';
const AUTH_PASS   = process.env.WP_API_PASS || process.env.WP_APP_PASS || '';
const AUTH_HEADER = (AUTH_USER && AUTH_PASS)
  ? 'Basic ' + Buffer.from(`${AUTH_USER}:${AUTH_PASS}`).toString('base64')
  : null;

// 個別ID or 検索
const ONLY_IDS   = (process.env.ONLY_IDS || process.env.ONLY_ID || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const ONLY_QUERY = (process.env.ONLY_QUERY || process.env.ONLY_SEARCH || '').trim();

function headers(){
  const h = { 'Cache-Control':'no-cache', 'Pragma':'no-cache' };
  if (AUTH_HEADER) h.Authorization = AUTH_HEADER;
  return h;
}
function urlList(page){
  const u = new URL(API_BASE);
  u.searchParams.set('per_page', String(PER_PAGE));
  u.searchParams.set('page', String(page));
  if (AUTH_HEADER) u.searchParams.set('context','edit'); // 認証あれば下書きも見える
  u.searchParams.set('_', String(Date.now()));
  return u.toString();
}
function urlOne(id){
  const base = API_BASE.replace(/\/$/, '');
  const u = new URL(`${base}/${encodeURIComponent(id)}`);
  if (AUTH_HEADER) u.searchParams.set('context','edit');
  u.searchParams.set('_', String(Date.now()));
  return u.toString();
}
function urlSearch(q){
  const u = new URL(API_SEARCH);
  u.searchParams.set('search', q);
  u.searchParams.set('subtype', API_BASE.split('/').pop()); // 例: id_info
  u.searchParams.set('per_page', '50');
  u.searchParams.set('_', String(Date.now()));
  return u.toString();
}

async function fetchJSON(url){
  const r = await fetch(url, { headers: headers() });
  if (!r.ok){
    const t = await r.text().catch(()=> '');
    throw new Error(`HTTP ${r.status} ${t.slice(0,200)}`);
  }
  return r.json();
}

async function ensureDir(p){ try{ await fs.mkdir(p,{recursive:true}); }catch{} }

export async function runFetch(){
  console.log(`[fetch] ${VERSION}`);
  console.log('[fetch] API_BASE=', API_BASE);
  console.log('[fetch] auth=', (AUTH_USER&&AUTH_PASS)?'ON':'OFF', 'user=', AUTH_USER ? 'SET' : 'NONE');

  await ensureDir(DATA_DIR);
  let all = [];

  if (ONLY_IDS.length > 0){
    console.log('[fetch] ONLY_IDS mode:', ONLY_IDS.join(','));
    for (const id of ONLY_IDS){
      try {
        const obj = await fetchJSON(urlOne(id));
        if (obj && obj.id) { all.push(obj); console.log(`[fetch] one ${id}: OK`); }
      } catch (e) {
        console.log(`[fetch] one ${id}: FAIL ${e.message}`);
      }
    }
  } else if (ONLY_QUERY){
    console.log('[fetch] ONLY_QUERY mode:', ONLY_QUERY);
    const hits = await fetchJSON(urlSearch(ONLY_QUERY)); // [{id,subtype, ...}]
    const ids = (Array.isArray(hits)?hits:[]).filter(h => h?.subtype).map(h => h.id);
    console.log('[fetch] search hits:', ids.length, ids.slice(0,10).join(','));
    for (const id of ids){
      try {
        const obj = await fetchJSON(urlOne(id));
        if (obj && obj.id) { all.push(obj); console.log(`[fetch] one ${id}: OK`); }
      } catch (e) {
        console.log(`[fetch] one ${id}: FAIL ${e.message}`);
      }
    }
  } else {
    let page = 1;
    while(true){
      const arr = await fetchJSON(urlList(page));
      const len = Array.isArray(arr) ? arr.length : 0;
      console.log(`[${new Date().toISOString()}] page ${page}: ${len}件`);
      if (!len){ break; }
      all.push(...arr);
      if (len < PER_PAGE) break;
      page++;
    }
  }

  console.log(`[fetch] total: ${all.length}`);

  const allStr = JSON.stringify(all, null, 2);
  if (fss.existsSync(FETCHED_ALL)) { try{ await fs.copyFile(FETCHED_ALL, FETCHED_ALL+'.bak'); }catch{} }
  await fs.writeFile(FETCHED_ALL, allStr, 'utf8');
  console.log(`[fetch] saved fetched_all.json (${allStr.length} chars)`);

  const agreed = all.filter(p => p?.acf?.agreement === true || p?.acf?.agreement === 'true');
  const agreedStr = JSON.stringify(agreed, null, 2);
  if (fss.existsSync(FETCHED)) { try{ await fs.copyFile(FETCHED, FETCHED+'.bak'); }catch{} }
  await fs.writeFile(FETCHED, agreedStr, 'utf8');
  console.log(`[fetch] saved fetched.json (${agreedStr.length} chars), agreed=${agreed.length}`);

  if (agreed.length === 0 && process.env.BUILD_ALL_WHEN_NO_DIFF !== '1'){
    await fs.writeFile(SKIP_FLAG, '1');
    console.log(`[fetch] wrote skip.flag`);
  }
}
export default runFetch;

if (import.meta.url === `file://${process.argv[1]}`){
  runFetch().catch(e => { console.error('FATAL(fetch):', e?.stack || e); process.exit(1); });
}
