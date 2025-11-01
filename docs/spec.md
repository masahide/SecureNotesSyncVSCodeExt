# Secure Notes Sync - 動作仕様書

## 概要

Secure Notes Sync は VS Code 拡張機能として動作し、ワークスペース内の機密ノートを AES-256-CBC で暗号化した上で GitHub リポジトリへ同期します。ローカル状態は `.secureNotes/` 配下に保存され、Git は暗号化済みアーティファクトの転送にのみ使用します。1Password CLI との連携による鍵管理、ブランチ／インデックスの可視化、ファイル保存やウィンドウアクティベーションに連動した自動同期を提供します。

## アーキテクチャ概要

### コアコンポーネント

- `src/extension.ts`: 拡張機能エントリポイント。DI コンテナ初期化、AES 鍵取得、コマンド／イベント登録、ツリービュー構築、自動同期トリガー設定を担当。
- `src/container/`: 依存性注入実装。`ContainerBuilder` が既定サービスを登録し、`ServiceLocator` が解決を提供。
- `src/config/ConfigManager.ts`: VS Code 設定から同期設定 (`SyncConfig`) を生成し、環境 ID を `globalState` に永続化。
- `src/SyncService.ts`: 同期オーケストレーション。新規初期化、既存取り込み、増分同期、競合処理、アップロードまでを統合。
- `src/storage/LocalObjectManager.ts`: インデックス生成／保存、暗号化／復号、コンフリクト対応、ブランチ参照管理、ワークスペース反映を担う。
- `src/storage/GithubProvider.ts`: `.secureNotes/remotes` を Git リポジトリとして操作し、`git init/clone/fetch/reset/add/commit/push` を実行。
- `src/factories/SyncServiceFactory.ts`: 設定に基づき `GitHubSyncProvider` と `SyncService` を構築。現在は GitHub ストレージのみサポート。
- `src/BranchTreeViewProvider.ts` / `src/IndexHistoryProvider.ts`: ブランチ一覧とインデックス履歴の TreeView を提供。
- `src/logger.ts`: 拡張専用ターミナルへのログ出力と VS Code 通知 API のラッパー。

### 依存性注入

- `ServiceContainer`: シングルトン／トランジェントを管理。
- `ContainerBuilder.buildDefault(context)`: SyncServiceFactory・ConfigManager・BranchTreeViewProvider などを登録。`LocalObjectManager` は初期化時に遅延登録。
- `ServiceLocator`: `getConfigManager()`, `getSyncServiceFactory()`, `getBranchProvider()` などで型安全に取得し、`dispose()` でリソースを解放。

## データ構造と永続化

### TypeScript 定義 (`src/types.ts`)

```ts
interface FileEntry {
  path: string;
  hash: string; // 平文データの SHA-256
  timestamp: number;
  deleted?: boolean;
}

interface IndexFile {
  uuid: string; // UUID v7
  environmentId: string;
  parentUuids: string[];
  files: FileEntry[];
  timestamp: number;
}

type LocalObjectManagerOptions = {
  environmentId: string;
  encryptionKey: string;
};
```

### `.secureNotes/` ディレクトリ

```
.secureNotes/
├── HEAD                 # 現在のブランチ名（平文）
├── wsIndex.json         # 最新インデックス（平文 JSON）
└── remotes/
    ├── refs/<branch>    # ブランチ最新 Index UUID を AES で暗号化したバイナリ
    ├── indexes/         # IndexFile を AES で暗号化し保存（UUID 先頭6文字で分割）
    │   └── 01a2b3/xxxx  # 各ファイルは JSON の暗号化バイナリ
    └── files/           # 暗号化済みファイルのバイナリ（ハッシュ先頭2文字で分割）
```

暗号データは `[IV(16byte)][Ciphertext]` で保存し、IV はファイルごとに生成します。Hash 先頭2文字／UUID 先頭6文字でディレクトリを分割してファイル数を抑制します。

## 活性化とコマンド

### 拡張機能起動フロー

1. `activate()` 内でログ用ターミナルを開く (`showOutputTerminal`)。
2. `ContainerBuilder.buildDefault` を実行し DI を初期化。
3. AES 鍵を取得できた場合は `LocalObjectManager` を即時登録。
4. ブランチ／インデックスビューを作成し TreeView を公開。
5. 同期・鍵操作・ブランチ操作などのコマンドを登録。
6. `setupAutoSyncListeners()` で自動同期イベント (ウィンドウフォーカス／保存イベント) を設定。

