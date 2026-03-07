# Mocha / VS Code Test CLI Removal Plan

## Goal

- [x] `mocha` を依存関係から完全に除去する
- [x] `@vscode/test-cli` を依存関係から完全に除去する
- [x] `serialize-javascript <= 7.0.2` が `mocha` 経由で混入しない状態にする
- [x] 既存の VS Code 拡張テストとユニットテストの実行手段を維持する

## Current State

- [x] `package.json` の `devDependencies` に `mocha` と `@types/mocha` が存在する
- [x] `package.json` の `devDependencies` に `@vscode/test-cli` が存在する
- [x] `.vscode-test.mjs` が `mocha` 前提の設定を持っている
- [x] `src/test/**/*.test.ts` の多くが `suite` / `test` / `setup` / `teardown` を利用している
- [x] `package-lock.json` 上で `mocha -> serialize-javascript@6.0.2` の依存経路が存在する

## Strategy

- [x] VS Code 起動は `@vscode/test-electron` を継続利用する
- [x] テスト列挙と実行は `@vscode/test-cli` ではなく自前 bootstrap に置き換える
- [x] テスト API は軽量な自前 runner で互換維持する
- [x] 既存テストコードへの変更量を抑えるため、`suite` / `test` / `setup` / `teardown` 互換レイヤーを追加する
- [x] 依存除去後に `npm ls serialize-javascript --all` で脆弱バージョンの混入がないことを確認する

## Implementation Tasks

### 1. Test Runtime Design

- [x] `src/test` 配下の現行エントリポイントを棚卸しする
- [x] VS Code 拡張ホスト内で自前 runner を実行する bootstrap 方針を決定する
- [x] `.test.ts` の探索方法を決める
- [x] `test:headless` / `test:local` / `test:sync` の実行経路を整理する

### 2. Compatibility Layer

- [x] `suite` を既存テストコード互換で扱う API を設計する
- [x] `test` を既存シグネチャで扱えるようにする
- [x] `setup` / `teardown` を `beforeEach` / `afterEach` 相当にマップする
- [ ] 必要なら `suiteSetup` / `suiteTeardown` も将来拡張可能な形にしておく
- [x] TypeScript 向けにグローバル型宣言ファイルを追加する

### 3. Custom Runner

- [x] `@vscode/test-electron` から起動される新しいテストランナーを追加する
- [x] bootstrap 内で互換 API をグローバル登録する
- [x] すべての対象テストファイルを読み込む処理を追加する
- [x] テスト結果に応じて適切な終了コードを返すようにする
- [x] 失敗時に原因が追えるログを残す

### 4. Package and Script Changes

- [x] `package.json` から `mocha` を削除する
- [x] `package.json` から `@types/mocha` を削除する
- [x] `package.json` から `@vscode/test-cli` を削除する
- [x] `.vscode-test.mjs` を削除するか、新ランナー前提の構成に置き換える
- [x] `test` / `test:headless` / `test:local` / `test:sync` の scripts を新構成へ更新する
- [x] `pretest` / `verify` が新テスト構成で成立するか確認する

### 5. Test Source Adjustments

- [x] 既存 21 件の `.test.ts` が互換レイヤーでそのまま動くか確認する
- [x] `setup` / `teardown` 利用テスト 4 件を重点確認する
- [x] 非同期テストが自前 runner 側でも正しく待機されるようにする
- [x] VS Code API モックを使うテストが新ランナーでも成立するか確認する
- [x] 必要最小限のテストコード修正を行う

### 6. Lockfile and Dependency Verification

- [x] 依存削除後にロックファイルを再生成する
- [x] `npm ls mocha @vscode/test-cli serialize-javascript --all` を実行する
- [x] `mocha` が依存ツリーから消えていることを確認する
- [x] `@vscode/test-cli` が依存ツリーから消えていることを確認する
- [x] `serialize-javascript <= 7.0.2` が依存ツリーに存在しないことを確認する

### 7. Regression Verification

- [x] `npm run compile-tests` が通ることを確認する
- [x] `npm run lint` が通ることを確認する
- [x] `npm test` が通ることを確認する
- [x] `npm run test:sync` が通ることを確認する
- [x] `npm run test:unit` が既存期待どおりに通ることを確認する

### 8. Documentation Updates

- [x] `README.md` のテスト実行手順を更新する
- [x] `AGENTS.md` / `GEMINI.md` に test framework 前提の記述があれば見直す
- [x] 新しいテストランナーの制約と運用方法を `docs/` に記録する

## Risks

- [x] VS Code 拡張ホスト上での Electron 実行はサンドボックス環境に依存する
- [ ] `mocha` の TDD グローバル API と完全互換にはならない可能性がある
- [ ] 実行順や hook の挙動差で一部テストが不安定化する可能性がある
- [x] 既存スクリプト利用者向けにコマンド変更の周知が必要

## Done Criteria

- [x] `package.json` と `package-lock.json` から `mocha` / `@types/mocha` / `@vscode/test-cli` が除去されている
- [x] `npm ls serialize-javascript --all` で脆弱対象バージョンが確認されない
- [x] 既存テストスイートが新ランナーで再実行できる
- [x] ドキュメントが新しいテスト実行方法に更新されている

## Current Verification Notes

- [x] `npm run compile-tests` は成功
- [x] `npm run typecheck` は成功
- [x] `npm run lint` は成功
- [x] `npm run test:unit` は成功
- [x] `npm run test:sync` は成功
- [x] `npm test` は成功
