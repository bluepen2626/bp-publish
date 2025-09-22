// scripts/main.mjs
// fetch → diff → (差分ありなら) generate → reflect
// USE_GH_API=1 のときだけ GitHub Contents API(PAT) で data/*.json と output/対象HTML を直コミット

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ===== fingerprint =====
const VERSION = "main.mjs v2025-09-21e"; // bump for deploy check
console.log("[main] version:", VERSION);

// ===== helpers =====
function section(t) { console.log(`\n=== ${t} ===`); }
async function exists(p){ try { await fs.access(p); return true; } catch { return false; } }
async function readJSON(p, fallback = null) {
  try { return JSON.parse(await fs.readFile(p, "utf8")); }
  catch { return fallback; }
}
// [PATCH] 原子的に書き込む（途中読みを防ぐ）
async function atomicWrite(p, content) {
  const tmp = p + `.tmp-${Date.now()}-${process.pid}`;
  await fs.writeFile(tmp, typeof content === "string" ? content : JSON.stringify(content, null, 2), "utf8");
  await fs.rename(tmp, p);
}

function parseIdFilter() {
  const one = (process.env.ONLY_ID || "").trim();
  const many = (process.env.ONLY_IDS || "").trim();
  const s = new Set();
  if (one) s.add(one);
  if (many) many.split(",").map(x=>x.trim()).filter(Boolean).forEach(x=>s.add(x));
  return s;
}

// MODE: arg > env > default(all)
const argMode = (process.argv[2] || "").toLowerCase();
const envMode = (process.env.MODE || "").toLowerCase();
const MODE = ["fetch","build","all"].includes(argMode)
  ? argMode
  : ["fetch","build","all"].includes(envMode)
  ? envMode
  : "all";

// [PATCH] バルク（差分0でも強行）フラグを明示
const BULK_MODE = process.env.BUILD_ALL_WHEN_NO_DIFF === "1";

// paths
const DATA_DIR    = path.resolve(__dirname, "..", "data");
const OUT_DIR     = path.resolve(__dirname, "..", "output");
const SKIP_FLAG   = path.join(DATA_DIR, "skip.flag");
const DIFF_JSON   = path.join(DATA_DIR, "diff.json");
const FETCHED     = path.join(DATA_DIR, "fetched.json");       // agreement=true 限定
const FETCHED_ALL = path.join(DATA_DIR, "fetched_all.json");   // 全件

// プレースホルダー投入
async function placeholderFallback() {
  const fetchedArr = await readJSON(FETCHED, []);
  const force      = process.env.GEN_PLACEHOLDER === "1";
  const rebuildAll = process.env.REBUILD_EXISTING === "1";
  const idFilter   = parseIdFilter();
  const allow =
    (Array.isArray(fetchedArr) && fetchedArr.length === 0) ||
    force || rebuildAll || idFilter.size > 0;

  if (!allow) return 0;

  const allArr = await readJSON(FETCHED_ALL, []);
  if (!Array.isArray(allArr) || allArr.length === 0) return 0;

  const limit = Math.max(1, parseInt(process.env.PLACEHOLDER_LIMIT || "100", 10) || 100);

  const placeholders = allArr.filter(x => {
    const acf  = x?.acf || {};
    const id   = x?.id_code ?? acf.id_code;
    const code = x?.random_url_code ?? acf.random_url_code;
    const use  = x?.use_case ?? acf.use_case;
    return use === "placeholder" && id && code;
  });
  if (placeholders.length === 0) return 0;

  const targets = [];
  for (const it of placeholders) {
    const acf  = it?.acf || {};
    const id   = it?.id_code ?? acf.id_code;
    const code = it?.random_url_code ?? acf.random_url_code;

    if (idFilter.size > 0 && !idFilter.has(String(id))) continue;

    const outPath = path.join(OUT_DIR, `${id}-${code}.html`);
    if (rebuildAll) targets.push(it);
    else {
      try { await fs.access(outPath); } catch { targets.push(it); }
    }
  }
  if (targets.length === 0) return 0;

  const sliced = targets.length > limit ? targets.slice(0, limit) : targets;

  // [ORIG] await fs.writeFile(DIFF_JSON, JSON.stringify(sliced, null, 2));
  // [PATCH] 原子的に書く
  await atomicWrite(DIFF_JSON, sliced);

  const modeMsg = rebuildAll
    ? "REBUILD_EXISTING"
    : force
    ? "FORCED"
    : idFilter.size > 0
    ? `ONLY(${[...idFilter].join(",")})`
    : "MISSING_ONLY";
  console.log(`🧩 placeholder build: ${sliced.length} 件を diff.json に投入（${modeMsg} / limit=${limit}）`);

  if (await exists(SKIP_FLAG)) await fs.rm(SKIP_FLAG, { force: true });
  return sliced.length;
}

