# リファクタリング TDD TODO リスト

このドキュメントは、`SecureNotesSync` 拡張機能に対してリファクタリングを TDD サイクル（Red → Green → Refactor）で進めるための TODO チェックリストです。各項目ごとに明確な完了条件を設け、タスクの進捗が可視化されるよう整理しています。

---

## 1. 暗号化ロジックの責務分離（TDD TODO）

- **対象**: `src/storage/LocalObjectManager.ts`, `src/extension.ts`
- **背景**: 暗号処理と鍵管理が各所に散在しており、テストや責務分離が難しい状態。

### Red

- [x] `EncryptionService` と `KeyManagementService` の期待動作を定義するテスト（暗号化/復号、1Password 連携キャッシュの期限切れシナリオを含む）を追加する。
- [x] `LocalObjectManager` および `BranchTreeViewProvider` から新サービスをモックしたテストケースを追加し、既存ロジックが未実装のために失敗することを確認する。

### Green

- [x] `src/services/EncryptionService.ts` を実装し、Red で追加した暗号化関連テストを通す。
- [x] `src/services/KeyManagementService.ts` を実装し、1Password キャッシュ更新を含むキー取得テストを通す。
- [x] `LocalObjectManager` を `EncryptionService` 経由で暗号化/復号するように修正し、関連テストをグリーンにする。
- [x] `BranchTreeViewProvider` / `IndexHistoryProvider` / コマンドハンドラーを `KeyManagementService` に切り替え、関連テストをグリーンにする。

### Refactor

- [x] `ContainerBuilder` / `ServiceLocator` に新サービスを登録し、依存解決が一元化されていることを確認する。
- [x] `LocalObjectManager` から暗号化・鍵取得の private 実装を削除し、コードの重複がない状態でテストが全てパスすることを確認する。
- [x] 暗号化・鍵管理のユニットテストにテストダブルを導入し、モック差し替えが容易であることを確認する。

---

## 2. GitHubSyncProvider の依存注入統一（TDD TODO）

- **対象**: `src/storage/GithubProvider.ts`
- **背景**: 依存生成をクラス内部で行っており、テストでモック化が困難。

### Red

- [x] 依存を外部注入できることを前提にした `GitHubSyncProvider` のテスト（モック `fileSystem` / `gitClient` / `layoutManager`）を追加し、現状コードが失敗することを確認する。
- [x] `ContainerBuilder` が依存未登録の場合に失敗するテストを追加し、DI 更新の必要性を示す。

### Green

- [x] `GitHubSyncProvider` のコンストラクタを依存必須化し、Red で追加したテストを通す。
- [x] `factories/` もしくは `ContainerBuilder` にデフォルト実装を提供するファクトリを追加し、依存注入で同期フローが成功するテストをグリーンにする。

### Refactor

- [x] `GitHubSyncProvider` 内に残っている `new` による直接生成コードを除去し、DI からの提供に統一されていることを確認する。
- [x] 主要な統合テストでモック差し替えが容易になったことを確認し、テストコードの重複を整理する。
