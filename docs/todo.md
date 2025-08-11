# Refactor TODO (Ordered Plan)

このドキュメントは、LocalObjectManager の使用ブレ解消と GitHub プロバイダー責務整理に向けた作業順序とタスクを示します。コード修正は段階的に行うことを前提に、破壊的変更を最小化する順で並べています。

## フェーズ 0: 整理と合意形成（ドキュメントのみ）
- [x] 現状整理を明文化（LocalObjectManager の多重生成、GithubProvider の動的 import/context ハック、IStorageProvider への暗号責務漏れ）。
- [x] 目標設計を宣言（責務分離: Storage=Git I/O、LocalObjectManager=暗号/インデックス、SyncService=オーケストレーション、DI 一本化、workspaceUri/鍵の注入方針）。

## フェーズ 1: API 方針の確定（仕様・下準備）
- [x] IStorageProvider 仕様案を策定（`loadAndDecryptRemoteData()` を非推奨化し将来削除、暗号は SyncService 側へ移管）。
- [x] LocalObjectManager API 方針を確定：
  - [x] ctor は `workspaceUri` のみ必須、`context`/`encryptionKey` は受け取らない方針。
  - [x] すべてのメソッドで `LocalObjectManagerOptions { environmentId, encryptionKey }` を受ける形に統一。
- [x] workspaceUri 方針: すべて DI 注入。`getRootUri()` フォールバックは段階的に廃止。

## フェーズ 2: DI 体制の整備（非破壊の導入）
- [x] Container/ServiceLocator に LocalObjectManager の解決経路を公式化（既存の registerInstance の方針を明確化）。
- [x] 生成タイミングの方針を docs に明記：
  - [x] 起動時に workspaceUri で 1 インスタンス登録（現状維持）。
  - [x] AES 鍵はインスタンス保持せず、呼び出し時に options で受け渡す。

## フェーズ 3: GitHub プロバイダーの責務最小化（呼び出し側移動の準備）
- [x] GithubProvider から LocalObjectManager 依存を撤去する計画を確定：
  - [x] `encryptAndUploadWorkspaceFiles`/`loadAndDecryptRemoteData` を SyncService へ移管（順序/例外方針を docs に明記）。
  - [x] Provider は Git 操作（init/clone/fetch/reset/push 等）のみ担当。
- [x] 実装影響範囲（テスト・モック・呼び出し箇所）を洗い出し。

## フェーズ 4: SyncService/Factory の生成経路一本化
- [x] SyncServiceFactory/SyncService 内部の `new LocalObjectManager(...)` を廃止し、Container から取得する方針を定義。
- [x] AES 鍵・environmentId は `SyncService` から `LocalObjectManager` メソッド呼び出し毎に options で渡す設計を確定。
- [x] options の組み立て地点（`initializeSyncService` など）を明文化。

## フェーズ 5: 実コードのリファクタ第1弾（最小の変更）
- [x] GithubProvider: 動的 import と `vscode.extensions.getExtension(...).exports.context` ハックを削除（該当メソッドは非推奨 no-op 化）。
- [x] GithubProvider: `encryptAndUploadWorkspaceFiles`/`loadAndDecryptRemoteData` を非推奨化し、呼び出し元を SyncService に切替。
- [x] SyncService/Factory: LocalObjectManager を Container から解決して使用（未登録時はフォールバック）。
- [x] 暗号/復号/インデックス処理を SyncService に寄せ、Provider は Git 操作のみに限定。
- [x] テスト/モック整合性: Provider モックはそのまま（APIは保持）、呼び出しは SyncService 側で完結。

## フェーズ 6: 実コードのリファクタ第2弾（APIクリーンアップ）
- [x] LocalObjectManager: ctor から `context`/`encryptionKey` を削除し、`workspaceUri` のみ必須化。
- [x] LocalObjectManager: すべての内部パス解決を `this.workspaceUri` ベースに置換。
- [x] IStorageProvider: `loadAndDecryptRemoteData` を削除（SyncService 側に集約）。
- [x] GithubProvider: 暗号化関連メソッドを完全撤去（呼び出しはSyncServiceに移行済み、no-op部分を削除）。
- [x] LocalObjectManager: 暗号API（encrypt/decrypt）を options 経由でキー受け取りに変更、主要メソッドに options 受け渡しを拡張。
  
