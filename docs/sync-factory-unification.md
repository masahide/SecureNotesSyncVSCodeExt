# SyncService/Factory Unification (Phase 4)

目的: LocalObjectManager の生成経路を一本化し、SyncService/Factory の直接生成を廃止。鍵/環境IDは都度の options で受け渡す。

## 方針（決定事項）
- 直接 `new LocalObjectManager(...)` を行わない。
  - 対象: `src/factories/SyncServiceFactory.ts`, `src/SyncService.ts`。
  - 取得はコンテナ/ロケータ経由（例: `ServiceLocator.getLocalObjectManager()`）。
- `LocalObjectManagerOptions` を標準の受け渡し手段とし、AES鍵/環境IDはメソッド呼び出し毎に渡す。
- `options` の組み立て地点を明確化し、フロー全体で統一する。

## 取得経路と責務
- 取得: `LocalObjectManager` は Extension 起動時に1インスタンス登録し、利用側は ServiceLocator で解決。
- 保持: LocalObjectManager インスタンスは鍵を保持しない（stateless 方向）。
- 渡す: AES鍵/環境IDは `SyncService` が責任を持って `LocalObjectManager` の各メソッドに渡す。

## options 組み立て地点
- `src/extension.ts` の `initializeSyncService(...)` 内で `environmentId` と `encryptionKey` を組み立てる。
- `SyncService` 内では受け取った `syncOptions` を保管し、メソッド呼び出し時にそのまま渡す（ローテーション時は更新 API を別途提供済み）。

## 変更影響（実装時の指針）
- SyncServiceFactory:
  - LocalObjectManager の `new` を削除。
  - StorageProvider の作成のみ担当（Git I/O 周り）。暗号鍵は Provider に渡さない（渡しても未使用）。
- SyncService:
  - ctor での LocalObjectManager `new` を削除し、コンテナから取得。
  - 既存の `syncOptions` を利用し、LocalObjectManager 呼び出し毎に options を渡す。

## テスト/モック
- DI 経路になったことで、LocalObjectManager をテスト中に差し替えやすくなる。
- Provider モックは Git I/O のみを表現（暗号/復号は LocalObjectManager モックで担保）。

## 完了条件（Phase 4）
- 設計ドキュメント（本書）の合意。
- todo.md のフェーズ4項目が「方針定義・組み立て地点明確化」としてチェック済み。
