/**
 * 増分同期処理のテスト実行用スクリプト
 * 既存の処理に影響がないことを確認するためのテストランナー
 */

import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    // VS Code拡張のテストを実行
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './SyncService.test.js');

    console.log('🧪 増分同期処理のテストを開始します...');
    console.log(`Extension path: ${extensionDevelopmentPath}`);
    console.log(`Test path: ${extensionTestsPath}`);

    // テストを実行
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: ['--disable-extensions']
    });

    console.log('✅ すべてのテストが正常に完了しました');
  } catch (err) {
    console.error('❌ テストが失敗しました:', err);
    process.exit(1);
  }
}

main();