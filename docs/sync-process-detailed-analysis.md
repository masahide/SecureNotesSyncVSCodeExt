# Secure Notes Sync - 同期処理詳細解析

このドキュメントは、`src/SyncService.ts`に新設された`initializeRepository`と`performIncrementalSync`メソッド、および`src/storage/GithubProvider.ts`の各メソッドを中心とした、同期・初期化処理の詳細な内容を解析したものです。

## 📋 概要

同期処理は、責務の分離を目的として、以下の2つの主要なコマンドに分割されました。

1.  **`initializeRepository`** - 新規または空のリモートリポジトリを初期化し、ローカルのワークスペースをアップロードします。
2.  **`performIncrementalSync`** - 既存のリポジトリとローカルの変更点を同期します。

これにより、各処理の責務が明確になり、コードの保守性とユーザーエクスペリエンスが向上しました。

---

## 🔄 `initializeRepository` 詳細解析

**ファイル**: `src/SyncService.ts`
**役割**: 新規または空のリポジトリの初期化

### 📊 処理フロー概要

```mermaid
graph TD
    A[初期化コマンド実行] --> B{リモートリポジトリ存在確認};
    B -->|No| C[新規リポジトリとして初期化];
    B -->|Yes| D{リモートは空?};
    D -->|Yes| E[空のリポジトリとして初期化];
    D -->|No| F[エラー表示: 既にデータが存在];

    C --> G[ローカルファイル暗号化 & Push];
    E --> G;
    G --> H[完了];
    F --> H;
```

### 🔍 段階別詳細解析

1.  **リモート状態確認**:
    -   `GitHubSyncProvider.checkRemoteRepositoryExists()`でリモートリポジトリの有無を確認します。
    -   存在する場合、`checkRemoteRepositoryIsEmpty()`で中身が空かどうかを確認します。

2.  **新規リポジトリ初期化**:
    -   リモートが存在しない場合、`LocalObjectManager`でワークスペースのファイルを暗号化し、`GitHubSyncProvider.initializeNewRemoteRepository()`でローカルにGitリポジトリを作成後、初回プッシュを行います。

3.  **空のリポジトリ初期化**:
    -   リモートは存在するが空の場合、`GitHubSyncProvider.initializeEmptyRemoteRepository()`でローカルのGitリポジトリをセットアップし、同様に暗号化したファイルをプッシュします。

4.  **エラー処理**:
    -   リモートに既にデータが存在する場合は、ユーザーにエラーメッセージを表示し、処理を中断します。

---

## 🔄 `performIncrementalSync` 詳細解析

**ファイル**: `src/SyncService.ts`
**役割**: 既存リポジトリとの増分同期

### 📊 処理フロー概要

```mermaid
graph TD
    A[同期コマンド実行] --> B[ローカルリポジトリをクローン/プル];
    B --> C[リモートデータを復号・展開];
    C --> D[増分同期処理の実行];
    D --> E[完了];
```

### 🔍 段階別詳細解析

1.  **前提条件**: このコマンドは、`.secureNotes/remotes`にGitリポジトリが初期化されていることを前提とします。未初期化の場合はエラーメッセージを表示します。

2.  **リモート更新の取得**:
    -   `GitHubSyncProvider.cloneExistingRemoteRepository()`を呼び出し、ローカルの`.secureNotes/remotes`リポジトリを最新の状態に更新します。

3.  **リモートデータの展開**:
    -   `GitHubSyncProvider.loadAndDecryptRemoteData()`が、更新されたリポジトリ内のインデックスとファイルを元に、ワークスペースのファイルを復元・更新します。

4.  **増分同期処理 (`performTraditionalIncrementalSync`)**:
    -   ここからの処理は、リファクタリング前の既存リポジトリ同期フローと同じです。
    -   ローカルの変��をスキャンして新しいインデックスを作成します。
    -   前回、ローカル、リモートの3つのインデックスを比較し、競合を検出・解決します。
    -   最終的なマージ結果を暗号化して保存し、リモートリポジトリにプッシュします。

---

## 🌐 `GitHubSyncProvider` の役割

`GitHubSyncProvider`は、Git操作を抽象化する役割を担います。`SyncService`からの指示に基づき、以下の主要な操作を実行します。

-   `isGitRepositoryInitialized()`: ローカルの初期化状態を確認します。
-   `checkRemoteRepositoryExists()`: `git ls-remote`でリモートの存在を確認します。
-   `checkRemoteRepositoryIsEmpty()`: `ls-remote`の結果が空かで判断します。
-   `initializeNewRemoteRepository()`: `git init`, `git remote add`などを実行します。
-   `cloneExistingRemoteRepository()`: `git clone`または`git pull`を実行します。
-   `upload()`: `git add`, `git commit`, `git push`を実行します。