### 提供コマンド（主要）

| コマンド ID                                                                            | 概要                             | 主な呼び出し先                                            |
| -------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------- |
| `secureNotes.initializeNewStorage`                                                     | 新規ストレージ初期化             | `SyncService.initializeNewStorage`                        |
| `secureNotes.importExistingStorage`                                                    | 既存リモート取込                 | `SyncService.importExistingStorage`                       |
| `secureNotes.sync`                                                                     | 増分同期                         | `SyncService.performIncrementalSync`                      |
| `secureNotes.setAESKey` / `generateAESKey` / `copyAESKeyToClipboard` / `refreshAESKey` | AES 鍵操作                       | `extension.ts` 内ユーティリティ                           |
| `secureNotes.createBranchFromIndex` / `checkoutBranch`                                 | ブランチ管理                     | `LocalObjectManager.saveBranchRef` / `reflectFileChanges` |
| `secureNotes.previewIndex`                                                             | インデックス JSON をエディタ表示 | `IndexHistoryProvider`                                    |

## AES 鍵管理

- `config.getOnePasswordUri()` が `op://` を返す場合は 1Password CLI (`op`) を使用。`getOnePasswordAccount()` が設定されていれば `--account` を付与。
- キャッシュは `context.secrets` に保存し、取得時刻 (`aesEncryptionKeyFetchedTime`) と `onePasswordCacheTimeout` (既定 30 日、`5m` などの書式) を比較。
- CLI から取得できない場合や `op://` が未設定の場合は Secrets API に保存済みの鍵を返却。
- 鍵は 32 バイト (64 hex) を期待し、`initializeSyncService` でバリデーションを実施。

## 同期フロー

### 新規リポジトリ初期化 (`initializeNewStorage`)

```mermaid
graph TD
    A[secureNotes.initializeNewStorage] --> B[initializeSyncService]
    B --> C[GitHubSyncProvider.initialize]
    C --> D[LocalObjectManager.generateInitialIndex]
    D --> E[LocalObjectManager.saveIndexFile + saveWsIndexFile]
    E --> F[GitHubSyncProvider.upload(main)]
    F --> G[完了通知]
```

- `initialize()` は `.secureNotes/remotes` を初期化し、`.gitattributes` を `* binary` で作成。
- Index はローカルファイルを再帰スキャンし SHA-256 を計算、削除検出は `deleted: true` で表現。
- `upload()` は差分がある場合のみ `git add .` → `git commit -m commit` → `git push origin main` を実行。

### 既存リポジトリ取り込み (`importExistingStorage`)

```mermaid
graph TD
    A[secureNotes.importExistingStorage] --> B[initializeSyncService]
    B --> C[GitHubSyncProvider.cloneRemoteStorage]
    C --> D[LocalObjectManager.loadRemoteIndex]
    D --> E[LocalObjectManager.saveWsIndexFile]
    E --> F[LocalObjectManager.generateEmptyIndex]
    F --> G[reflectFileChanges(forceCheckout = true)]
    G --> H[BranchTreeViewProvider.refresh]
```

- `cloneRemoteStorage()` は `.secureNotes/remotes` を削除後に `git clone <remote> remotes` を実行。
- `loadRemoteIndex()` は `refs/main` を復号し、`indexes/<uuid>` を復号して最新 Index を得る。
- `reflectFileChanges(forceCheckout=true)` で暗号化済みファイルからワークスペースへ復元し、`setCurrentBranchName()` で `HEAD` を更新。

### 増分同期 (`performIncrementalSync`)

```mermaid
graph TD
    A[secureNotes.sync] --> B[initializeSyncService]
    B --> C[GitHubSyncProvider.pullRemoteChanges]
    C --> D[LocalObjectManager.loadWsIndex]
    D --> E[LocalObjectManager.generateLocalIndexFile]
    E --> F{リモート更新あり?}
    F -->|Yes| G[LocalObjectManager.loadRemoteIndex]
    G --> H[detectConflicts & resolveConflicts]
    H --> I[マージ後 Index 決定]
    F -->|No| I
    I --> J[saveEncryptedObjects / saveIndexFile / saveWsIndexFile]
    J --> K[reflectFileChanges(forceCheckout=false)]
    K --> L[GitHubSyncProvider.upload(currentBranch)]
```

