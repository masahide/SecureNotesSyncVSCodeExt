# リファクタリング提案

このドキュメントでは、DRY 原則およびベストプラクティスに基づいて `SecureNotesSync` 拡張機能のコードベースをリファクタリングする機会を提案します。

---

## 1. コマンドハンドラーのロジックをクラスにカプセル化する

- **リファクタリング対象ファイル**: `src/extension.ts`
- **現状**: `activate` 関数内で `handleSyncNotes` や `handleInitializeNewRepository` など多くのコマンドハンドラーが実装されており、エラーハンドリング、暗号鍵の取得、`SyncService` の初期化などの前処理ロジックが重複しています。
- **提案**:

  1. 各コマンドごとにクラスを作成（例: `SyncCommand`, `InitializeCommand`）。
  2. 各コマンドクラスのコンストラクタで必要な依存関係（例: `ISyncService`, `IKeyManagementService`）を受け取る。
  3. コマンドの実行ロジックをクラス内の `execute` メソッドに実装。
  4. `extension.ts` ではコマンドクラスを生成し、`vscode.commands.registerCommand` に `execute` を登録するだけにする。

- **メリット**:

  - `extension.ts` がスリム化され、エントリポイントとしての責務に集中できる。
  - 各コマンドのロジックがカプセル化され、単体テストが容易になる。
  - 初期化やエラーハンドリングの重複を共通クラスや共通サービスで集中管理できる。

---

## 2. 暗号化ロジックの責務を分離する

- **リファクタリング対象ファイル**: `src/storage/LocalObjectManager.ts`, `src/extension.ts`
- **現状**: AES 暗号化/復号化ロジック（`encryptContent`, `decryptContent`）が `LocalObjectManager` 内に直接実装されている。また、暗号鍵取得（1Password 連携、キャッシュ処理など）の複雑なロジックが `extension.ts` の `getAESKey` 関数に存在する。
- **提案**:

  1. `EncryptionService` クラスを作成し、`encrypt` / `decrypt` メソッドを実装。`LocalObjectManager` はこのサービスをコンストラクタで受け取り、暗号化処理を委譲する。
  2. `KeyManagementService` クラスを作成し、`getAESKey` ロジックを移動。`vscode.ExtensionContext` および `ConfigManager` に依存し、シークレットストレージや 1Password からの鍵取得やキャッシュ管理を担う。
  3. 新たに作成したサービスを DI コンテナに登録し、必要な箇所に注入する。

- **メリット**:

  - 暗号化という重要な関心事を専用クラスに分離することで、コードの見通しがよくなる。
  - `LocalObjectManager` の責務が軽くなり、ファイルやインデックスの管理という本来の目的に集中できる。
  - 鍵管理ロジックをモックしやすくなり、テストが容易になる。

---

## 3. 共通の TreeDataProvider ロジックを基底クラスに集約する

- **リファクタリング対象ファイル**: `src/BranchTreeViewProvider.ts`, `src/IndexHistoryProvider.ts`
- **現状**: 両方の `TreeDataProvider` 実装に `_onDidChangeTreeData`, `onDidChangeTreeData`, `refresh`, `getTreeItem` などのボイラープレートコードが重複している。
- **提案**:

  1. ジェネリックな `BaseTreeViewProvider<T>` 抽象クラスを作成する。
  2. `_onDidChangeTreeData` などの共通プロパティや `refresh`, `getTreeItem` メソッドを基底クラスに実装する。
  3. `BranchTreeViewProvider` と `IndexHistoryProvider` はこの基底クラスを継承し、`getChildren` や固有のロジックに集中する。

- **メリット**:

  - `TreeDataProvider` 実装のボイラープレートを削減。
  - 今後新たな `TreeDataProvider` を追加する際の共通基盤ができる。

---

## 4. `GithubProvider` の依存関係をコンストラクタインジェクションに統一する

- **リファクタリング対象ファイル**: `src/storage/GithubProvider.ts`
- **現状**: `GithubProvider` のコンストラクタは `fileSystem`, `gitClient`, `layoutManager` をオプション引数として受け取り、未指定の場合は内部で `new` によりデフォルト実装を生成している。
- **提案**: これらの依存関係を必須のコンストラクタ引数に変更し、外部から常に注入するようにする。`ContainerBuilder.ts` の DI 登録設定を更新し、依存解決を行う。
- **メリット**:

  - 依存関係が明示的になり、テスト時にモックを注入しやすくなる。
  - クラスの責務が Git 操作のみに限定され、依存オブジェクト生成の知識を持たなくなる（`new` の削除）。
