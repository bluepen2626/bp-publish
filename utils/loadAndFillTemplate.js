import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ひらがな→ローマ字変換マップ
const kanaMap = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', を: 'wo', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po'
};

// ひらがな文字列をローマ字に変換
function toRomaji(kana = '') {
  return kana
    .split('')
    .map(ch => kanaMap[ch] || '')
    .join('')
    .toUpperCase();
}

// 表示名を生成
function getDisplayName(format, last, first) {
  const l = last?.trim() || '';
  const f = first?.trim() || '';
  const lR = toRomaji(l);
  const fR = toRomaji(f);

  switch (format) {
    case 'full_hiragana':
      // ひらがなフルネーム
      return `${l} ${f}`;

    case 'last_initial':
      // ローマ字姓イニシャル + ローマ字名フル
      return `${lR.charAt(0)}.${fR}`;

    case 'initials':
    case 'initial_both':
    case 'both_initial':
      // ローマ字姓イニシャル + ローマ字名イニシャル
      return `${lR.charAt(0)}.${fR.charAt(0)}`;

    default:
      // デフォルトはひらがなフルネーム
      return `${l} ${f}`;
  }
}

// 年齢を生成
function getAgeFromBirthdate(birthdateStr) {
  if (!birthdateStr) return '';
  const birth = new Date(birthdateStr);
  const now = new Date();
  if (isNaN(birth)) return '';
  let ageY = now.getFullYear() - birth.getFullYear();
  let ageM = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) ageM--;
  if (ageM < 0) {
    ageY--;
    ageM += 12;
  }
  if (ageY < 6) return `${ageY}歳${ageM}ヶ月`;
  if (ageY < 10) return `${ageY}歳`;
  const decade = Math.floor(ageY / 10) * 10;
  const half = ageY % 10 < 5 ? '前半' : '後半';
  return `${decade}代${half}`;
}

// テンプレート読み込みと差し込み
export default function loadAndFillTemplate(useCase, acf) {
  const templatePath = path.join(
    __dirname,
    '..',
    'templates',
    `template-${useCase}.html`
  );
  if (!fs.existsSync(templatePath)) {
    throw new Error(`テンプレートが見つかりません: ${templatePath}`);
  }
  let template = fs.readFileSync(templatePath, 'utf-8');

  // 表示名フォーマットを取得
  const format = acf.name_display_format || acf.display_name_format || 'full_hiragana';
  const displayName = getDisplayName(
    format,
    acf.last_name_hira,
    acf.first_name_hira
  );

  const data = {
    ...acf,
    display_name: displayName,
    age: getAgeFromBirthdate(acf.birthdate),
    note: acf.note?.replace(/\n/g, '<br>') ?? '',
    has_allergy: acf.has_allergy || 'なし',
    has_disease: acf.has_disease || 'なし',
    disclaimer: acf.disclaimer || '',
    homepage_url: acf.homepage_url || '',
    emergency_contact: acf.emergency_contact || '',
    id_code: acf.id_code || '',
    random_url_code: acf.random_url_code || ''
  };

  // 差し込み
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    template = template.replace(regex, value || '');
  }

  // 未解決タグを警告
  const unmatched = template.match(/{{\s*[\w.-]+\s*}}/g);
  if (unmatched) {
    console.warn(`⚠️ 未解決タグ: ${unmatched.join(', ')}`);
  }
  return template;
}
