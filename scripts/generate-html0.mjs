// scripts/generate-html.mjs
// diff.json を読み、テンプレを選び HTML を output-diff/ に生成
// ローマ字変換: 外務省ヘボン式（パスポート）準拠を基準に可変（長音: omit/oh/macron/ou）

import fs from "fs/promises";
import fss from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ====== SETTINGS (ENVで上書き可) ======
const ROOT_DIR        = path.resolve(__dirname, "..");
const DATA_DIR        = path.join(ROOT_DIR, "data");
const DIFF_PATH       = path.join(DATA_DIR, "diff.json");
const FETCHED_PATH    = path.join(DATA_DIR, "fetched.json");
const TEMPLATES_DIR   = path.resolve(__dirname, "..", (process.env.TEMPLATES_DIR || "templates"));
const OUT_DIR         = path.resolve(__dirname, "..", (process.env.OUT_DIR || "output-diff"));

const TEMPLATE_PREFIX = process.env.TEMPLATE_PREFIX || "template-";
const TEMPLATE_EXT    = process.env.TEMPLATE_EXT || ".html";

const TEMPLATE_WHITELIST = (process.env.TEMPLATE_WHITELIST || "emergency,child,maternity,pet,senior,placeholder")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

const TEMPLATE_DEFAULT = (process.env.TEMPLATE_DEFAULT || "emergency").toLowerCase();

// 同意がない場合は本番テンプレ禁止（デフォルトON）
const REQUIRE_AGREEMENT_FOR_FULL =
  (process.env.REQUIRE_AGREEMENT_FOR_FULL ?? "true").toLowerCase() === "true";

// 正規登録リンク（wwwあり固定）
const REGISTER_BASE_URL = process.env.REGISTER_BASE_URL || "https://www.blue-pen.jp/register/";

// テンプレ別名
const TEMPLATE_ALIAS = {
  kids: "child", kid: "child", children: "child", child: "child",
  maternity: "maternity", pregnant: "maternity", pregnancy: "maternity",
  pet: "pet", animal: "pet",
  senior: "senior", elder: "senior", elderly: "senior",
  emergency: "emergency", placeholder: "placeholder"
};

// テンプレ毎の必須
const REQUIRED_BY_TEMPLATE = safeParseJSON(
  process.env.REQUIRED_BY_TEMPLATE ||
  '{"placeholder":[],"emergency":["name"],"child":["name"],"maternity":["name"],"pet":["name"],"senior":["name"]}'
);

// 単項目「氏名」候補（title は IDの恐れがあるので除外）
const NAME_KEYS = (process.env.NAME_KEYS ||
  "display_name,name,full_name,fullName,patient_name,contact_name"
).split(",").map(s => s.trim()).filter(Boolean);

// ====== UTILS ======
function safeParseJSON(s){ try { return JSON.parse(s); } catch { return {}; } }
function hasNonEmpty(v){ return v !== undefined && v !== null && String(v).trim().length > 0; }
function normStr(v){ return (v === undefined || v === null) ? "" : String(v); }
function filenameOf(id, code){ return `${String(id)}-${String(code)}.html`; }
async function ensureDir(p){ try { await fs.mkdir(p, { recursive: true }); } catch {} }
function trimOrNull(s){ return (typeof s === "string" && s.trim()) || null; }

function resolveTemplateKey(raw){
  const k = String(raw || "").toLowerCase().trim();
  const aliased = TEMPLATE_ALIAS[k] || k;
  return TEMPLATE_WHITELIST.includes(aliased) ? aliased : TEMPLATE_DEFAULT;
}

// ====================================================================
// Kana → Romaji (MOFA/Hepburn基準)  —— 仕様
// - し/ち/つ/ふ/じ/ぢ/づ = shi/chi/tsu/fu/ji/ji/zu
// - 拗音(ゃゅょ)、濁/半濁、ヴ、長音「ー」「おう/おお」
// - 促音「っ」= 次の子音の重複。ただし ch の前は "tch"、sh の前は "ssh"、j の前は "jj"
// - 撥音「ん」= b/m/p の前は m、母音/ y の前は n'（曖昧回避）
// - 長音の表記を切替: omit(既定: O/ U), oh(例: Ohta), macron(Ō/Ū), ou(例: Kou)
//   * ACF: acf.romaji_long_o, acf.romaji_long_u が優先。次に ENV: ROMAJI_LONG_O/U
// ====================================================================

