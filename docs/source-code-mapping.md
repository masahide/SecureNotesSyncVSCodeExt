# Secure Notes Sync - ソースコード機能マッピング

`spec.md` で定義された振る舞いが、どのソースコードで実装されているかを一覧化します。主要サービスの役割、データ構造、同期フローとの対応を把握する目的で利用してください。

## コア構成要素

| 機能カテゴリ | ファイル / クラス | 主な責務 |
|--------------|-------------------|----------|
| 拡張エントリ | `src/extension.ts` | DI 初期化、AES 鍵取得、コマンド登録、自動同期リスナー設定、TreeView 開始、例外ハンドリング |
| 依存性注入 | `src/container/ContainerBuilder.ts`<br>`src/container/ServiceContainer.ts`<br>`src/container/ServiceLocator.ts` | サービス登録・解決、ライフタイム管理、テスト用モック提供 |
| 設定管理 | `src/config/ConfigManager.ts` | `SyncConfig` 生成、環境 ID 永続化、設定検証 |
| 同期サービス | `src/SyncService.ts` (`SyncService` クラス) | 新規初期化、既存取り込み、増分同期、競合処理、最終アップロード |
| ファクトリー | `src/factories/SyncServiceFactory.ts` | `SyncService` と `GitHubSyncProvider` の組み立て |
| 暗号・インデックス | `src/storage/LocalObjectManager.ts` | Index 生成／保存、AES 暗号化・復号、競合解決、ブランチ参照、WS 反映 |
| Git I/O | `src/storage/GithubProvider.ts` (`GitHubSyncProvider`) | `git init/clone/fetch/reset/add/commit/push` を実行し `.secureNotes/remotes` を管理 |
| TreeView | `src/BranchTreeViewProvider.ts`<br>`src/IndexHistoryProvider.ts` | ブランチ一覧／インデックス履歴の表示とコマンド連携 |
| ログ | `src/logger.ts` | ターミナル出力、VS Code 通知、色付きログ |

## データ構造と永続化

| 仕様 | ソース | 備考 |
|------|--------|------|
| `IndexFile`, `FileEntry`, `UpdateFiles`, `LocalObjectManagerOptions` | `src/types.ts` | AES 暗号化前の SHA-256 ハッシュとタイムスタンプを保持 |
| `.secureNotes/` 構造 | `src/storage/LocalObjectManager.ts` | `getUUIDPathParts`, `getHashPathParts`, `saveWsIndexFile`, `saveBranchRef` が管理 |
| `wsIndex.json` 読み書き | `LocalObjectManager.loadWsIndex` / `saveWsIndexFile` | 前回同期状態をプレーン JSON で保持 |
| ブランチ参照 (`refs/<branch>`) | `LocalObjectManager.saveBranchRef` / `readBranchRef` | UUID を AES 暗号化して保存 |

## 活性化と DI

| 処理 | 実装 | 補足 |
|------|------|------|
| 拡張起動 | `extension.ts: activate()` | ターミナル初期化 → コンテナ構築 → AES 鍵取得 → LocalObjectManager 遅延登録 |
| コンテナ登録 | `ContainerBuilder.buildDefault()` | `SyncServiceFactory`/`ConfigManager` をシングルトン登録、GitHub プロバイダはトランジェント |
| サービス解決 | `ServiceLocator` | `initializeSyncService()` が `ConfigManager` と `SyncServiceFactory` を利用 |

## AES 鍵管理

| 仕様項目 | 実装箇所 | 詳細 |
|----------|----------|------|
| 1Password CLI 呼び出し | `extension.ts: getAESKey()` / `getKeyFrom1PasswordCLI()` | `op --account <name> read <uri>` を実行し Secrets にキャッシュ |
| キャッシュ制御 | `extension.ts: getAESKey()` | `aesEncryptionKeyFetchedTime` と `config.getOnePasswordCacheTimeout()` を比較 |
| Secrets API 連携 | `extension.ts: handleSetAESKey`, `handleGenerateAESKey`, `handleCopyAESKeyToClipboard`, `handleRefreshAESKey` | 入力・生成・コピー・再取得をコマンドで提供 |

## 同期フローのマッピング