進捗: LocalObjectManager のコンストラクタを `workspaceUri` のみ（+任意の environmentId）に簡素化し、`context`/`encryptionKey` を削除済み。内部のパス解決は `this.workspaceUri` ベースへ全面置換済み（`getRootUri()` 依存を撤去）。`loadRemoteIndexes`/`saveIndexFile`/`saveBranchRef`/`readBranchRef` へ options を導入し、呼び出し側も更新済み。

## フェーズ 7: フォールバック削除と不変条件の導入
- [ ] workspaceUri フォールバック（temp ディレクトリ等）の削除。必須 DI に一本化。
- [ ] 不変条件のテスト追加：
  - [ ] LocalObjectManager: 生成後に workspaceUri が固定であること。
  - [ ] GithubProvider: コンストラクタ以降に workspaceUri が変更されないこと。

## フェーズ 8: ドキュメント更新とルール化
- [ ] README/docs 更新: 新アーキテクチャ図、責務分離、フロー（初期化/取り込み/同期）を更新。
- [ ] ESLint/規約: dynamic import と `vscode.extensions.getExtension` 使用の禁止方針を明記。
- [ ] CHANGELOG: 段階的な破壊的変更（インターフェース削除/メソッド移動）を反映。

## フェーズ 9: 追加テストと回帰確認
- [ ] 単体テスト（options 経由の鍵/環境ID、Provider の Git 操作分岐）。
- [ ] 統合テスト（新規/取り込み/増分で暗号/復号が SyncService 側で完結）。

---

メモ（設計判断の補足）
- AES 鍵はインスタンス保持しない（毎回 options で渡す）ことで、鍵ローテーション/キャッシュ無効化に強くする。
- マルチワークスペース対応は別スコープ。まずは単一ルート前提で `workspaceUri` を必須 DI とする。
- 実装はフェーズ 5 → 6 の順で小さな PR に分割するのが推奨。

- [ ] フェーズ 6 詳細タスク（実装チェックリスト）
- [x] `src/storage/LocalObjectManager.ts`:
  - [x] ctor から `context`/`encryptionKey` を完全削除（破壊的変更）。
  - [x] `this.workspaceUri` 由来で全パス解決を統一（`getRootUri()` 参照を置換）。
  - [ ] 例外メッセージを `workspaceUri` 起点の相対パスで統一。
  - [ ] 公開メソッドが `LocalObjectManagerOptions` を受けるか確認し、未対応があれば追加。
- [ ] `src/SyncService.ts`/`src/factories/SyncServiceFactory.ts`:
  - [x] `new LocalObjectManager(...)` を完全撤去し、ServiceLocator 経由に置換。
  - [x] すべての LocalObjectManager 呼び出しに `options` を確実に渡す（現状維持を確認）。
- [ ] `src/storage/GithubProvider.ts`/`src/interfaces/IStorageProvider.ts`:
  - [ ] 暗号関連メソッドの完全撤去（型・実装・export）。
  - [x] コンストラクタから未使用の `encryptionKey` 引数を削除、呼び出し側（Factory/Tests）を更新。
  - [x] 呼び出し側の import/参照を削除しビルド通過を確認。
- [ ] 破壊的変更の追従:
  - [ ] 影響ファイルの網羅検索（`encryptAndUploadWorkspaceFiles`/`loadAndDecryptRemoteData`/`getRootUri`）。
  - [ ] ドキュメントの該当記述を更新（本 todo, docs/github-provider-plan.md）。

## フェーズ 7 詳細タスク（フォールバック削除）
- [ ] `getRootUri()` を段階的に廃止：
  - [ ] 使用箇所を `this.workspaceUri` ベースに書き換え。
  - [ ] 廃止 deprecate コメントを削除し、関数自体を撤去。
- [ ] workspaceUri の不変条件を導入：
  - [ ] LocalObjectManager ctor で `!workspaceUri` の場合は `Error('workspaceUri is required')`。
  - [ ] Provider でも同様に必須化（設定/DI で保証）。
- [ ] VS Code ホストテスト追加：
  - [ ] 複数ワークスペースを開いた際に先頭/設定指定が使われることを明示し、他は対象外であることを確認。

## フェーズ 8 詳細タスク（ドキュメント/規約）
- [ ] README 更新：
  - [ ] 新アーキテクチャ図（責務分離: Provider=Git I/O, SyncService=暗号/復号/オーケストレーション, LocalObjectManager=暗号/インデックス）。
  - [ ] 初期化/取り込み/同期フロー図（簡略な時系列）。
