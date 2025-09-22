import { execSync } from 'child_process';

export default function gitAutoPush() {
  try {
    console.log('🚀 Git 自動Push処理を開始...');

    execSync('git config --global user.name "BluePenBot"');
    execSync('git config --global user.email "bot@blue-pen.jp"');

    // ステージング
    try {
      execSync('git add data/*.json output/*.html output-diff/*.html', { stdio: 'inherit' });
    } catch (addError) {
      console.warn('⚠️ git add に失敗しました。ファイルが存在しない可能性があります。');
      console.warn(addError.message || addError);
      return; // ❗ ここで完全に処理終了するのが重要
    }

    // 差分チェック
    try {
      execSync('git diff --cached --quiet');
      console.log('ℹ️ 差分がないため、Commit/PUSH をスキップしました。');
      return;
    } catch {
      // 差分ありなら通過して commit へ
    }

    // Commit & Push
    execSync('git commit -m "🔁 Update data and HTML files"', { stdio: 'inherit' });
    execSync('git push', { stdio: 'inherit' });

    console.log('✅ GitHub Push 完了！');

  } catch (err) {
    console.error('❌ Git Push 処理中にエラーが発生しました:', err.message || err);
  }
}