### 新規リポジトリ初期化
- 入口: `extension.ts: handleInitializeNewRepository`
- 共通セットアップ: `initializeSyncService`
- Git リモート初期化: `GithubProvider.initialize()`
- インデックス生成／保存: `LocalObjectManager.generateInitialIndex()` → `saveIndexFile()` → `saveWsIndexFile()`
- アップロード: `GithubProvider.upload('main')`

### 既存リポジトリ取り込み
- 入口: `extension.ts: handleImportExistingRepository`
- リモートクローン: `GithubProvider.cloneRemoteStorage()`
- 最新インデックス読込: `LocalObjectManager.loadRemoteIndex()`
- ワークスペース反映: `generateEmptyIndex()` → `reflectFileChanges(forceCheckout=true)`
- UI 更新: `BranchTreeViewProvider.refresh()`

### 増分同期
```mermaid
graph TD
    A[secureNotes.sync] --> B[SyncService.performIncrementalSync]
    B --> C[GithubProvider.pullRemoteChanges]
    B --> D[LocalObjectManager.loadWsIndex]
    B --> E[LocalObjectManager.generateLocalIndexFile]
    B --> F{hasRemoteUpdates?}
    F -->|Yes| G[LocalObjectManager.loadRemoteIndex]
    G --> H[detectConflicts → resolveConflicts]
    H --> I[決定した Index]
    F -->|No| I[決定した Index]
    I --> J[saveEncryptedObjects / saveIndexFile / saveWsIndexFile]
    J --> K[reflectFileChanges(forceCheckout=false)]
    K --> L[GithubProvider.upload(currentBranch)]
    L --> M[BranchTreeViewProvider.refresh]
```

### 競合処理
- 競合検出: `LocalObjectManager.detectConflicts(previous, local, remote)`
- 競合解決: `resolveConflicts()` がリモート優先で処理し、ローカル差分は `conflict-remote-<timestamp>/` または `deleted-<timestamp>/` に退避
- 最終インデックス決定: `SyncService.handleRemoteUpdates()` 内でマージ後の Index を生成

## 自動同期 & イベント

| トリガー | 実装 | 動作 |
|----------|------|------|
| ウィンドウフォーカス復帰 | `extension.ts: setupAutoSyncListeners()` → `onDidChangeWindowState` | `enableAutoSync` true かつ非アクティブ秒数 > `inactivityTimeoutSec` で同期 |
| ファイル保存 | 同上 → `onDidSaveTextDocument` | 保存ごとにタイマーをリセットし、`saveSyncTimeoutSec` 経過で同期 |

## UI コンポーネント

| View | ファイル | 要点 |
|------|----------|------|
| ブランチツリー | `BranchTreeViewProvider` | `.secureNotes/remotes/refs` の AES 参照を復号し、インデックス情報付きで表示 |
| インデックス履歴 | `IndexHistoryProvider` | `LocalObjectManager.loadRemoteIndexes()` で最大 30 件取得、`secureNotes.previewIndex` を発火 |

## 設定と参照コード

| 設定キー (`SecureNotesSync.*`) | 取得箇所 | 主な利用箇所 |
|--------------------------------|----------|--------------|
| `gitRemoteUrl` | `config.ts: getGitRemoteUrl()` | `ConfigManager.createSyncConfig()` |
| `enableAutoSync` | `extension.ts` | 自動同期フラグチェック |
| `inactivityTimeoutSec`, `saveSyncTimeoutSec` | `extension.ts` | 自動同期フロー |
| `onePasswordUri`, `onePasswordAccount`, `onePasswordCacheTimeout` | `config.ts` / `extension.ts` | `getAESKey()` |

## セキュリティと整合性チェック

| 要素 | 実装 | 備考 |
|------|------|------|
| AES-256-CBC 暗号化 | `LocalObjectManager.encryptContent()` | IV を 16 byte ランダム生成し、IV + 暗号文で保存 |
| SHA-256 ハッシュ | `LocalObjectManager.generateLocalIndexFile()` | タイムスタンプ一致時は既存ハッシュを再利用 |
| Git 操作監査 | `GithubProvider.execCmd()` | 全コマンド出力をログへ出力し、失敗時は例外化 |
| 環境 ID | `ConfigManager.getOrCreateEnvironmentId()` | `hostname-randomUUID` 形式で `globalState` に保存 |

このマッピングを利用することで、仕様変更時に関連ソースを素早く特定できます。`spec.md` の更新と合わせて本ファイルも保守してください。
