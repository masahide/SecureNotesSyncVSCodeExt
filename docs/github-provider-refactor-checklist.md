# GitHub ストレージプロバイダ リファクタリング TDD チェックリスト

GitHub 向けストレージプロバイダを TDD で段階的にリファクタリングするためのタスク一覧です。各ステップで「Red → Green → Refactor」を意識し、テストを先行させて安全に分離を進めてください。

## 1. IFileSystem アダプタの導入

- [x] Red: `GitHubSyncProvider` のファイル操作をカバーするユニットテストを追加し、`vscode.workspace.fs` へ直接依存する現状で失敗させる。
- [x] Green: `IFileSystem` インターフェースと `VsCodeFileSystem` 実装を追加し、テストでモックを注入して通過させる。
- [x] Refactor: 既存の `workspace.fs` 呼び出しをすべてアダプタ経由に置き換え、重複する URI 生成ヘルパーを統合する。

## 2. IGitClient ラッパーによるプロセス分離

- [x] Red: `execCmd` のトレースとエラーハンドリングを検証するテストを用意し、直接 `cp.execFile` をスタブ化できない現状で失敗させる。
- [x] Green: `IGitClient` インターフェースと `NodeGitClient` 実装を追加し、`execCmd` 呼び出しをラッパーへ委譲してテストを通過させる。
- [x] Refactor: `GitHubSyncProvider` 内の Git 実行ロジックを整理し、重複ログ出力やコマンド組み立てを専用メソッドに集約する。

## 3. ストレージ初期化責務の整理

- [x] Red: `.gitattributes` 生成や `.secureNotes` ディレクトリ初期化に関するユニットテストを追加し、責務が混在している現状で失敗させる。
- [x] Green: ファイルレイアウト初期化を担う小さなサービス（例: `SecureNotesLayoutManager`）を導入し、`GitHubSyncProvider` から委譲してテストを通す。
- [x] Refactor: `GitHubSyncProvider` を「Git I/O + リポジトリ状態判定」に集中させ、レイアウト関連ヘルパーを削除または移譲する。

## 4. ダウンロード／アップロード API の再構成

- [x] Red: `download` / `upload` の振る舞いをカバーする統合テストを追加し、Git 固有のコマンド呼び出しが混在している現状で失敗させる。
- [x] Green: `fetchRemote`, `ensureBranchCheckedOut`, `publishChanges` など同期ライフサイクルに沿ったメソッドへ再設計し、テストが通るよう移行する。
- [x] Refactor: 旧メソッドを段階的に削除し、`IStorageProvider` インターフェースを新設計に合わせてクリーンアップする。

## 5. TDD サイクルの完了条件

- [x] 新規テストがすべて緑で通り、旧テストは退行していないこと。
- [x] `GitHubSyncProvider` のコンストラクタが `IFileSystem` と `IGitClient` を受け取る設計に置き換わり、VS Code API への直接依存が隠蔽されていること。
- [x] リファクタリング後のコードで `workspace.fs` および `cp.execFile` を直接呼び出している箇所が残っていないこと。
