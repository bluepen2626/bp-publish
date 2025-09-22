// scripts/create-diff.mjs（新）
// - previous.json は「agreed=0 のとき保持」→ 空で上書きしない（“保持”ログで判別）
// - output / output-diff を見て「未発行プレースホルダ」を検出
// - id_code / random_url_code を acf / meta / alias から柔軟に取得

import fs from "fs/promises";
import fss from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const dataDir        = path.join(__dirname, "..", "data");
const fetchedPath    = path.join(dataDir, "fetched.json");
const fetchedAllPath = path.join(dataDir, "fetched_all.json");
const previousPath   = path.join(dataDir, "previous.json");
const previousBak    = path.join(dataDir, "previous.json.bak");
const diffPath       = path.join(dataDir, "diff.json");
const diffTmpPath    = path.join(dataDir, "diff.tmp.json");
const skipFlagPath   = path.join(dataDir, "skip.flag");

const outFinalDir    = path.join(__dirname, "..", "output");
const outDiffDir     = path.join(__dirname, "..", "output-diff");

const logDir         = path.join(__dirname, "..", "logs");
const logPath        = path.join(logDir, "diff.log");

function parseIdFilter(){
  const one=(process.env.ONLY_ID||"").trim();
  const many=(process.env.ONLY_IDS||"").trim();
  const s=new Set();
  if(one) s.add(one);
  if(many) many.split(",").map(x=>x.trim()).filter(Boolean).forEach(x=>s.add(x));
  return s;
}
const ID_FILTER=parseIdFilter();

async function log(msg){
  const t=new Date().toISOString();
  const line=`[${t}] ${msg}`;
  console.log(line);
  try{ await fs.mkdir(logDir,{recursive:true}); await fs.appendFile(logPath, line+"\n"); }catch{}
}
async function readJson(p, fb=[]){
  try{
    const s=await fs.readFile(p,"utf8");
    await log(`📥 ${path.basename(p)} 読み込み成功 (${s.length} bytes)`);
    return JSON.parse(s);
  }catch{
    await log(`⚠️ ${path.basename(p)} 読み込み失敗: 既定値で継続します`);
    return fb;
  }
}

// ACFだけ比較（出力に使う層）
function isDifferent(oldItem, newItem){
  const clean = o => JSON.parse(JSON.stringify(o || {}));
  return JSON.stringify(clean(oldItem?.acf)) !== JSON.stringify(clean(newItem?.acf));
}

function fileExistsInOutputs(fname){
  return fss.existsSync(path.join(outFinalDir,fname)) || fss.existsSync(path.join(outDiffDir,fname));
}

const ALIAS={ id_code:["card_id","id"], random_url_code:["random_code","code"] };
function getField(post, key){
  const acf=post?.acf||{};
  const meta=post?.meta||{};
  if(acf[key]!=null && acf[key]!=="") return acf[key];
  if(meta[key]!=null && meta[key]!=="") return meta[key];
  if(post[key]!=null && post[key]!=="") return post[key];
  for(const a of (ALIAS[key]||[])){
    if(acf[a]!=null && acf[a]!=="") return acf[a];
    if(meta[a]!=null && meta[a]!=="") return meta[a];
    if(post[a]!=null && post[a]!=="") return post[a];
  }
  return null;
}
function buildFileKey(post){
  const id=getField(post,"id_code");
  const code=getField(post,"random_url_code");
  return (id&&code)?`${id}-${code}`:null;
}
function uniqBy(arr, keyFn){
  const m=new Map();
  for(const x of arr){ const k=keyFn(x); if(k) m.set(k,x); }
  return [...m.values()];
}
async function exists(p){ try{ await fs.access(p); return true; }catch{ return false; } }
function matchIdFilter(post){
  if(ID_FILTER.size===0) return true;
  const id=getField(post,"id_code");
  return id?ID_FILTER.has(String(id)):false;
}

export async function extractDiff(){
  await log("=== 🔄 ② 差分抽出 開始 ===");
  await fs.mkdir(dataDir,{recursive:true});

  const fetchedAgreed = await readJson(fetchedPath,[]);
  const fetchedAll    = await readJson(fetchedAllPath,[]);
  const previousAgreed= await readJson(previousPath,[]);

  const prevMapById = new Map(previousAgreed.map(it => [it?.id, it]));
  const changedAgreed = fetchedAgreed.filter(newItem => {
    if (!matchIdFilter(newItem)) return false;
    const oldItem = prevMapById.get(newItem?.id);
    return !oldItem || isDifferent(oldItem, newItem);
  });

  const needPlaceholder = fetchedAll.filter(p => {
    if (!matchIdFilter(p)) return false;
    const key = buildFileKey(p);
    if (!key) return false;
    const fname = `${key}.html`;
    return !fileExistsInOutputs(fname);
  });

  const toBuild = uniqBy([...changedAgreed, ...needPlaceholder], p=>buildFileKey(p));

  await fs.writeFile(diffTmpPath, JSON.stringify(toBuild,null,2), "utf8");
  await fs.rename(diffTmpPath, diffPath);
  await log(`✅ 差分抽出完了: agreed差分=${changedAgreed.length}, 未発行(placeholder)=${needPlaceholder.length}, 合計=${toBuild.length} 件を diff.json に出力`);

  if (await exists(previousPath)) {
    await fs.copyFile(previousPath, previousBak);
    await log("💾 previous.json を previous.json.bak にバックアップしました");
  }
  if (Array.isArray(fetchedAgreed) && fetchedAgreed.length > 0) {
    await fs.writeFile(previousPath, JSON.stringify(fetchedAgreed,null,2), "utf8");
    await log("🔄 previous.json を最新の fetched.json (agreement=true) に更新しました");
  } else {
    await log("ℹ previous.json は保持（agreed=0）"); // ★ ここが指紋
  }

  if (toBuild.length > 0 && await exists(skipFlagPath)) {
    await fs.unlink(skipFlagPath);
    await log("🧹 diffありのため skip.flag を削除しました");
  }
  await log("=== 🔄 ② 差分抽出 完了 ===");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  extractDiff().catch(async e=>{ await log("❌ 差分比較処理中にエラー: "+(e?.message||e)); process.exit(1); });
}
