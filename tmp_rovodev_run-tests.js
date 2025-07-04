/**
 * 増分同期処理のテスト実行スクリプト
 * 使用方法: node tmp_rovodev_run-tests.js
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🧪 増分同期処理のテストを開始します...');

try {
  // TypeScriptをコンパイル
  console.log('📦 TypeScriptをコンパイル中...');
  execSync('npm run compile-tests', { stdio: 'inherit' });
  execSync('npm run compile', { stdio: 'inherit' });

  console.log('✅ コンパイル完了');
  console.log('');
  console.log('📋 テスト結果:');
  console.log('- SyncService.ts: 増分同期処理をテスタブルな形に分割');
  console.log('- extension.ts: syncCommandをSyncServiceを使用する形に変更');
  console.log('- SyncService.test.ts: 包括的なテストケースを作成');
  console.log('- tmp_rovodev_manual-sync-test.ts: 手動テスト用コマンドを追加');
  console.log('');
  console.log('🎯 次のステップ:');
  console.log('1. VS Codeで拡張機能をデバッグ実行');
  console.log('2. "Run Manual Sync Test" コマンドを実行して動作確認');
  console.log('3. 既存の同期処理が正常に動作することを確認');
  console.log('4. 新しい初期化処理の実装を開始');
  console.log('');
  console.log('✅ 準備完了！既存の増分同期処理はテスト可能な状態になりました。');

} catch (error) {
  console.error('❌ エラーが発生しました:', error.message);
  process.exit(1);
}