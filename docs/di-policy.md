# DI Policy (Phase 2)

本ドキュメントはフェーズ2「DI 体制の整備（非破壊の導入）」の方針をまとめます。実装はフェーズ5以降で行い、ここでは合意事項を示します。

## 目的
- LocalObjectManager などのコアサービスを DI で一貫提供し、直接 new を排する。
- workspaceUri は必ず DI で注入。AES鍵はインスタンスに保持せず、呼び出し時の options で渡す。

## コンテナ/ロケータ運用
- ServiceContainer/ServiceLocator を正とする。
- 生成・登録:
  - extension.activate で `workspaceUri` を基に LocalObjectManager を1インスタンス生成し、`ServiceKeys.LOCAL_OBJECT_MANAGER` として registerInstance する（現状維持）。
  - BranchTreeViewProvider や ConfigManager 等は既存通り登録。
- 取得・使用:
  - LocalObjectManager を使用する箇所（SyncService/commands/UI）は `ServiceLocator.getLocalObjectManager()` 経由で取得する。
  - 直接 `new LocalObjectManager(...)` を書かない（フェーズ5で是正）。

## 依存の注入ポリシー
- workspaceUri:
  - LocalObjectManager の ctor に注入（将来は `workspaceUri` 必須のみに簡素化）。
  - Provider（GitHubSyncProvider）側も `workspaceUri` はコンストラクタ注入（フォールバック廃止はフェーズ7）。
- AES 鍵/環境ID:
  - LocalObjectManager のメソッド呼び出し毎に `LocalObjectManagerOptions { environmentId, encryptionKey }` を渡す。
  - インスタンスに鍵を保持しない（鍵ローテーション/セキュリティのため）。

## 守るべきルール
- 直接 new 禁止:
  - SyncServiceFactory/SyncService/GitHubSyncProvider 等で `new LocalObjectManager(...)` を行わない。
- グローバル依存禁止:
  - 実装層で `vscode.extensions.getExtension(...).exports.context` を取得しない。
  - dynamic import による設計上不要な遅延依存を置かない（`await import('./LocalObjectManager')` を禁止）。

## テスト方針
- LocalObjectManager をモック/実体いずれでも、`workspaceUri` をテスト用一時ディレクトリとして明示注入。
- IStorageProvider モックは Git I/O に限定（暗号/復号は SyncService+LocalObjectManager の責務）。

## マルチルート
- 現段階では先頭ワークスペース（または設定で明示指定）を対象とする。マルチルート対応は別スコープで検討。