const YO_DIGH = {
  "きゃ":"kya","きゅ":"kyu","きょ":"kyo","ぎゃ":"gya","ぎゅ":"gyu","ぎょ":"gyo",
  "しゃ":"sha","しゅ":"shu","しょ":"sho","じゃ":"ja","じゅ":"ju","じょ":"jo",
  "ちゃ":"cha","ちゅ":"chu","ちょ":"cho","にゃ":"nya","にゅ":"nyu","にょ":"nyo",
  "ひゃ":"hya","ひゅ":"hyu","ひょ":"hyo","びゃ":"bya","びゅ":"byu","びょ":"byo",
  "ぴゃ":"pya","ぴゅ":"pyu","ぴょ":"pyo","みゃ":"mya","みゅ":"myu","みょ":"myo",
  "りゃ":"rya","りゅ":"ryu","りょ":"ryo",
  "キャ":"kya","キュ":"kyu","キョ":"kyo","ギャ":"gya","ギュ":"gyu","ギョ":"gyo",
  "シャ":"sha","シュ":"shu","ショ":"sho","ジャ":"ja","ジュ":"ju","ジョ":"jo",
  "チャ":"cha","チュ":"chu","チョ":"cho","ニャ":"nya","ニュ":"nyu","ニョ":"nyo",
  "ヒャ":"hya","ヒュ":"hyu","ヒョ":"hyo","ビャ":"bya","ビュ":"byu","ビョ":"byo",
  "ピャ":"pya","ピュ":"pyu","ピョ":"pyo","ミャ":"mya","ミュ":"myu","ミョ":"myo",
  "リャ":"rya","リュ":"ryu","リョ":"ryo",
};

const BASE = {
  "あ":"a","い":"i","う":"u","え":"e","お":"o",
  "か":"ka","き":"ki","く":"ku","け":"ke","こ":"ko",
  "さ":"sa","し":"shi","す":"su","せ":"se","そ":"so",
  "た":"ta","ち":"chi","つ":"tsu","て":"te","と":"to",
  "な":"na","に":"ni","ぬ":"nu","ね":"ne","の":"no",
  "は":"ha","ひ":"hi","ふ":"fu","へ":"he","ほ":"ho",
  "ま":"ma","み":"mi","む":"mu","め":"me","も":"mo",
  "や":"ya","ゆ":"yu","よ":"yo",
  "ら":"ra","り":"ri","る":"ru","れ":"re","ろ":"ro",
  "わ":"wa","ゐ":"i","ゑ":"e","を":"o","ん":"N",       // N は後処理で n/m/n'
  "が":"ga","ぎ":"gi","ぐ":"gu","げ":"ge","ご":"go",
  "ざ":"za","じ":"ji","ず":"zu","ぜ":"ze","ぞ":"zo",
  "だ":"da","ぢ":"ji","づ":"zu","で":"de","ど":"do",
  "ば":"ba","び":"bi","ぶ":"bu","べ":"be","ぼ":"bo",
  "ぱ":"pa","ぴ":"pi","ぷ":"pu","ぺ":"pe","ぽ":"po",
  "ゔ":"vu",
  "ぁ":"a","ぃ":"i","ぅ":"u","ぇ":"e","ぉ":"o",
  "ゃ":"ya","ゅ":"yu","ょ":"yo",
  "っ":"*","ー":"-", // * = 促音、- = 長音マーカー（後処理）

  // カタカナ
  "ア":"a","イ":"i","ウ":"u","エ":"e","オ":"o",
  "カ":"ka","キ":"ki","ク":"ku","ケ":"ke","コ":"ko",
  "サ":"sa","シ":"shi","ス":"su","セ":"se","ソ":"so",
  "タ":"ta","チ":"chi","ツ":"tsu","テ":"te","ト":"to",
  "ナ":"na","ニ":"ni","ヌ":"nu","ネ":"ne","ノ":"no",
  "ハ":"ha","ヒ":"hi","フ":"fu","ヘ":"he","ホ":"ho",
  "マ":"ma","ミ":"mi","ム":"mu","メ":"me","モ":"mo",
  "ヤ":"ya","ユ":"yu","ヨ":"yo",
  "ラ":"ra","リ":"ri","ル":"ru","レ":"re","ロ":"ro",
  "ワ":"wa","ヰ":"i","ヱ":"e","ヲ":"o","ン":"N",
  "ガ":"ga","ギ":"gi","グ":"gu","ゲ":"ge","ゴ":"go",
  "ザ":"za","ジ":"ji","ズ":"zu","ゼ":"ze","ゾ":"zo",
  "ダ":"da","ヂ":"ji","ヅ":"zu","デ":"de","ド":"do",
  "バ":"ba","ビ":"bi","ブ":"bu","ベ":"be","ボ":"bo",
  "パ":"pa","ピ":"pi","プ":"pu","ペ":"pe","ポ":"po",
  "ヴ":"vu",
  "ァ":"a","ィ":"i","ゥ":"u","ェ":"e","ォ":"o",
  "ャ":"ya","ュ":"yu","ョ":"yo",
  "ッ":"*","ー":"-"
};

