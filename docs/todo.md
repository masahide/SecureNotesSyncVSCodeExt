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
- [ ] Container/ServiceLocator に LocalObjectManager の解決経路を公式化（既存の registerInstance の方針を明確化）。
- [ ] 生成タイミングの方針を docs に明記：
  - [ ] 起動時に workspaceUri で 1 インスタンス登録（現状維持）。
  - [ ] AES 鍵はインスタンス保持せず、呼び出し時に options で受け渡す。

## フェーズ 3: GitHub プロバイダーの責務最小化（呼び出し側移動の準備）
- [ ] GithubProvider から LocalObjectManager 依存を撤去する計画を確定：
  - [ ] `encryptAndUploadWorkspaceFiles`/`loadAndDecryptRemoteData` を SyncService へ移管（順序/例外方針を docs に明記）。
  - [ ] Provider は Git 操作（init/clone/fetch/reset/push 等）のみ担当。
- [ ] 実装影響範囲（テスト・モック・呼び出し箇所）を洗い出し。

## フェーズ 4: SyncService/Factory の生成経路一本化
- [ ] SyncServiceFactory/SyncService 内部の `new LocalObjectManager(...)` を廃止し、Container から取得する方針を定義。
- [ ] AES 鍵・environmentId は `SyncService` から `LocalObjectManager` メソッド呼び出し毎に options で渡す設計を確定。
- [ ] options の組み立て地点（`initializeSyncService` など）を明文化。

## フェーズ 5: 実コードのリファクタ第1弾（最小の変更）
- [ ] GithubProvider: 動的 import と `vscode.extensions.getExtension(...).exports.context` ハックを削除。
- [ ] GithubProvider: `encryptAndUploadWorkspaceFiles`/`loadAndDecryptRemoteData` を非推奨化し、呼び出し元を SyncService に切替。
- [ ] SyncService/Factory: LocalObjectManager を Container から解決して使用（`new` 撤廃）。
- [ ] 暗号/復号/インデックス処理を SyncService に寄せ、Provider は Git 操作のみに限定。
- [ ] テスト/モック更新: `loadAndDecryptRemoteData` 呼び出しを SyncService 経由に変更。

## フェーズ 6: 実コードのリファクタ第2弾（APIクリーンアップ）
- [ ] LocalObjectManager: ctor から `context`/`encryptionKey` を削除し、`workspaceUri` のみ必須化。
- [ ] LocalObjectManager: すべての内部パス解決を `this.workspaceUri` ベースに置換。
- [ ] IStorageProvider: `loadAndDecryptRemoteData` を削除（SyncService 側に集約）。
- [ ] GithubProvider: 暗号化関連メソッドを完全撤去。

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