- `pullRemoteChanges()` は `git fetch origin` 後、`git rev-parse HEAD` と `origin/main` を比較し差分があれば `git reset --hard origin/main`。
- `detectConflicts()` はローカル／前回インデックス／リモートインデックスの差分を比較し、更新／削除／追加を分類。
- `resolveConflicts()` はリモート優先。ローカル変更は `conflict-remote-<timestamp>/<path>`、削除競合は `deleted-<timestamp>/` に退避。
- `saveEncryptedObjects()` は新規／更新／削除を評価し、暗号化ファイル (`files/`) と削除処理を行う。
- `finalizeSync()` で `BranchTreeViewProvider.refresh()` を呼び出し、`upload()` を実行。

## ブランチ・インデックス管理

- `saveBranchRef(branch, uuid)` は参照ファイルを AES で暗号化して保存。`readBranchRef` は復号して UUID を返す。
- `setCurrentBranchName(branch)` が `.secureNotes/HEAD` を更新し、`getCurrentBranchName()` は存在しない場合 `main` を返す。
- `BranchTreeViewProvider` は `.secureNotes/remotes/refs` を読み込み、インデックス UUID とタイムスタンプを表示。
- `IndexHistoryProvider` は `loadRemoteIndexes()` で最大 30 件のインデックスを復号し、`secureNotes.previewIndex` コマンドで JSON を表示。

## 自動同期

- `enableAutoSync` (boolean) が有効な場合のみ動作。
- ウィンドウフォーカス: `onDidChangeWindowState` で復帰時の不在時間を計測し、`inactivityTimeoutSec` 超過で `secureNotes.sync` を呼び出す。
- ファイル保存: `onDidSaveTextDocument` で遅延タイマー (`saveSyncTimeoutSec` 秒) をセットし、連続保存時はリセット。

## GitHub プロバイダー詳細 (`GitHubSyncProvider`)

- Git 実行ファイルは `which` で検索。未検出の場合はプラットフォーム別の既知パスをチェック。
- `initialize()`:
  - `git ls-remote` でリモート状態を確認。未作成 or 空を判定し、それぞれ `initializeNewRemoteRepository()` / `initializeEmptyRemoteRepository()` を呼び分け。
  - `.gitattributes` を `* binary` で生成し、`git init`, `git remote add origin`, `git checkout -b main` を実行。
- `cloneRemoteStorage()`:
  - 既存ディレクトリを削除後、親ディレクトリで `git clone <url> remotes` を実行。
- `pullRemoteChanges()`:
  - `git fetch origin`, `git rev-parse` で差分確認、更新があれば `git reset --hard origin/main`。
- `upload(branch)`:
  - `git checkout branch` (存在しなければ作成)、`git add .`、変更があればコミット・プッシュ。
- すべての Git コマンドは `execFile` を使用し、標準出力・標準エラーをログへ送る。

## ログとエラー処理

- `logMessage*` 系は専用ターミナルへ色付き出力。`showInfo` / `showError` が VS Code の通知を表示。
- 主要コマンドは `executeSyncOperation` を通じて例外を捕捉し、失敗時は false を返して UI へ一貫したメッセージを表示。
- `registerManualSyncTestCommand` (開発用) で手動テストコマンドを追加可能。

## 設定項目 (`package.json` / `src/config.ts`)

| 設定キー                                  | 型 / 既定値 | 説明                                               |
| ----------------------------------------- | ----------- | -------------------------------------------------- |
| `SecureNotesSync.gitRemoteUrl`            | string      | 同期先 GitHub リポジトリ URL。必須。               |
| `SecureNotesSync.enableAutoSync`          | false       | 自動同期の有効／無効。                             |
| `SecureNotesSync.inactivityTimeoutSec`    | 60          | フォーカス復帰後に同期するまでの非アクティブ秒数。 |
| `SecureNotesSync.saveSyncTimeoutSec`      | 5           | ファイル保存後に同期するまでの遅延秒数。           |
| `SecureNotesSync.onePasswordUri`          | string      | 1Password CLI で読み取る項目 (`op://` 形式)。      |
| `SecureNotesSync.onePasswordAccount`      | string      | `op` コマンドに渡すアカウント名 (任意)。           |
| `SecureNotesSync.onePasswordCacheTimeout` | `30d`       | CLI 取得結果のキャッシュ期間 (例: `5m`, `12h`)。   |

以上が現在実装されている Secure Notes Sync の仕様です。実装と差異が生じた場合は本ドキュメントを更新し、`source-code-mapping.md` など関連資料も合わせてメンテナンスしてください。
