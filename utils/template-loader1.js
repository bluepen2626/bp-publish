const fs = require('fs');
const path = require('path');

// 使用ケースごとのテンプレートファイル
const templateMap = {
  E: 'template-emergency.html',  // 通常モデル
  K: 'template-child.html',      // 子供モデル
  M: 'template-maternity.html',  // マタニティモデル
  G: 'template-grand.html',      // 高齢者モデル
  S: 'template-sample.html',     // サンプル用
};

// 表示名の整形
function formatDisplayName(acf) {
  const format = acf.display_name_format;
  const last = acf.last_name_hira || '';
  const first = acf.first_name_hira || '';
  const initialLast = last.charAt(0).toUpperCase();
  const initialFirst = first.charAt(0).toUpperCase();

  switch (format) {
    case 'full_hiragana':
      return `${last} ${first}`;
    case 'initial_last':
      return `${initialLast}.${first}`;
    case 'initial_both':
      return `${initialLast}.${initialFirst}`;
    default:
      return `${last} ${first}`;
  }
}

// 年齢の表示形式（幼児・学童・大人・高齢者対応）
function calculateAgeDisplay(birthdayStr) {
  if (!birthdayStr) return '';

  const birthday = new Date(birthdayStr);
  const today = new Date();

  let years = today.getFullYear() - birthday.getFullYear();
  let months = today.getMonth() - birthday.getMonth();

  if (today.getDate() < birthday.getDate()) months--;

  if (months < 0) {
    years--;
    months += 12;
  }

  if (years < 6) {
    return `${years}歳${months}ヶ月`;
  } else if (years < 10) {
    return `${years}歳`;
  } else {
    const decade = Math.floor(years / 10) * 10;
    const isLate = years % 10 >= 5;
    return `${decade}代${isLate ? '後半' : '前半'}`;
  }
}

// 用途別の注意文
function getDisclaimer(useCase) {
  switch (useCase) {
    case 'K':
      return 'この情報は緊急時の参考用です。医療行為の判断には使用しないでください。';
    case 'M':
      return 'このカードは医療用ではありません。必ず母子手帳の確認をお願いします。';
    case 'G':
      return 'このページの内容は参考情報です。正式な医療情報ではありません。';
    default:
      return 'このページは利用者の同意に基づいて表示されています。';
  }
}

// テンプレート読み込みと変数差し込み
function loadAndFillTemplate(useCaseChar, acf) {
  const templateName = templateMap[useCaseChar] || templateMap.E;
  const templatePath = path.join(__dirname, '../templates', templateName);

  let template = fs.readFileSync(templatePath, 'utf-8');

  const replacements = {
    '{{display_name}}': formatDisplayName(acf),
    '{{age}}': calculateAgeDisplay(acf.birthday),
    '{{has_allergy}}': acf.has_allergy || 'なし',
    '{{has_disease}}': acf.has_disease || 'なし',
    '{{emergency_contact}}': acf.emergency_contact || '未登録',
    '{{disclaimer}}': getDisclaimer(useCaseChar),
    '{{homepage_url}}': acf.homepage_url || '#',
  };

  for (const [key, value] of Object.entries(replacements)) {
    template = template.replace(new RegExp(key, 'g'), value);
  }

  return template;
}

module.exports = {
  loadAndFillTemplate,
};
