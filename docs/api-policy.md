# API Policy (Phase 1)

この文書はフェーズ1「API 方針の確定（仕様・下準備）」の決定事項をまとめます。実装はフェーズ5以降で行います（本書は設計合意のみ）。

## 1. IStorageProvider の方針
- 目的: Storage 層の責務を Git I/O に限定し、暗号/復号やインデックス処理を排除する。
- 非推奨化（deprecate）:
  - `loadAndDecryptRemoteData(): Promise<void>` は非推奨。最終的に削除（フェーズ6）。
- 移管先: 暗号/復号やインデックス操作は SyncService + LocalObjectManager 側に集約する。
- 影響範囲: モック/テスト更新、呼び出し箇所の移動（SyncService へ）。

## 2. LocalObjectManager の API 方針
- 目的: 暗号/復号とインデックス操作の統一窓口。鍵/環境IDは呼び出し都度のオプションで受け取る。
- コンストラクタ:
  - 方針: `new LocalObjectManager(workspaceUri: vscode.Uri)` のみ必須。
  - `context`/`encryptionKey` は受け取らない（インスタンスに鍵を保持しない）。
- メソッド引数:
  - すべてのメソッドは `LocalObjectManagerOptions { environmentId: string; encryptionKey: string }` を明示的に受け取る（既存の overrideOptions を標準化）。
- ワークスペース参照:
  - 内部で `vscode.workspace` から動的取得（`getRootUri()`）は廃止方向。
  - すべてのパス解決は `this.workspaceUri` ベースに統一（フェーズ6で置換）。
- 互換対応:
  - 段階的に ctor シグネチャ変更を行い、既存呼び出し部はフェーズ5でコンテナ解決に切替。

## 3. workspaceUri 取得ポリシー
- 目的: ルートURIを DI で一貫して注入し、フォールバックやグローバル依存を除去。
- 方針:
  - `workspaceUri` は DI 経由で必須注入。フォールバック（temp ディレクトリ作成）は廃止（フェーズ7）。
  - マルチルートは別スコープ。現時点では先頭のワークスペース（または明示設定）に限定する方針を README/docs に明記。
- テスト:
  - テストでは明示的に `workspaceUri` をモック/一時ディレクトリとして注入する。

## 4. GithubProvider（Storage 実装）の責務
- 目的: 暗号/復号からの分離。Git I/O のみに特化。
- 方針:
  - 保持: init/remote add/fetch/reset/checkout/push/clone 等の Git 操作。
  - 排除: `encryptAndUploadWorkspaceFiles`/`loadAndDecryptRemoteData` の暗号依存（非推奨→削除）。
  - 直接参照の禁止: `vscode.extensions.getExtension(...).exports.context` の参照は禁止（廃止）。
  - 動的 import の禁止: `await import('./LocalObjectManager')` は設計上不要のため廃止。

## 5. 移行計画（フェーズ連携）
- フェーズ5（最小変更）:
  - GithubProvider から動的 import と context ハックを除去（非推奨化）。
  - 暗号/復号の呼び出しを SyncService 側へ移す（コードの呼び出し場所のみ切替）。
  - SyncService/Factory は LocalObjectManager を Container から解決（`new` を撤廃）。
- フェーズ6（API クリーンアップ）:
  - IStorageProvider から `loadAndDecryptRemoteData` を削除。
  - LocalObjectManager ctor を簡素化（`workspaceUri` のみ）、内部パス解決を `this.workspaceUri` ベースに統一。
- フェーズ7（不変条件/フォールバック削除）:
  - workspaceUri の必須 DI 化とフォールバック削除。
  - 不変条件のテスト追加。

## 6. オープン課題
- マルチワークスペース対応の設計（対象ルートの選択戦略、設定スキーマ）。
- LocalObjectManager の stateless 化の度合い（キャッシュ方針、パフォーマンス評価）。
- 既存テストの改修計画（段階的にどの層のモックを更新するか）。

