# GitHub Provider Responsibility Minimization (Phase 3)

目的: GitHub プロバイダーを Git I/O に特化させ、暗号/復号・インデックス操作は SyncService + LocalObjectManager に集約する。

## 方針（決定事項）
- Provider は Git 操作のみ担当（init/remote add/clone/fetch/reset/checkout/push）。
- 暗号/復号（`encryptAndUploadWorkspaceFiles` / `loadAndDecryptRemoteData`）は SyncService 側で実施。
- Provider から `LocalObjectManager` への依存は持たない（動的 import および `vscode.extensions.getExtension(...).exports.context` ハックは禁止）。
- 本フェーズでは破壊的変更は行わず、呼び出し元の移動（オーケストレーション）で置き換える。完全削除はフェーズ6。

## 対象フローと役割分担

### 1) Initialize New Storage
- SyncService:
  - LocalObjectManager.generateInitialIndex → saveIndexFile → saveWsIndexFile
  - Provider.initialize（Git 初期化）
  - Provider.upload（`git add/commit/push`）
- Provider: Git リポジトリ初期化と push のみ

### 2) Import Existing Storage
- SyncService:
  - Provider.cloneRemoteStorage（既存ローカルがあれば削除して clone）
  - Provider.pullRemoteChanges（冪等チェック込み）
  - LocalObjectManager.loadRemoteIndex → saveWsIndexFile
  - LocalObjectManager.reflectFileChanges（空→リモート最新へ展開）
- Provider: clone/fetch/reset などの Git のみ

### 3) Incremental Sync
- SyncService:
  - Provider.pullRemoteChanges（変更検出）
  - 変更があれば LocalObjectManager 操作（loadRemoteIndex, detect/resolve, saveEncryptedObjects）
  - Provider.upload（差分があれば push）
- Provider: fetch/reset/hard, push などの Git のみ

## 呼び出し移行手順（非破壊）
1. SyncService に暗号/復号フローを明示的に配置する（既存のロジックを集約）。
2. GithubProvider の `encryptAndUploadWorkspaceFiles` / `loadAndDecryptRemoteData` は非推奨マークを付け、SyncService から直接呼ばない。
3. IStorageProvider には現行シグネチャを残しつつ、呼び出し箇所を SyncService 側に切り替える。
4. テスト/モックは「Git I/O のみを担当する Provider」の前提に合わせて更新（暗号/復号を Provider モックに期待しない）。

## 影響範囲
- コード: SyncService（オーケストレーション集中）と GithubProvider（責務縮小）。
- テスト: IStorageProvider モックの責務見直し（`loadAndDecryptRemoteData` の呼び出しを削除/無効化）。
- Docs: README/アーキ図の責務区分更新（フェーズ8）。

## トランジション・リスクと対策
- リスク: 呼び出し移行中の重複/未呼び出し箇所が発生。
  - 対策: 検索置換対象のリスト化、PR 分割（フェーズ5: 呼び出し切替、フェーズ6: API削除）。
- リスク: 既存テストの前提崩れ。
  - 対策: Provider モックの更新を先に行い、暗号/復号は LocalObjectManager 経由のテストに寄せる。

## 完了条件（Phase 3）
- 設計ドキュメント（本書）の合意。
- todo.md のフェーズ3項目を「設計確定/影響洗い出し済み」としてチェック。