(async () => {
  try {
    console.log(`MODE=${MODE}`);
    let shouldSkipBuild = false;

    // 1) fetch
    if (MODE === "fetch" || MODE === "all") {
      section("1) fetch");
      const mod = await import("./fetch-id-info.mjs");
     
      
      // const fetchFn = mod.runFetch || mod.fetchData || mod.default;
  const fetchFn = mod.runFetch || mod.fetchData || mod.default;
　console.log("[main] using fetch function:", fetchFn && fetchFn.name);
      
      
      
      if (typeof fetchFn !== "function") {
        throw new TypeError("fetch module does not export a callable function (expected runFetch / fetchData / default).");
      }
      await fetchFn();

      // [PATCH] バルク時は skip.flag を即無効化（fetch側が出しても無視）
      if (BULK_MODE) {
        try { await fs.rm(SKIP_FLAG, { force: true }); } catch {}
        console.log("🟡 BULK MODE: skip.flag を無視/削除して続行");
      }

      // プレースホルダー先行投入（差分ゼロ対策）
      const usedBeforeSkipCheck = await placeholderFallback();

      const hasDiff = await exists(DIFF_JSON);
      // [ORIG]
      // if (!hasDiff && await exists(SKIP_FLAG) && usedBeforeSkipCheck === 0) {
      //   console.log("skip: skip.flag detected (no eligible records).");
      //   shouldSkipBuild = true;
      // }
      // [PATCH] バルク時は skip.flag を見ない
      if (!hasDiff) {
        if (!BULK_MODE && await exists(SKIP_FLAG) && usedBeforeSkipCheck === 0) {
          console.log("skip: skip.flag detected (no eligible records).");
          shouldSkipBuild = true;
        } else if (BULK_MODE) {
          // diff なくても後段でフォールバック生成に回す
          shouldSkipBuild = false;
        }
      }

      // 2) diff
      if (!shouldSkipBuild) {
        section("2) diff");
        const { extractDiff } = await import("./create-diff.mjs");
        await extractDiff();

        let cnt = 0;
        if (await exists(DIFF_JSON)) {
          const raw = await fs.readFile(DIFF_JSON, "utf-8").catch(() => "[]");
          const arr = JSON.parse(raw || "[]");
          cnt = Array.isArray(arr) ? arr.length : 0;
        }
        console.log(`diff size: ${cnt}`);

        if (cnt === 0) {
          // [PATCH] 差分ゼロ時のフォールバック（プレースホルダー）
          const used = await placeholderFallback();
          if (used === 0) {
            if (!BULK_MODE) {
              shouldSkipBuild = true;
            } else {
              console.log("🟡 BULK MODE: 差分なし＆フォールバック対象なし → 今回は build をスキップ");
              shouldSkipBuild = true;
            }
          }
        }
      }
    }

    // 3) generate → 4) reflect
    if (MODE === "build" || MODE === "all") {
      if (shouldSkipBuild) {
        console.log("skip: no build/reflect needed.");
      } else {
        section("3) generate (diff)");
        const { generateHtmlForDiff } = await import("./generate-html.mjs");
        await generateHtmlForDiff();

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
          // [ORIG] try { await fs.writeFile(DIFF_JSON, "[]"); console.log("cleanup: diff.json cleared"); } catch {}
          // [PATCH] 原子的にクリア
          try { await atomicWrite(DIFF_JSON, "[]"); console.log("cleanup: diff.json cleared"); } catch {}
        }
      }
    }

    console.log("\nDONE: steps finished.");
  } catch (err) {
    console.error("FATAL:", err?.stack || err);
    process.exit(1);
  }
})();
