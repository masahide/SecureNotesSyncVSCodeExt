# Secure Notes Sync - アーキテクチャ更新概要

本ドキュメントは、現在の実装が採用している主要なアーキテクチャ上の改善点と、関連資料の更新内容をまとめたものです。

## ハイライト

### 1. 依存性注入の一元化
- **ServiceContainer / ContainerBuilder** により、`SyncServiceFactory`・`ConfigManager`・`BranchTreeViewProvider` をシングルトン登録。
- `GitHubSyncProvider` はトランジェントで生成し、リモート URL を引数に注入。
- `LocalObjectManager` は AES 鍵検証後に `ServiceLocator` へ遅延登録し、拡張全体で共有。
- `ServiceLocator.dispose()` を `deactivate()` で呼び、拡張終了時に確実にリソースを解放。

### 2. 同期パイプラインの再構成
- `SyncService` が新規初期化・既存取り込み・増分同期をカプセル化。
- リモート状態の検出 (`pullRemoteChanges`) と暗号化オブジェクトの生成 (`LocalObjectManager.saveEncryptedObjects`) を分離し、語責務を明確化。
- 競合検出 (`detectConflicts`) とリモート優先の解決 (`resolveConflicts`) を標準化し、退避ファイル命名規約 (`conflict-remote-*`, `deleted-*`) を統一。
- 同期終了時は `saveIndexFile` → `saveWsIndexFile` → `reflectFileChanges` → `upload` の順で実行し、一貫した終端処理を保証。

### 3. Git I/O と暗号処理の分離
- `GitHubSyncProvider` は Git コマンドのみに専念し、暗号ロジックは `LocalObjectManager` へ集約。
- リモート状態判定 (`ls-remote`)・初期化 (`git init` / `.gitattributes`)・クローン (`git clone`)・差分確認 (`rev-parse`)・同期 (`reset --hard` / `push`) を明示。
- すべての Git 実行結果を `logMessage*` で出力し、失敗時は例外を投げて呼び出し側で処理。

### 4. AES 鍵と設定の強化
- `getAESKey()` が 1Password CLI (`op://`) と VS Code Secrets API のフォールバックを統合。
- キャッシュ有効期限を `onePasswordCacheTimeout` の書式 (`5m`, `2h`, `7d`) で制御。
- `ConfigManager` が `gitRemoteUrl` の存在と hex 鍵長 (64) を検証し、環境 ID (`hostname-randomUUID`) を `globalState` に永続化。

### 5. 可視化と自動化
- `BranchTreeViewProvider` が `.secureNotes/refs` を復号してブランチ一覧を提供。
- `IndexHistoryProvider` が最大 30 件のインデックスを読み込み、`secureNotes.previewIndex` で JSON を確認可能。
- `setupAutoSyncListeners()` がウィンドウ復帰とファイル保存イベントを監視し、`enableAutoSync` が true のときのみ同期を起動。

## 更新済みドキュメント
- `docs/spec.md`: 新パイプライン、AES 鍵管理、自動同期、GitHub プロバイダ挙動を反映。
- `docs/source-code-mapping.md`: 仕様とソースの対応表を刷新し、主要フロー／設定項目の参照先を明記。
- `AGENTS.md`: コントリビュータガイドを追加し、構成・コマンド・スタイル・テスト・セキュリティ方針を簡潔に整理。

## 影響と整合性
- ユーザーデータ形式（`.secureNotes/` 配下の構造、AES 形式）は維持。
- VS Code 設定キーは従来どおり。追加設定なし。
- `ISyncService` は `initializeNewStorage` / `importExistingStorage` / `performIncrementalSync` の 3 操作に統一され、呼び出し側から `SyncOptions` を直接渡す必要がなくなった。
- `IStorageProvider` から暗号関連メソッドを除去済み。Git 操作の戻り値はすべて `Promise<boolean>` または `Promise<void>` に整理。

## 今後の検討項目
- 追加ストレージ種別 (S3 / Local) の実装に向けた `SyncServiceFactory` の拡張。
- 複数ワークスペース (マルチルート) 対応時の `LocalObjectManager` 管理戦略。
- `LocalObjectManager` のテスト用モック化支援とベンチマーク整備。

上記の内容を前提に、機能追加やリファクタリングを行う際は `spec.md` と `source-code-mapping.md` を随時同期させてください。
