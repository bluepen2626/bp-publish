// scripts/diag.mjs
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const DATA_DIR   = path.resolve(__dirname, "..", "data");
const OUT_DIR    = path.resolve(__dirname, "..", "output");

async function exists(p){ try { await fs.access(p); return true; } catch { return false; } }
async function size(p){ try { const s = await fs.stat(p); return s.size; } catch { return 0; } }
async function readJson(p){ try { return JSON.parse(await fs.readFile(p,"utf8")); } catch { return null; } }

(async () => {
  console.log("=== diag ===");
  console.log("cwd:", process.cwd());
  console.log("node:", process.version);
  console.log("dirs:", { DATA_DIR, OUT_DIR });

  const files = {
    fetched_all: path.join(DATA_DIR, "fetched_all.json"),
    fetched:     path.join(DATA_DIR, "fetched.json"),
    diff:        path.join(DATA_DIR, "diff.json"),
    previous:    path.join(DATA_DIR, "previous.json"),
    skip:        path.join(DATA_DIR, "skip.flag"),
  };

  for (const [k,p] of Object.entries(files)) {
    console.log(`[file] ${k}:`, await exists(p) ? `exists (${await size(p)} bytes)` : "missing");
  }

  const fetchedAll = await readJson(files.fetched_all);
  const fetched    = await readJson(files.fetched);
  const diff       = await readJson(files.diff);

  const faLen = Array.isArray(fetchedAll) ? fetchedAll.length : 0;
  const fLen  = Array.isArray(fetched)    ? fetched.length    : 0;
  const dLen  = Array.isArray(diff)       ? diff.length       : 0;

  console.log("counts:", { fetched_all: faLen, fetched: fLen, diff: dLen });

  // placeholder候補数と未生成件数
  const placeholders = Array.isArray(fetchedAll) ? fetchedAll.filter(x=>{
    const acf  = x?.acf || {};
    const id   = x?.id_code ?? acf.id_code;
    const code = x?.random_url_code ?? acf.random_url_code;
    const use  = x?.use_case ?? acf.use_case;
    return use === "placeholder" && id && code;
  }) : [];

  let missing = 0;
  for (const it of placeholders) {
    const acf  = it?.acf || {};
    const id   = it?.id_code ?? acf.id_code;
    const code = it?.random_url_code ?? acf.random_url_code;
    const outPath = path.join(OUT_DIR, `${id}-${code}.html`);
    if (!await exists(outPath)) missing++;
  }

  console.log("placeholder candidates:", placeholders.length, "/ not yet generated:", missing);

  // ENV
  const envKeys = ["MODE","GEN_PLACEHOLDER","PLACEHOLDER_LIMIT","USE_GH_API"];
  const envObj = {};
  for (const k of envKeys) envObj[k] = process.env[k] ?? "(unset)";
  console.log("env:", envObj);

  console.log("=== diag end ===");
})();