- [ ] docs 更新：
  - [ ] `docs/github-provider-plan.md` の「完全撤去」に改版。
  - [ ] `docs/di-policy.md` に「直接 new 禁止」「dynamic import 禁止」を規約として明記。
- [ ] ESLint ルール/禁止事項：
  - [ ] `eslint.config.mjs` にパターンルールを追加（`no-restricted-imports` 等）。
  - [ ] `vscode.extensions.getExtension` の使用禁止を lint で担保（src 配下）。
- [ ] CHANGELOG 更新：
  - [ ] `feat(storage)!: remove crypto methods from IStorageProvider` などの破壊的変更ログ。

## フェーズ 9 詳細タスク（テスト計画）
- [ ] 単体テスト（`npm run test:unit` 対象）：
  - [ ] LocalObjectManager: options 経由の `encryptionKey` と `environmentId` が使用されること。
  - [ ] SyncService: すべての LocalObjectManager 呼び出しに options を渡すこと（モックで検証）。
  - [ ] GithubProvider モック: Git I/O のみを想定し、暗号責務を持たないこと。
- [ ] 統合テスト：
  - [ ] Initialize New Storage フローで、暗号/インデックス生成が SyncService+LocalObjectManager 側で完結すること。
  - [ ] Import Existing Storage フローで、clone→反映が正しく行われること。
  - [ ] Incremental Sync で pull→反映→push が分担通りに動作すること。
- [ ] VS Code ホストテスト：
  - [ ] コマンド（Initialize/Import/Sync）が例外なく完走し、`.secureNotes` の中間成果物の整合性を確認。

## フェーズ 10: 互換レイヤーと移行手順
- [ ] 互換シムの検討：
  - [ ] 旧 API 名で呼ばれた場合のガード（早期例外+メッセージ）を一時的に提供し、移行を誘導。
  - [ ] Deprecated 警告を logger で出し、次メジャーで削除予定を明記。
- [ ] 移行ガイド（MIGRATION.md 追加）：
  - [ ] 変更点一覧（破壊的/非破壊）。
  - [ ] 影響を受ける型・関数と置換先（例: `getRootUri` → `this.workspaceUri`）。
  - [ ] テスト更新の指針（Provider モックの責務縮小）。

## フェーズ 11: 運用・監視・ロールバック
- [ ] ロギング強化：
  - [ ] SyncService オーケストレーションにステップログを追加（開始/終了/例外）。
  - [ ] Git I/O の実行コマンドと結果を DEBUG ログに集約（鍵/内容は出さない）。
- [ ] ロールバック計画：
  - [ ] フェーズ 5/6 の PR を小さく分割し、段階リリース+容易な revert を可能にする。
  - [ ] 重要ファイルのバックアップ/比較をテストで担保（index のスナップショット）。

## 既知のリスク/未解決事項（Open Questions）
- [ ] マルチルート対応の要件定義と設計（切替時の鍵/環境IDの扱い）。
- [ ] 大規模ワークスペースでのパフォーマンス（差分検出/暗号処理の時間）。
- [ ] 競合解決ポリシーの UI/UX（自動/手動の境界、conflict-* の扱い）。
- [ ] 1Password 取得失敗時のフォールバック/リトライ戦略の明文化。

## 作業ブランチ/PR 指針（参考）
- [ ] PR1: Provider 呼び出しの SyncService への移行（非破壊）。
- [ ] PR2: LocalObjectManager の options 対応の拡充（非破壊）。
- [ ] PR3: 暗号 API の Provider からの完全撤去（破壊的）。
- [ ] PR4: LocalObjectManager ctor 簡素化（`context`/`encryptionKey` 削除、破壊的）。
- [ ] PR5: `getRootUri()` 撤去と不変条件テスト追加（破壊的）。
- [ ] PR6: ドキュメント/README/ESLint/CHANGELOG 更新。

## 参考リンク（本リポジトリ内）
- `docs/di-policy.md`: DI 体制とルール。
- `docs/github-provider-plan.md`: Provider 責務最小化の具体案。
- `docs/sync-factory-unification.md`: SyncService/Factory の一本化方針。
- `docs/source-code-mapping.md`: 機能とソースコードの対応表。
