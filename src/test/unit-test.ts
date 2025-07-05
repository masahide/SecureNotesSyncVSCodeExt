/**
 * VS Code API非依存の単体テスト例
 * TypeScriptから直接実行可能
 */

import * as assert from 'assert';

// AESキー形式の検証関数
function isValidAESKey(key: string): boolean {
  return key.length === 64 && /^[0-9a-fA-F]+$/.test(key);
}

// 時刻フォーマット関数
function formatCurrentTime(): string {
  const date = new Date();
  const pad = (n: number) => (n < 10 ? "0" + n : n.toString());
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// シンプルなテストランナー
function runTests() {
  console.log('🧪 TypeScript直接実行テストを開始...');
  let testCount = 0;
  let passedCount = 0;
  
  // テスト1: 文字列操作
  try {
    testCount++;
    const input = 'test-string';
    const expected = 'TEST-STRING';
    const result = input.toUpperCase();
    assert.strictEqual(result, expected);
    console.log('✅ 文字列操作のテスト: PASSED');
    passedCount++;
  } catch (error) {
    console.log('❌ 文字列操作のテスト: FAILED', error);
  }

  // テスト2: 数値計算
  try {
    testCount++;
    const a = 10;
    const b = 20;
    const result = a + b;
    assert.strictEqual(result, 30);
    console.log('✅ 数値計算のテスト: PASSED');
    passedCount++;
  } catch (error) {
    console.log('❌ 数値計算のテスト: FAILED', error);
  }

  // テスト3: 配列操作
  try {
    testCount++;
    const arr = [1, 2, 3];
    const doubled = arr.map(x => x * 2);
    assert.deepStrictEqual(doubled, [2, 4, 6]);
    console.log('✅ 配列操作のテスト: PASSED');
    passedCount++;
  } catch (error) {
    console.log('❌ 配列操作のテスト: FAILED', error);
  }

  // テスト4: AESキー形式の検証
  try {
    testCount++;
    const validKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const invalidKey = 'short';
    
    assert.strictEqual(isValidAESKey(validKey), true);
    assert.strictEqual(isValidAESKey(invalidKey), false);
    console.log('✅ AESキー形式の検証: PASSED');
    passedCount++;
  } catch (error) {
    console.log('❌ AESキー形式の検証: FAILED', error);
  }

  // テスト5: 時刻フォーマット
  try {
    testCount++;
    const timeStr = formatCurrentTime();
    const timeRegex = /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/;
    assert.ok(timeRegex.test(timeStr), `時刻フォーマットが正しくありません: ${timeStr}`);
    console.log('✅ 時刻フォーマットのテスト: PASSED');
    passedCount++;
  } catch (error) {
    console.log('❌ 時刻フォーマットのテスト: FAILED', error);
  }

  // 結果表示
  console.log(`\n📊 テスト結果: ${passedCount}/${testCount} passed`);
  
  if (passedCount === testCount) {
    console.log('🎉 すべてのテストが成功しました！');
    process.exit(0);
  } else {
    console.log('❌ 一部のテストが失敗しました');
    process.exit(1);
  }
}

// 直接実行された場合にテストを実行
if (require.main === module) {
  runTests();
}