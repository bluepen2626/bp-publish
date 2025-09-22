// scripts/main.mjs — placeholder-all 恒常化版
// fetch → diff → generate → reflect
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ===== fingerprint =====
const VERSION = "main.mjs v2025-09-23a";
console.log("[main] version:", VERSION);

// ===== helpers =====
function section(t) { console.log(`\n=== ${t} ===`); }
async function exists(p){ try { await fs.access(p); return true; } catch { return false; } }
async function readJSON(p, fallback = null) {
  try { return JSON.parse(await fs.readFile(p, "utf8")); }
  catch { return fallback; }
}
async function atomicWrite(p, content) {
  const tmp = p + `.tmp-${Date.now()}-${process.pid}`;
  await fs.writeFile(tmp, typeof content === "string" ? content : JSON.stringify(content, null, 2), "utf8");
  await fs.rename(tmp, p);
}
function parseIdFilter() {
  const one = (process.env.ONLY_ID  || "").trim();
  const many = (process.env.ONLY_IDS || "").trim();
  const s = new Set();
  if (one) s.add(one);
  if (many) many.split(",").map(x=>x.trim()).filter(Boolean).forEach(x=>s.add(x));
  return s;
}

// ===== MODE: arg > env > default(all) =====
const validModes = new Set(["fetch","diff","generate","reflect","build","all"]);
const argMode = (process.argv[2] || "").toLowerCase();
const envMode = (process.env.MODE || "").toLowerCase();
const MODE = validModes.has(argMode) ? argMode : (validModes.has(envMode) ? envMode : "all");

// 後方互換: BUILD_ALL_WHEN_NO_DIFF=1 でも PLACEHOLDER_ALL=1 と同義
const PLACEHOLDER_ALL = (process.env.PLACEHOLDER_ALL === "1") || (process.env.BUILD_ALL_WHEN_NO_DIFF === "1");

// ===== paths =====
const DATA_DIR    = path.resolve(__dirname, "..", "data");
const OUT_DIR     = path.resolve(__dirname, "..", "output");
const SKIP_FLAG   = path.join(DATA_DIR, "skip.flag");
const DIFF_JSON   = path.join(DATA_DIR, "diff.json");
const FETCHED     = path.join(DATA_DIR, "fetched.json");
const FETCHED_ALL = path.join(DATA_DIR, "fetched_all.json");
const PREVIOUS    = path.join(DATA_DIR, "previous.json");

// ===== utils =====
async function getDiffSize() {
  const ok = await exists(DIFF_JSON);
  if (!ok) return 0;
  try {
    const raw = await fs.readFile(DIFF_JSON, "utf8");
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr.length : 0;
  } catch { return 0; }
}

async function fallbackUsePreviousAsDiff({ onlyIds = null } = {}) {
  const hasPrev = await exists(PREVIOUS);
  if (!hasPrev) { console.log("🔴 PLACEHOLDER_ALL: previous.json がありません"); return 0; }
  let prevArr = await readJSON(PREVIOUS, []);
  if (!Array.isArray(prevArr) || prevArr.length === 0) { console.log("🔴 PLACEHOLDER_ALL: previous.json が空です"); return 0; }
  if (onlyIds && onlyIds.size > 0) {
    prevArr = prevArr.filter(it => {
      const id = it?.id_code || it?.acf?.id_code || it?.title?.raw;
      return id && onlyIds.has(String(id));
    });
  }
  await atomicWrite(DIFF_JSON, prevArr);
  console.log(`🟢 PLACEHOLDER_ALL: previous.json から ${prevArr.length} 件を diff.json に投入`);
  try { await fs.rm(SKIP_FLAG, { force: true }); } catch {}
  return prevArr.length;
}

// ===== MAIN =====
(async () => {
  try {
    console.log(`MODE=${MODE}`);
    const idFilter = parseIdFilter();
    let shouldSkipBuild = false;

    // 1) fetch
    if (MODE === "fetch" || MODE === "all" || MODE === "build") {
      section("1) fetch");
      const mod = await import("./fetch-id-info.mjs");
      const fetchFn = mod.runFetch || mod.fetchData || mod.default;
      console.log("[main] using fetch function:", fetchFn && fetchFn.name);
      if (typeof fetchFn !== "function") throw new TypeError("fetch module does not export a callable function (expected runFetch / fetchData / default).");
      await fetchFn();

      const hasDiff = await exists(DIFF_JSON);
      if (!hasDiff && await exists(SKIP_FLAG)) {
        console.log("skip: skip.flag detected (no eligible records).");
        shouldSkipBuild = true;
      } else {
        shouldSkipBuild = false;
      }
    }

    // 2) diff
    if (!shouldSkipBuild && (MODE === "diff" || MODE === "all" || MODE === "build")) {
      section("2) diff");
      const { extractDiff } = await import("./create-diff.mjs");
      await extractDiff();

      let cnt = await getDiffSize();
      console.log(`diff size: ${cnt}`);

      if (cnt === 0 && PLACEHOLDER_ALL) {
        const used = await fallbackUsePreviousAsDiff({ onlyIds: idFilter });
        if (used > 0) {
          cnt = used;
        } else if (await exists(FETCHED)) {
          const arr = await readJSON(FETCHED, []);
          if (Array.isArray(arr) && arr.length > 0) {
            await atomicWrite(DIFF_JSON, arr);
            console.log(`🟢 PLACEHOLDER_ALL: fetched.json から ${arr.length} 件を diff.json に投入`);
            cnt = arr.length;
          }
        }
      }

      if (cnt === 0 && !PLACEHOLDER_ALL) {
        console.log("skip: no diff");
        shouldSkipBuild = true;
      }
    }

    // 3) generate
    if (!shouldSkipBuild && (MODE === "generate" || MODE === "all" || MODE === "build")) {
      section("3) generate (diff)");
      const { generateHtmlForDiff } = await import("./generate-html.mjs");
      await generateHtmlForDiff();
    }

    // 4) reflect
    if (!shouldSkipBuild && (MODE === "reflect" || MODE === "all" || MODE === "build")) {
      section("4) reflect to output");
      const { reflectToOutput } = await import("./sync-output.mjs");
      await reflectToOutput();

      if (process.env.USE_GH_API === "1") {
        const { pushViaGitHubAPI } = await import("./push-via-github-api.mjs");
        const diffRaw  = await fs.readFile(DIFF_JSON, "utf-8").catch(() => "[]");
        let diffArr = [];
        try { diffArr = JSON.parse(diffRaw || "[]"); } catch {}
        const htmlPaths = Array.isArray(diffArr)
          ? diffArr
              .map(it => {
                const id   = it?.id_code || it?.acf?.id_code;
                const code = it?.random_url_code || it?.acf?.random_url_code;
                return (id && code) ? `output/${id}-${code}.html` : null;
              })
              .filter(Boolean)
          : [];
        const jsonPaths = ["data/previous.json","data/fetched.json","data/diff.json"];
        await pushViaGitHubAPI({ jsonPaths, htmlPaths });
      }

      if (process.env.CLEAR_DIFF === "1") {
        try { await atomicWrite(DIFF_JSON, "[]"); console.log("cleanup: diff.json cleared"); } catch {}
      }
    }

    console.log("\nDONE: steps finished.");
  } catch (err) {
    console.error("FATAL:", err?.stack || err);
    process.exit(1);
  }
})();
