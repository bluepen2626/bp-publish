// scripts/force-placeholder.mjs
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const DATA_DIR   = path.resolve(__dirname, "..", "data");
const OUT_DIR    = path.resolve(__dirname, "..", "output");
const FETCHED_ALL= path.join(DATA_DIR, "fetched_all.json");
const DIFF_JSON  = path.join(DATA_DIR, "diff.json");

const LIMIT = Math.max(1, parseInt(process.env.PLACEHOLDER_LIMIT || "100", 10) || 100);

async function exists(p){ try { await fs.access(p); return true; } catch { return false; } }

(async () => {
  const allStr = await fs.readFile(FETCHED_ALL, "utf8").catch(()=>null);
  if (!allStr) { console.error("missing fetched_all.json"); process.exit(2); }
  let all = [];
  try { all = JSON.parse(allStr); } catch(e){ console.error("JSON parse error:", e.message); process.exit(2); }

  const cand = all.filter(x=>{
    const acf  = x?.acf || {};
    const id   = x?.id_code ?? acf.id_code;
    const code = x?.random_url_code ?? acf.random_url_code;
    const use  = x?.use_case ?? acf.use_case;
    return use === "placeholder" && id && code;
  });

  const targets = [];
  for (const it of cand) {
    const acf  = it?.acf || {};
    const id   = it?.id_code ?? acf.id_code;
    const code = it?.random_url_code ?? acf.random_url_code;
    const outPath = path.join(OUT_DIR, `${id}-${code}.html`);
    if (!(await exists(outPath))) targets.push(it);
  }

  const sliced = targets.slice(0, LIMIT);
  await fs.writeFile(DIFF_JSON, JSON.stringify(sliced, null, 2));
  console.log(`diff.json written: ${sliced.length} items (limit=${LIMIT})`);
})();
