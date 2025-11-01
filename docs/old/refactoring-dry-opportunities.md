# DRY リファクタリング候補

- `src/BranchTreeViewProvider.ts:65` / `src/BranchTreeViewProvider.ts:99` / `src/IndexHistoryProvider.ts:40`
  でそれぞれ `vscode.workspace.workspaceFolders![0]` と `new LocalObjectManager(...)` を直接呼び出しており、同じ初期化ロジックが複数箇所に重複しています。
  `ServiceLocator` から再利用するか、ワークスペースルートと `LocalObjectManager` を解決する
  共通ユーティリティ／サービス（例: `WorkspaceContextService`）を導入すると呼び出し側の重複と例外処理が減らせます。

- `src/IndexHistoryProvider.ts:32-37` と `src/BranchTreeViewProvider.ts:93-97`
  は AES キー取得とエラー表示を個別に実装していますが、`src/extension.ts:429-476` にある `getAESKey`／キャッシュ更新ロジックと重複しています。
  ViewProvider からも `getAESKey` を経由するか、キー取得用サービスを注入する形に改めればエラーメッセージとキャッシュ戦略を一元管理できます。

- `src/storage/LocalObjectManager.ts:294-371` の `loadWsIndex`／`loadRemoteIndex`／`loadIndex`
  内で JSON デシリアライズ後にパス正規化とソートをそれぞれ行っており、処理が 3 箇所に重複しています。
  `normalizeIndexFile(index: IndexFile)` のような内部ヘルパーを用意して共通化すると後方互換の正規化やソート条件の変更を 1 か所で済ませられます。

- `src/storage/LocalObjectManager.ts:448-488`
  では衝突ファイル名のタイムスタンプ生成と `fetchDecryptAndSaveFile` 呼び出しが `localFileToConflictAndSaveRemote`／`saveRemoteFileAsConflict` 双方で重複しています。
  `buildConflictFilePath(prefix, filePath, timestamp)` といった共通メソッドにまとめればフォーマット変更やテストも容易になります。

- `src/storage/GithubProvider.ts:200-233`
  の `pullRemoteChanges` と `src/storage/GithubProvider.ts:246-270` の `download` が「fetch → ブランチ checkout → pull/reset → 成功ログ」という流れをほぼ重複して実装しています。分岐条件を受け取る `syncBranchFromRemote(mode: 'pull' | 'download')` のような内部メソッドを導入すれば Git 操作手順とエラーハンドリングを一元化できます。

- `src/extension.ts:274-305`
  では自動同期設定値を `vscode.workspace.getConfiguration(appName)` から都度取得していますが、`src/config.ts:10-32` に同じ値を返すヘルパーが既に存在します。`config.isAutoSyncEnabled()` などを活用するように統一すると設定キーの変更時に参照漏れを防げます。
