// scripts/sync-output.mjs
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const ROOT       = path.resolve(__dirname, '..');
const DATA_DIR   = path.join(ROOT, 'data');
const DIFF_PATH  = path.join(DATA_DIR, 'diff.json');
const SRC_DIR    = path.join(ROOT, 'output-diff');  // 生成元
const DEST_DIR   = path.join(ROOT, 'output');       // 公開先

async function exists(p){ try { await fs.access(p); return true; } catch { return false; } }

export async function reflectToOutput() {
  // diff.json を読む（なければ何もしない）
  if (!(await exists(DIFF_PATH))) {
    console.log('skip reflect: diff.json not found');
    return;
  }
  const raw = await fs.readFile(DIFF_PATH, 'utf-8').catch(() => '[]');
  const diff = JSON.parse(raw || '[]');
  if (!Array.isArray(diff) || diff.length === 0) {
    console.log('skip reflect: empty diff');
    return;
  }

  // 反映先ディレクトリ
  await fs.mkdir(DEST_DIR, { recursive: true });

  let copied = 0, skipped = 0, missing = 0;
  for (const item of diff) {
    const id   = item?.id_code || item?.acf?.id_code;
    const code = item?.random_url_code || item?.acf?.random_url_code;
    if (!id || !code) { missing++; continue; }

    const name = `${id}-${code}.html`;
    const src  = path.join(SRC_DIR,  name);
    const dst  = path.join(DEST_DIR, name);

    if (!(await exists(src))) {
      // 差分に載ってるのにファイルが無い→生成フェーズで落ちた可能性
      console.log(`warn: source missing (skip): ${name}`);
      missing++;
      continue;
    }

    // 内容が同じならスキップ（静かに）
    let same = false;
    if (await exists(dst)) {
      const [a, b] = await Promise.all([
        fs.readFile(src, 'utf-8'),
        fs.readFile(dst, 'utf-8')
      ]);
      same = a === b;
    }

    if (same) {
      skipped++;
    } else {
      await fs.copyFile(src, dst);
      console.log(`📝 反映: ${name}`);
      copied++;
    }
  }

  console.log(`reflect summary: copied=${copied}, skipped=${skipped}, missing=${missing}`);
}
