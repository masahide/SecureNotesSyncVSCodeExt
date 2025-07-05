/**
 * テスト結果をキャプチャするスクリプト
 */

const { execSync } = require('child_process');
const fs = require('fs');

console.log('🧪 テスト実行とログキャプチャを開始します...');

try {
  console.log('📋 テスト実行中...');
  
  // テストを実行してログをキャプチャ
  const testOutput = execSync('npm run test', { 
    encoding: 'utf8',
    stdio: 'pipe'
  });
  
  // 結果をファイルに保存
  const timestamp = new Date().toISOString();
  const logContent = `
=== VS Code Extension Test Results ===
実行時刻: ${timestamp}

${testOutput}

=== テスト実行完了 ===
`;
  
  fs.writeFileSync('tmp_rovodev_actual_test_result.txt', logContent, 'utf8');
  
  console.log('✅ テスト実行完了');
  console.log('📄 結果は tmp_rovodev_actual_test_result.txt に保存されました');
  
  // 結果の概要を表示
  console.log('\n📊 テスト結果概要:');
  if (testOutput.includes('passing')) {
    const passingMatch = testOutput.match(/(\d+) passing/);
    const failingMatch = testOutput.match(/(\d+) failing/);
    
    if (passingMatch) {
      console.log(`✅ 成功: ${passingMatch[1]} テスト`);
    }
    if (failingMatch) {
      console.log(`❌ 失敗: ${failingMatch[1]} テスト`);
    } else {
      console.log('❌ 失敗: 0 テスト');
    }
  }
  
} catch (error) {
  console.error('❌ テスト実行でエラーが発生しました:');
  console.error(error.message);
  
  // エラー情報もファイルに保存
  const errorLog = `
=== VS Code Extension Test Error ===
実行時刻: ${new Date().toISOString()}

エラー内容:
${error.message}

標準出力:
${error.stdout || 'なし'}

標準エラー出力:
${error.stderr || 'なし'}

=== エラーログ終了 ===
`;
  
  fs.writeFileSync('tmp_rovodev_test_error.txt', errorLog, 'utf8');
  console.log('📄 エラーログは tmp_rovodev_test_error.txt に保存されました');
}