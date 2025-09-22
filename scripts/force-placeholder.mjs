import fs from "fs/promises";
import path from "path";

const DATA = path.resolve("data");
const OUT  = path.resolve("output");
const PREV = path.join(DATA, "previous.json");
const DIFF = path.join(DATA, "diff.json");

const atomicWrite = async (p, content) => {
  const tmp = p + `.tmp-${Date.now()}-${process.pid}`;
  await fs.writeFile(tmp, typeof content === "string" ? content : JSON.stringify(content, null, 2), "utf8");
  await fs.rename(tmp, p);
};

const exists = async p => { try { await fs.access(p); return true; } catch { return false; } };

(async () => {
  try {
    if (!(await exists(PREV))) { console.error("❌ data/previous.json がありません"); process.exit(1); }
    const prevRaw = await fs.readFile(PREV, "utf8");
    const arr = JSON.parse(prevRaw || "[]");
    if (!Array.isArray(arr) || arr.length === 0) { console.error("❌ previous.json が空です"); process.exit(1); }

    // ID/CODEバリデーション（大文字OK）
    const ok = a => /^[0-9]{6}$/.test(String(a?.acf?.id_code ?? a?.id_code ?? "")) &&
                     /^[A-Za-z0-9]{24}$/.test(String(a?.acf?.random_url_code ?? a?.random_url_code ?? ""));

    const filtered = arr.filter(ok);
    if (filtered.length === 0) { console.error("❌ 有効なID/CODEがありません"); process.exit(1); }

    await atomicWrite(DIFF, filtered);
    try { await fs.rm(path.join(DATA,"skip.flag"), {force:true}); } catch {}

    console.log(`🟢 force-placeholder: diff.json に ${filtered.length} 件投入`);

    // 生成→反映
    const { generateHtmlForDiff } = await import("./generate-html.mjs");
    await generateHtmlForDiff();

    const { reflectToOutput } = await import("./sync-output.mjs");
    await reflectToOutput();

    console.log("✅ force-placeholder: generate/reflect 完了");
  } catch (e) {
    console.error("FATAL:", e?.stack || e);
    process.exit(1);
  }
})();