// その文字が「o段」か？（長音処理用）
const O_ROW = new Set(["お","こ","そ","と","の","ほ","も","よ","ろ","を","オ","コ","ソ","ト","ノ","ホ","モ","ヨ","ロ","ヲ"]);
// u段（「う」で伸ばす対象の直前）判定に使う
function endsWithOVowel(rom) { return /o$/i.test(rom); }
function endsWithUVowel(rom) { return /u$/i.test(rom); }

// 長音表記の方針
function resolveLongStrategy(acf, vowel /*'o'|'u'*/){
  const key = vowel === "o" ? "romaji_long_o" : "romaji_long_u";
  const acfPref = String(acf?.[key] || "").toLowerCase();
  if (["omit","oh","macron","ou"].includes(acfPref)) return acfPref;
  const envPref = String(process.env[key.toUpperCase()] || "").toLowerCase(); // ROMAJI_LONG_O/U
  if (["omit","oh","macron","ou"].includes(envPref)) return envPref;
  return vowel === "o" ? "omit" : "omit"; // 既定: パスポート基準で長音記号なし
}
function applyLongVowel(strategy, base /* 'o' or 'u' */){
  switch (strategy) {
    case "oh":     return base + "h";  // Ohta, Ohno
    case "macron": return base === "o" ? "ō" : "ū";
    case "ou":     return base + "u";  // Kou, Tou
    case "omit":
    default:       return base;        // O / U（既定）
  }
}

