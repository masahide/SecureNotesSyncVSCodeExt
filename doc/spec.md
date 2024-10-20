# English

# Note-Taking App with S3 Sync - Specification

This document outlines the design and synchronization logic for a note-taking app that uses AWS S3 for storage. The system uses index-based version control to track file changes. The `HEAD` file points to the latest index, ensuring consistency across synchronization operations.

## Table of Contents

1. [Index Structure](#index-structure)
2. [Synchronization Workflow](#synchronization-workflow)
3. [Conflict Detection and Resolution](#conflict-detection-and-resolution)
4. [Preventing Conflicts with Conditional Put](#preventing-conflicts-with-conditional-put)
5. [HEAD Recovery Mechanism](#head-recovery-mechanism)
6. [Security and Encryption](#security-and-encryption)
7. [Future Considerations](#future-considerations)

---

## 1. Index Structure

Each index file tracks the state of files in the workspace and maintains a history of changes. Index files have a continuous structure, using the `nextUuid` field to explicitly link the next index in the chain.

```ts
interface IndexFile {
  uuid: string; // Unique identifier of this index
  parentUuid: string; // UUID of the previous (parent) index
  nextUuid: string; // UUID of the next index
  files: FileEntry[]; // List of files and their hashes
  timestamp: number; // Timestamp when the index was created
}

interface FileEntry {
  path: string; // File path
  hash: string; // Hash of the file content (SHA-256)
  timestamp: number; // Last modified time of the file
}
```

### `nextUuid` Usage:

- When a new index file is created, the `nextUuid` of the parent index is used as the `uuid` for the new index.
- The newly created index file will contain a new `nextUuid`, ensuring that the chain of indexes remains continuous.

### HEAD File:

- The `HEAD` file points to the latest index file (`uuid`).
- In S3, the `HEAD` file is only updated after the successful creation of the index file. This ensures the consistency of synchronization.

---

## 2. Synchronization Workflow

### File Synchronization Process:

1. **Local Index Generation**:

   - The local workspace is scanned, file hashes are calculated, and an `IndexFile` object is created. The new index contains the `parentUuid` and `nextUuid`.

2. **Conflict Detection**:

   - The client fetches the latest `HEAD` index from S3 and compares it with the local index.
   - If the same file has been modified both locally and remotely, a conflict is detected.

3. **Upload New/Modified Files**:

   - If no conflicts are detected, new or modified files are encrypted and uploaded to S3.

4. **Upload Index**:

   - When uploading the new index file, S3’s conditional PutObject is used to prevent overwriting existing files.
   - If the index upload is successful, the `HEAD` file is updated.

5. **Update HEAD**:
   - After the index is successfully uploaded, the `HEAD` file is updated to point to the new index. In case of an error during `HEAD` update, recovery can still be performed using the `nextUuid` to find the correct index.

---

## 3. Conflict Detection and Resolution

### Conflict Detection:

1. **Compare Local and Remote Indexes**:

   - The local and remote indexes (retrieved via the `HEAD` pointer) are compared. If the hash for the same file differs between the two, a conflict is detected.

2. **Handling Conflicts**:
   - When a conflict is detected, the user is prompted to resolve it by choosing one of the following options:
     - Keep local changes (overwrite the remote file).
     - Keep remote changes (overwrite the local file).
     - Manually merge the changes.

### No Conflicts:

- If no conflicts are detected, the sync process proceeds as usual, uploading the index file and updating the `HEAD`.

---

## 4. Preventing Conflicts with Conditional Put

S3’s **conditional PutObject** functionality prevents overwriting existing files with the same name and offloads conflict detection to S3.

### Workflow of Conditional Put:

1. When uploading an index file, S3 checks whether a file with the same `uuid` already exists.
2. If a file with the same `uuid` exists, the upload fails, and the conflict is detected.
3. This process allows conflict detection to be handled by S3, reducing the need for conflict resolution logic on the client side.

### `HEAD` File Updates:

- The `HEAD` file is only updated after a successful index upload. As a result, **`HEAD` conflicts are eliminated**.
- In the rare case of a failure during `HEAD` update, the next section describes how to recover using `nextUuid`.

---

## 5. HEAD Recovery Mechanism

In the event of a failure when updating the `HEAD` file, recovery can be performed using the `nextUuid`.

### Recovery Process:

1. Retrieve the latest index file pointed to by `HEAD` and check its `nextUuid`.
2. Confirm if the index file with the corresponding `nextUuid` exists.
3. If the file exists, update the `HEAD` file to point to this new index.

This ensures that even if a `HEAD` update fails due to an error, the system can recover and maintain index consistency.

---

## 6. Security and Encryption

### Encryption:

- All files and index files are encrypted using AES-256 before being uploaded to S3.

### Encryption Key Management:

- The AES encryption key is securely stored using VSCode’s `SecretStorage` API.
- Both files and indexes are encrypted prior to upload, ensuring end-to-end encryption between the local environment and S3.

### Secure Access to S3:

- Access to the S3 bucket is controlled via AWS IAM policies.
- Each user or client has the appropriate permissions for reading, writing, and deleting files in the S3 bucket according to their assigned roles.

---

## 7. Future Considerations

### Version History and Rollback:

- In the future, a version history feature could be implemented to allow users to roll back to previous states. This could leverage the `parentUuid` and `nextUuid` fields in the index files to navigate through the version history.

### Collaborative Editing:

- In scenarios where multiple users or clients are working on the same notes, improving conflict resolution strategies (e.g., using CRDT or operational transformation techniques) could allow for better handling of concurrent changes.

# 日本語

# S3 同期を利用したノート管理アプリ - 仕様書

このドキュメントでは、AWS S3 を利用したノート管理アプリの設計と同期ロジックについて説明します。このシステムは、インデックスベースのバージョン管理機構を使用し、ファイルの変更を追跡します。`HEAD` ファイルは、最新のインデックスを指し示し、同期の整合性を保つために重要な役割を果たします。

## 目次

1. [インデックスの構造](#インデックスの構造)
2. [同期のワークフロー](#同期のワークフロー)
3. [競合の検出と解決](#競合の検出と解決)
4. [条件付き Put による競合防止](#条件付きputによる競合防止)
5. [HEAD の復旧メカニズム](#headの復旧メカニズム)
6. [セキュリティと暗号化](#セキュリティと暗号化)
7. [今後の検討事項](#今後の検討事項)

---

## 1. インデックスの構造

各インデックスファイルは、ワークスペース内のファイルの状態を追跡し、変更履歴を保持します。インデックスは連続的な構造を持ち、`nextUuid` フィールドを使用して次のインデックスを明示的にリンクします。

```ts
interface IndexFile {
  uuid: string; // インデックスの一意な識別子
  parentUuid: string; // 親インデックスのUUID
  nextUuid: string; // 次のインデックスのUUID
  files: FileEntry[]; // ファイルとそのハッシュのリスト
  timestamp: number; // インデックスが作成されたタイムスタンプ
}

interface FileEntry {
  path: string; // ファイルのパス
  hash: string; // ファイル内容のハッシュ値（SHA-256）
  timestamp: number; // ファイルの最終更新日時
}
```

### `nextUuid` の使用:

- 新しいインデックスファイルが作成される際、親インデックスの `nextUuid` が新しいインデックスの `uuid` となります。
- 生成された新しいインデックスファイルには、次に続く `nextUuid` が含まれ、これにより一貫したインデックスの連鎖が保たれます。

### HEAD ファイル:

- `HEAD` ファイルは最新のインデックスファイル（`uuid`）を指し示す重要なファイルです。
- S3 では `HEAD` ファイルの更新はインデックスファイルの作成が成功した場合にのみ行います。これにより同期の整合性を確保します。

---

## 2. 同期のワークフロー

### ファイル同期のプロセス:

1. **ローカルインデックスの生成**:

   - ローカルワークスペースをスキャンし、ファイルのハッシュ値を計算して `IndexFile` オブジェクトを作成します。新しいインデックスには、`parentUuid` と `nextUuid` が設定されます。

2. **競合の検出**:

   - クライアントは最新の `HEAD` インデックスを S3 から取得し、ローカルインデックスと比較します。
   - 同じファイルがローカルとリモートで異なる場合、競合が検出されます。

3. **新規または変更されたファイルのアップロード**:

   - 競合がなければ、新規または変更されたファイルを暗号化し、S3 にアップロードします。

4. **インデックスのアップロード**:

   - 新しいインデックスファイルをアップロードする際、S3 の条件付き Put を使用して既存のファイルの上書きを防ぎます。
   - インデックスファイルのアップロードが成功すれば、次に `HEAD` ファイルを更新します。

5. **HEAD の更新**:
   - 新しいインデックスが正しくアップロードされた後、`HEAD` ファイルをそのインデックスに更新します。この操作に失敗した場合でも、`nextUuid` から次のインデックスファイルを辿ることで復旧が可能です。

---

## 3. 競合の検出と解決

### 競合の検出:

1. **ローカルとリモートのインデックス比較**:

   - ローカルとリモートのインデックス（`HEAD` が指し示すインデックス）を比較し、同じファイルのハッシュ値が異なる場合は競合として検出します。

2. **競合がある場合**:
   - 競合が検出された場合、クライアントはユーザーに対して選択を促します。ユーザーは以下の選択肢から競合解決を行います。
     - ローカルの変更を保持（リモートファイルを上書き）。
     - リモートの変更を保持（ローカルファイルを上書き）。
     - マージを手動で行う。

### 競合がない場合:

- 競合が検出されない場合、通常の同期処理が進み、インデックスファイルがアップロードされ、`HEAD` が更新されます。

---

## 4. 条件付き Put による競合防止

S3 では、**条件付き Put**機能を活用することで、**同名のファイルの上書きを防止**し、インデックスファイルの競合判定を S3 側で処理できます。

### 条件付き Put の流れ:

1. インデックスファイルのアップロード時に、S3 は既存のファイルが存在するかをチェックします。
2. 既に同じ `uuid` を持つファイルが存在する場合、アップロードが失敗し、競合が発生したとみなします。
3. この処理により、競合判定が S3 側で行われ、クライアント側での競合処理がオフロードされます。

### `HEAD` ファイルの更新:

- インデックスファイルのアップロードが成功した場合にのみ `HEAD` ファイルの更新が行われます。これにより、`HEAD` ファイルの競合は発生しません。
- 万が一 `HEAD` ファイルの更新が失敗した場合でも、次のセクションで述べるように `nextUuid` を使って復旧が可能です。

---

## 5. HEAD の復旧メカニズム

`HEAD` ファイルの更新に失敗した場合、`nextUuid` を使用して復旧が可能です。

### HEAD ファイルの復旧手順:

1. 最新の `HEAD` が指し示すインデックスファイルを取得し、その `nextUuid` を確認します。
2. その `nextUuid` を持つインデックスファイルが存在するか確認します。
3. 存在する場合、そのインデックスファイルを新しい `HEAD` として更新します。

これにより、`HEAD` ファイルの更新がエラーで失敗した場合でも、インデックスの整合性を保ちながら復旧が可能です。

---

## 6. セキュリティと暗号化

### 暗号化:

- すべてのファイルおよびインデックスファイルは、S3 にアップロードされる前に AES-256 で暗号化されます。

### 暗号化キー:

- AES 暗号化キーは、VSCode の `SecretStorage` API を使用して安全に保存されます。
- ファイルおよびインデックスはアップロード前に暗号化され、ローカル環境から S3 までエンドツーエンドの暗号化を保証します。

### S3 へのセキュアアクセス:

- S3 バケットへのアクセスは、AWS IAM ポリシーによって制御されます。
- 各ユーザーやクライアントには、S3 バケット内のファイルの読み取り、書き込み、削除のための適切な権限が付与されます。

---

## 7

. 今後の検討事項

### バージョン履歴とロールバック:

- 今後、バージョン履歴機能を実装することで、ユーザーが過去の状態にロールバックできるようにすることが検討されています。
- 各インデックスファイルの `parentUuid` や `nextUuid` を活用して、過去のバージョンへの移動を容易にする予定です。

### 協調編集:

- 複数のユーザーやクライアントが同時にノートを編集するシナリオでは、**競合解決アルゴリズム**の改善や、**CRDT（Conflict-Free Replicated Data Types）**などの技術を活用した競合の自動解決が検討されています。
