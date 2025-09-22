// utils/template-loader.js

// ---- helpers ----
function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function nl2br(s = '') { return String(s || '').replace(/\r?\n/g, '<br>'); }
function safeText(s = '') { return nl2br(esc(s)); }
function joinJa(v) {
  if (Array.isArray(v)) return v.filter(Boolean).join('、');
  return String(v || '');
}
function removeSectionIfEmpty(html, className, keep) {
  const re = new RegExp(
    `<section[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>[\\s\\S]*?<\\/section>`,
    'g'
  );
  return html.replace(re, (m) => (keep ? m : ''));
}

// ACFの生年月日：'Y-m-d' / 'Ymd' / 'YYYY/MM/DD' / 'YYYY年M月D日' を全部パース
function parseBirthdate(raw) {
  if (!raw) return null;
  let s = String(raw).trim();

  // 8桁数字（Ymd）
  if (/^\d{8}$/.test(s)) {
    const y = +s.slice(0, 4);
    const m = +s.slice(4, 6);
    const d = +s.slice(6, 8);
    return new Date(y, m - 1, d);
  }
  // 年月日 → ハイフン
  s = s.replace(/[年月]/g, '-').replace(/日/g, '');
  // スラッシュ → ハイフン
  s = s.replace(/\//g, '-');

  const dt = new Date(s);
  return isNaN(dt) ? null : dt;
}

// 年齢表示文字列
function calcAgeString(rawBirth) {
  const bd = parseBirthdate(rawBirth);
  if (!bd) return '';

  const now = new Date();
  let months =
    (now.getFullYear() - bd.getFullYear()) * 12 +
    (now.getMonth() - bd.getMonth());
  if (now.getDate() < bd.getDate()) months -= 1;
  if (months < 0) return '';

  const years = Math.floor(months / 12);
  const rem = months % 12;

  if (months < 72) return `${years}歳${rem}ヶ月`; // 6歳未満は「歳＋ヶ月」
  if (years < 10) return `${years}歳`;            // 6〜9歳
  return `${years}歳`;                             // 10歳以上はシンプルに
}

// 氏名生成：display_name が無ければ 形式に応じて「姓 名」or「名 姓」
function buildDisplayName(acf = {}) {
  if (acf.display_name) return String(acf.display_name);

  const last = (acf.last_name_hira || '').trim();
  const first = (acf.first_name_hira || '').trim();
  if (!last && !first) return '';

  const fmt = String(acf.name_display_format || '').toLowerCase();
  const firstFirst = /first|given|名.*姓/.test(fmt); // 候補語が含まれていたら「名 姓」

  const a = firstFirst ? [first, last] : [last, first];
  // スペース無しが好みなら ' ' を '' に
  return a.filter(Boolean).join(' ');
}

// ---- main ----
export default function fillTemplate(tpl, acf = {}) {
  const displayName = buildDisplayName(acf);
  const ageStr = calcAgeString(acf.birthdate || acf.birthday);

  const certifications = joinJa(acf.medical_certifications);

  const map = {
    '{{display_name}}': esc(displayName),
    '{{age}}': esc(ageStr),

    '{{has_allergy}}': safeText(acf.has_allergy),
    '{{has_disease}}': safeText(acf.has_disease),
    '{{emergency_contact}}': safeText(acf.emergency_contact),
    '{{homepage_url}}': esc(acf.homepage_url || ''),

    // 追加3項目
    '{{current_medications}}': safeText(acf.current_medications),
    '{{medical_certifications}}': esc(certifications),
    '{{past_medical_history}}': safeText(acf.past_medical_history),
  };

  let html = String(tpl || '');
  for (const [k, v] of Object.entries(map)) {
    html = html.replaceAll(k, v);
  }

  // 空欄セクションは丸ごと非表示（任意）
  html = removeSectionIfEmpty(html, 'medications', !!acf.current_medications);
  html = removeSectionIfEmpty(html, 'certifications', !!(certifications && certifications.trim()));
  html = removeSectionIfEmpty(html, 'history', !!acf.past_medical_history);

  return html;
}