// かな→ローマ字（Hepburn/MOFAベース）
function kanaToRomajiMOFA(input = "", acf = {}){
  if (!input) return "";
  // 拗音の先読み置換
  let s = String(input).replace(/\s+/g, " ").trim();
  s = s.replace(/(..?)([ゃゅょャュョ])/g, (m,a,b)=> YO_DIGH[a+b] ? `§${YO_DIGH[a+b]}§` : m);

  let out = "";
  let prevKana = "";
  for (let i=0; i<s.length; i++){
    const ch = s[i];

    // 先に §…§ （拗音マーカー）を剥がす
    if (ch === "§") {
      // §romaji§ の形式
      const j = s.indexOf("§", i+1);
      if (j > i){
        const rom = s.slice(i+1, j);
        out += rom;
        i = j;
        prevKana = ""; // ローマ字直書き扱い
        continue;
      }
    }

    const rom = BASE[ch];

    // 促音
    if (rom === "*"){
      // 次のローマ字を見て子音重ね
      const next = s[i+1];
      // 次2文字が拗音なら §…§ を参照
      if (next === "§") {
        const j = s.indexOf("§", i+2);
        const nextRom = j>i ? s.slice(i+1, j+1).replace(/§/g,"") : "";
        if (/^ch/i.test(nextRom)) out += "t";      // っ+ch = tch
        else if (/^sh/i.test(nextRom)) out += "s"; // っ+sh = ssh
        else if (/^[a-z]/i.test(nextRom)) out += nextRom[0];
      } else {
        const nx = BASE[next] || "";
        if (/^ch/i.test(nx)) out += "t";
        else if (/^sh/i.test(nx)) out += "s";
        else if (/^[a-z]/i.test(nx)) out += nx[0];
      }
      prevKana = ch;
      continue;
    }

    // 長音マーカー（カナ「ー」）：直前の母音を伸ばす
    if (rom === "-"){
      if (out) {
        const lastV = out.match(/[aeiou]$/i)?.[0]?.toLowerCase();
        if (lastV === "o" || lastV === "u"){
          const strat = resolveLongStrategy(acf, lastV);
          // 末尾の母音を置換
          out = out.replace(/[ou]$/i, applyLongVowel(strat, lastV));
        }
      }
      prevKana = ch;
      continue;
    }

    // 通常文字
    if (rom){
      // 「おう」「おお」長音：直前が o系なら長音化
      if ((ch === "う" || ch === "ウ") && endsWithOVowel(out) && O_ROW.has(prevKana)) {
        const strat = resolveLongStrategy(acf, "o");
        out = out.replace(/o$/i, applyLongVowel(strat, "o"));
        prevKana = ch;
        continue;
      }
      if ((ch === "お" || ch === "オ") && endsWithOVowel(out) && O_ROW.has(prevKana)) {
        const strat = resolveLongStrategy(acf, "o");
        out = out.replace(/o$/i, applyLongVowel(strat, "o"));
        prevKana = ch;
        continue;
      }

      // 「うう」による長音（例外的だが念のため）
      if ((ch === "う" || ch === "ウ") && endsWithUVowel(out) && (prevKana === "う" || prevKana === "ウ")){
        const strat = resolveLongStrategy(acf, "u");
        out = out.replace(/u$/i, applyLongVowel(strat, "u"));
        prevKana = ch;
        continue;
      }

      out += rom;
      prevKana = ch;
      continue;
    }

    // 非かな（漢字・記号など）はそのまま
    out += ch;
    prevKana = ch;
  }

  // 撥音 N の同化/曖昧回避
  // b/m/p の前は m、母音/ y の前は n'
  out = out
    .replace(/N([bmpBMP])/g, "m$1")
    .replace(/N([aiueoyAIUEOY])/g, "n'$1")
    .replace(/N/g, "n");

  // 単語頭を大文字化（名前想定）
  out = out.split(" ").map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
  return out;
}

// ひらがな/カタカナの姓名からローマ字を作る（姓→名）
function romajiFromKanaPair(lnHira="", fnHira="", acf = {}){
  const ln = kanaToRomajiMOFA(lnHira, acf);
  const fn = kanaToRomajiMOFA(fnHira, acf);
  return (ln || fn) ? `${ln}${ln&&fn?" ":""}${fn}` : "";
}

// ============ 氏名抽出 ===============
function buildCompositeName(parts){
  const a = parts.map(trimOrNull).filter(Boolean);
  return a.length ? a.join(" ") : null;
}
function pickName(post){
  const acf = post?.acf || {};
  const isIdLikeTitle = (t) => {
    const s  = String(t || "").trim();
    const id = String(acf.id_code || "").trim();
    return !s || /^\d{6}$/.test(s) || (id && s === id);
  };

  // 単項目キー
  for (const k of NAME_KEYS) {
    if (hasNonEmpty(acf?.[k])) return String(acf[k]).trim();
  }

  // タイトルを氏名として採用（ID見た目は除外）
  if (hasNonEmpty(post?.title?.rendered) && !isIdLikeTitle(post.title.rendered)) {
    return String(post.title.rendered).trim();
  }

  // 漢字 / ひらがな / カナ / 英字の順で合成
  const nameKanji = buildCompositeName([acf.last_name_kanji, acf.first_name_kanji])
                 || buildCompositeName([acf.last_nameKanji, acf.first_nameKanji]);
  if (nameKanji) return nameKanji;

  const nameHira = buildCompositeName([acf.last_name_hira, acf.first_name_hira])
                || buildCompositeName([acf.last_name_hiragana, acf.first_name_hiragana]);
  if (nameHira) return nameHira;

  const nameKana = buildCompositeName([acf.last_name_kana, acf.first_name_kana]);
  if (nameKana) return nameKana;

  const nameEn = buildCompositeName([acf.last_name_en, acf.first_name_en])
              || buildCompositeName([acf.last_name, acf.first_name]);
  if (nameEn) return nameEn;

  const single = trimOrNull(acf.last_name) || trimOrNull(acf.first_name);
  if (single) return single;

  return "";
}

