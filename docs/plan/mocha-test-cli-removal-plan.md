# Mocha / VS Code Test CLI Removal Plan

## Goal

- [ ] `mocha` を依存関係から完全に除去する
- [ ] `@vscode/test-cli` を依存関係から完全に除去する
- [ ] `serialize-javascript <= 7.0.2` が `mocha` 経由で混入しない状態にする
- [ ] 既存の VS Code 拡張テストとユニットテストの実行手段を維持する

## Current State

- [ ] `package.json` の `devDependencies` に `mocha` と `@types/mocha` が存在する
- [ ] `package.json` の `devDependencies` に `@vscode/test-cli` が存在する
- [ ] `.vscode-test.mjs` が `mocha` 前提の設定を持っている
- [ ] `src/test/**/*.test.ts` の多くが `suite` / `test` / `setup` / `teardown` を利用している
- [ ] `package-lock.json` 上で `mocha -> serialize-javascript@6.0.2` の依存経路が存在する

## Strategy

- [ ] VS Code 起動は `@vscode/test-electron` を継続利用する
- [ ] テスト列挙と実行は `@vscode/test-cli` ではなく自前 bootstrap に置き換える
- [ ] テスト API は `node:test` をベースにする
- [ ] 既存テストコードへの変更量を抑えるため、`suite` / `test` / `setup` / `teardown` 互換レイヤーを追加する
- [ ] 依存除去後に `npm ls serialize-javascript --all` で脆弱バージョンの混入がないことを確認する

## Implementation Tasks

### 1. Test Runtime Design

- [ ] `src/test` 配下の現行エントリポイントを棚卸しする
- [ ] VS Code 拡張ホスト内で `node:test` を実行する bootstrap 方針を決定する
- [ ] `.test.ts` の探索方法を決める
- [ ] `test:headless` / `test:local` / `test:sync` の実行経路を整理する

### 2. Compatibility Layer

- [ ] `suite` を `node:test` ベースで扱う互換 API を設計する
- [ ] `test` を既存シグネチャで扱えるようにする
- [ ] `setup` / `teardown` を `beforeEach` / `afterEach` 相当にマップする
- [ ] 必要なら `suiteSetup` / `suiteTeardown` も将来拡張可能な形にしておく
- [ ] TypeScript 向けにグローバル型宣言ファイルを追加する

### 3. Custom Runner

- [ ] `@vscode/test-electron` から起動される新しいテストランナーを追加する
- [ ] bootstrap 内で互換 API をグローバル登録する
- [ ] すべての対象テストファイルを読み込む処理を追加する
- [ ] テスト結果に応じて適切な終了コードを返すようにする
- [ ] 失敗時に原因が追えるログを残す

### 4. Package and Script Changes

- [ ] `package.json` から `mocha` を削除する
- [ ] `package.json` から `@types/mocha` を削除する
- [ ] `package.json` から `@vscode/test-cli` を削除する
- [ ] `.vscode-test.mjs` を削除するか、新ランナー前提の構成に置き換える
- [ ] `test` / `test:headless` / `test:local` / `test:sync` の scripts を新構成へ更新する
- [ ] `pretest` / `verify` が新テスト構成で成立するか確認する

### 5. Test Source Adjustments

- [ ] 既存 21 件の `.test.ts` が互換レイヤーでそのまま動くか確認する
- [ ] `setup` / `teardown` 利用テスト 4 件を重点確認する
- [ ] 非同期テストが `node:test` 側でも正しく待機されるか確認する
- [ ] VS Code API モックを使うテストが新ランナーでも成立するか確認する
- [ ] 必要最小限のテストコード修正を行う

### 6. Lockfile and Dependency Verification

- [ ] 依存削除後にロックファイルを再生成する
- [ ] `npm ls mocha @vscode/test-cli serialize-javascript --all` を実行する
- [ ] `mocha` が依存ツリーから消えていることを確認する
- [ ] `@vscode/test-cli` が依存ツリーから消えていることを確認する
- [ ] `serialize-javascript <= 7.0.2` が依存ツリーに存在しないことを確認する

### 7. Regression Verification

- [ ] `pnpm run compile-tests` が通ることを確認する
- [ ] `pnpm run lint` が通ることを確認する
- [ ] `pnpm run test` が通ることを確認する
- [ ] `pnpm run test:sync` が通ることを確認する
- [ ] `pnpm run test:unit` が既存期待どおりに通ることを確認する

### 8. Documentation Updates

- [ ] `README.md` のテスト実行手順を更新する
- [ ] `AGENTS.md` / `GEMINI.md` に test framework 前提の記述があれば見直す
- [ ] 新しいテストランナーの制約と運用方法を `docs/` に記録する

## Risks

- [ ] VS Code 拡張ホスト上での `node:test` 実行方式が想定どおりに安定するか確認が必要
- [ ] `mocha` の TDD グローバル API と完全互換にはならない可能性がある
- [ ] 実行順や hook の挙動差で一部テストが不安定化する可能性がある
- [ ] 既存スクリプト利用者向けにコマンド変更の周知が必要

## Done Criteria

- [ ] `package.json` と `package-lock.json` から `mocha` / `@types/mocha` / `@vscode/test-cli` が除去されている
- [ ] `npm ls serialize-javascript --all` で脆弱対象バージョンが確認されない
- [ ] 既存テストスイートが新ランナーで再実行できる
- [ ] ドキュメントが新しいテスト実行方法に更新されている