// ============ 年齢 ===============
function parseDob(acf = {}) {
  const raw = trimOrNull(acf.birthdate || acf.birthday || acf.birth_day || acf.dob);
  if (raw) {
    const s = raw.replace(/[/.]/g, "-");
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const y  = Number(acf.birth_year || acf.birth_yyyy || acf.birthYear);
  const mo = Number(acf.birth_month || acf.birth_mm || acf.birthMonth);
  const d  = Number(acf.birth_day || acf.birth_dd || acf.birthDay);
  if (y && mo && d) return new Date(y, mo - 1, d);
  return null;
}
function calcAgeYears(acf = {}) {
  const dob = parseDob(acf);
  if (!dob || isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age >= 0 ? age : null;
}

// 名前有無の総合判定
function hasNonEmptyFromKeys(post){
  for (const k of NAME_KEYS) {
    if (hasNonEmpty(post?.acf?.[k])) return true;
  }
  const acf = post?.acf || {};
  if (buildCompositeName([acf.last_name_kanji, acf.first_name_kanji])) return true;
  if (buildCompositeName([acf.last_name_hira,  acf.first_name_hira ])) return true;
  if (buildCompositeName([acf.last_name_kana,  acf.first_name_kana ])) return true;
  if (buildCompositeName([acf.last_name_en,    acf.first_name_en   ])) return true;
  if (trimOrNull(acf.last_name) || trimOrNull(acf.first_name)) return true;
  return false;
}

// イニシャル/伏せ字
function initialFromLatin(s = "") {
  const m = String(s).match(/[A-Za-z]/);
  return m ? m[0].toUpperCase() : "";
}
function firstChar(s = "") {
  const t = String(s).trim();
  return t ? t[0] : "";
}
function romajiInitialFromWord(word=""){
  const m = String(word).trim().match(/[A-Za-z]/);
  return m ? m[0].toUpperCase() : "";
}

function buildNameVariants(acf = {}, fullName = ""){
  const ln_kanji = normStr(acf.last_name_kanji || acf.last_nameKanji || acf.last_name);
  const fn_kanji = normStr(acf.first_name_kanji || acf.first_nameKanji || acf.first_name);
  const ln_hira  = normStr(acf.last_name_hira || acf.last_name_hiragana);
  const fn_hira  = normStr(acf.first_name_hira || acf.first_name_hiragana);
  const ln_en    = normStr(acf.last_name_en);
  const fn_en    = normStr(acf.first_name_en);

  // ローマ字（姓→名）。ひらがな優先 / 無ければ fullName を機械変換
  const romaji_full = romajiFromKanaPair(ln_hira, fn_hira, acf) || kanaToRomajiMOFA(fullName, acf);

  const FI = initialFromLatin(fn_en) || romajiInitialFromWord(kanaToRomajiMOFA(fn_hira, acf)) || initialFromLatin(fn_kanji) || firstChar(fn_kanji);
  const LI = initialFromLatin(ln_en) || romajiInitialFromWord(kanaToRomajiMOFA(ln_hira, acf)) || initialFromLatin(ln_kanji) || firstChar(ln_kanji);

  const initials_en                = (FI && LI) ? `${FI}.${LI}.` : "";     // T.Y.
  const initials_en_surnameFirst   = (FI && LI) ? `${LI}.${FI}.` : "";     // Y.T.
  const surname_any_en_or_ja       = ln_en || ln_kanji || ln_hira;
  const surname_initial_en         = surname_any_en_or_ja ? `${surname_any_en_or_ja} ${FI ? FI + "." : ""}` : "";

  const [romLn, romFn] = (romaji_full || "").split(" ");
  const RFI = romajiInitialFromWord(romFn || "");
  const RLI = romajiInitialFromWord(romLn || "");
  const initials_romaji              = (RFI && RLI) ? `${RLI}.${RFI}.` : "";     // Y.T.
  const surname_initial_romaji       = romLn ? `${romLn} ${RFI ? RFI + "." : ""}` : "";

  const masked = (fullName || "").trim()
    ? fullName.split(/\s+/).map(w => w.length <= 1 ? w : (w[0] + "＊".repeat(Math.min(2, w.length - 1)))).join(" ")
    : "未設定";

  return {
    romaji_full,
    initials_en, initials_en_surnameFirst, surname_initial_en,
    initials_romaji, surname_initial_romaji,
    masked
  };
}

function chooseNameDisplay(acf = {}, variants, fullName = "") {
  // ACF: name_display_format / display_name_format
  const fmt = String(acf.name_display_format || acf.display_name_format || "full").toLowerCase();
  switch (fmt) {
    case "initials":                return variants.initials_en_surnameFirst || variants.initials_en || variants.surname_initial_en || fullName || "未設定";
    case "surname_initial":         return variants.surname_initial_en || fullName || "未設定";
    case "masked":                  return variants.masked || fullName || "未設定";
    case "romaji":                  return variants.romaji_full || fullName || "未設定";
    case "romaji_initials":         return variants.initials_romaji || variants.romaji_full || fullName || "未設定";
    case "surname_initial_romaji":  return variants.surname_initial_romaji || variants.romaji_full || fullName || "未設定";
    case "full":
    default:                        return fullName || "未設定";
  }
}

function decideTemplateFor(post){
  const acf  = post?.acf || {};
  const mode = String(acf.build_mode || "auto").toLowerCase();
  const reqKey = resolveTemplateKey(acf.template_key || TEMPLATE_DEFAULT);

  if (mode === "placeholder") return "placeholder";
  if (mode === "full") {
    if (REQUIRE_AGREEMENT_FOR_FULL && acf.agreement !== true) return "placeholder";
    return reqKey;
  }

  const nameExists = hasNonEmptyFromKeys(post) || hasNonEmpty(pickName(post));
  const required = Array.isArray(REQUIRED_BY_TEMPLATE[reqKey]) ? REQUIRED_BY_TEMPLATE[reqKey] : ["name"];
  const meets = required.every(key => key === "name" ? nameExists : hasNonEmpty(acf?.[key]));
  if (!meets) return "placeholder";
  if (REQUIRE_AGREEMENT_FOR_FULL && acf.agreement !== true) return "placeholder";
  return reqKey;
}

// テンプレキャッシュ
const templateCache = new Map();
async function loadTemplateOrFallback(tmplKey){
  const tryKeys = [tmplKey, "placeholder", TEMPLATE_DEFAULT];
  for (const key of tryKeys) {
    const rel = `${TEMPLATE_PREFIX}${key}${TEMPLATE_EXT}`;
    const p = path.join(TEMPLATES_DIR, rel);
    if (templateCache.has(p)) return { html: templateCache.get(p), path: p };
    try {
      const html = await fs.readFile(p, "utf-8");
      templateCache.set(p, html);
      return { html, path: p };
    } catch {}
  }
  throw new Error(`template not found (key=${tmplKey})`);
}

function buildTokenMap(post){
  const acf   = post?.acf || {};
  const name0 = pickName(post);
  const name  = name0 && name0.trim() ? name0.trim() : "未設定";

  // 表示バリエーション
  const nameVars    = buildNameVariants(acf, name);
  const nameDisplay = chooseNameDisplay(acf, nameVars, name);

  const ageYears = calcAgeYears(acf);
  const ageText  = (ageYears !== null) ? `${ageYears} 歳` : "未設定";

  const base = {
    id_code:           normStr(acf.id_code ?? post?.id_code),
    random_url_code:   normStr(acf.random_url_code ?? post?.random_url_code),
    use_case:          normStr(acf.use_case ?? post?.use_case ?? "placeholder"),
    template_key:      normStr(acf.template_key ?? ""),
    build_mode:        normStr(acf.build_mode ?? "auto"),
    title:             normStr(post?.title?.rendered ?? ""),
    name,                               // フルネーム
    name_display:      nameDisplay,     // 表示用
    name_romaji:       nameVars.romaji_full,
    name_initials_en:  nameVars.initials_en,
    name_surname_initial_en: nameVars.surname_initial_en,
    name_initials_romaji:    nameVars.initials_romaji,
    name_surname_initial_romaji: nameVars.surname_initial_romaji,
    name_masked:       nameVars.masked,
    age:               ageText,
    age_years:         ageYears ?? "",
    agreement:         acf.agreement === true ? "true" : "false",
  };

  const register_url = `${REGISTER_BASE_URL}?id=${encodeURIComponent(base.id_code)}&code=${encodeURIComponent(base.random_url_code)}`;

  // ACFフラット化
  const acfFlat = {};
  for (const [k, v] of Object.entries(acf)) acfFlat[k] = normStr(v);

  // 氏名の別名キーにも埋める
  const nameAliases = [
    "display_name", "full_name", "fullName",
    "patient_name", "contact_name", "person_name",
    "name_jp", "name_kanji", "name_hira"
  ];
  for (const key of nameAliases) {
    if (!acfFlat[key] || !acfFlat[key].trim()) acfFlat[key] = name;
  }

  return { ...acfFlat, acf: acfFlat, ...base, register_url };
}

function renderTemplate(rawHtml, tokens){
  return rawHtml.replace(/\{\{\s*([a-zA-Z0-9_\.]+)\s*\}\}/g, (_, key) => {
    if (key.includes(".")) {
      const parts = key.split(".");
      let cur = tokens;
      for (const p of parts) {
        if (cur && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p];
        else { cur = ""; break; }
      }
      return normStr(cur);
    }
    return normStr(tokens[key]);
  });
}

// 既存と同一なら書き込みスキップ
async function writeIfChanged(outPath, html){
  if (fss.existsSync(outPath)) {
    try {
      const cur = await fs.readFile(outPath, "utf-8");
      if (cur === html) return false;
    } catch {}
  }
  await fs.writeFile(outPath, html, "utf-8");
  return true;
}

// ====== MAIN ======
export async function generateHtmlForDiff(){
  await ensureDir(OUT_DIR);

  const [diffRaw, fetchedRaw] = await Promise.all([
    fs.readFile(DIFF_PATH, "utf-8").catch(() => "[]"),
    fs.readFile(FETCHED_PATH, "utf-8").catch(() => "[]"),
  ]);
  const diffArr    = safeParseJSON(diffRaw);
  const fetchedArr = safeParseJSON(fetchedRaw);

  const entries = Array.isArray(diffArr) ? diffArr : [];
  console.log(`📄 差分エントリ: ${entries.length} 件`);
  if (entries.length === 0) { console.log("🎯 HTML生成対象: 0 件"); return; }

  const byKey = new Map();
  for (const p of fetchedArr) {
    const id   = p?.acf?.id_code;
    const code = p?.acf?.random_url_code;
    if (id && code) byKey.set(`${id}::${code}`, p);
  }

  const seen = new Set();
  let built = 0, unchanged = 0, skipped = 0, failed = 0;

  for (const item of entries) {
    const id   = item?.id_code || item?.acf?.id_code;
    const code = item?.random_url_code || item?.acf?.random_url_code;
    if (!id || !code) { skipped++; continue; }

    const key = `${id}::${code}`;
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);

    const post = byKey.get(key) || item;

    const tmplKey = decideTemplateFor(post);
    let tpl;
    try {
      tpl = await loadTemplateOrFallback(tmplKey);
    } catch (e) {
      console.error(`❌ テンプレ読み込み失敗: ${tmplKey} - ${e?.message || e}`);
      failed++; continue;
    }

    const tokens = buildTokenMap(post);
    const html   = renderTemplate(tpl.html, tokens);

    const filename = filenameOf(id, code);
    const outPath  = path.join(OUT_DIR, filename);

    try {
      const changed = await writeIfChanged(outPath, html);
      if (changed) {
        console.log(`📝 生成: ${filename}（テンプレ: ${tmplKey} / ${path.basename(tpl.path)}）`);
        built++;
      } else {
        console.log(`↔️ 変更なし: ${filename}`);
        unchanged++;
      }
    } catch (e) {
      console.error(`❌ 書き込み失敗: ${filename} - ${e?.message || e}`);
      failed++;
    }
  }

  console.log(`✅ 完了: 生成=${built}, 変更なし=${unchanged}, スキップ=${skipped}, 失敗=${failed}`);
}

if (process.argv[1] && process.argv[1].endsWith("generate-html.mjs")) {
  generateHtmlForDiff().catch(err => {
    console.error("FATAL(generate):", err?.stack || err);
    process.exit(1);
  });
}
