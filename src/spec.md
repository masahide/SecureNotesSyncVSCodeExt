### **全体仕様: ワークスペース暗号化 S3 バージョン管理 vscode 拡張**

#### 1. **バージョン管理の基本構造**

- **インデックスファイル**:

  - 各バージョンごとに、以下の情報を含むインデックスファイルを生成します。
    - ファイル一覧
    - 各ファイルのハッシュ値（SHA-256）
    - 各ファイルのタイムスタンプ（最終更新日時）
    - 親インデックスファイルの UUID（バージョン履歴の管理）
  - インデックスファイルには UUID version 7 を使用して一意の ID を付与し、暗号化して S3 に保存します。
  - タイムスタンプ情報により、ファイルの変更日時やバージョン間の差異を管理します。

- **HEAD ファイル**:

  - 最新のインデックスファイルの UUID を記録する HEAD ファイルを S3 に保存します。
  - HEAD ファイルは暗号化され、共通の暗号化キーで保護されます。
  - クライアントは HEAD ファイルを参照することで、最新のインデックスファイルを迅速に取得できます。

- **ファイルの保存形式**:

  - 各ファイルは暗号化され、暗号化前のデータに対して SHA-256 でハッシュ値を計算します。
  - ハッシュ値は S3 上でのファイル識別子として使用されます。
  - 暗号化は単一の共通暗号化キーを使用して行います。

#### 2. **S3 のアクセス権限を活用したユーザー認証制御**

- **S3 のアクセス制御による認証**:

  - IAM ポリシーやバケットポリシーを使用して、ユーザーごとのアクセス権限を制御します。
  - 各ユーザーに適切な IAM ロールやポリシーを割り当て、読み取り、書き込み、削除の権限を管理します。

- **認証の流れ**:

  1. ユーザーは AWS の IAM クレデンシャルまたは一時的なアクセスキーで認証されます。
  2. リクエストは IAM ポリシーによって認可され、適切なアクセスが許可されます。
  3. アクセス権限のないオブジェクトへのリクエストは拒否されます。

#### 3. **暗号化と復号のフロー**

##### **暗号化プロセス**

1. **共通暗号化キーの管理**:

   - ユーザー指定の共通暗号化キーで、すべてのファイル、インデックスファイル、HEAD ファイルを暗号化します。
   - 共通鍵は VSCode の`SecretStorage`で安全に保管します。

2. **データ暗号化**:

   - ファイルは共通鍵で暗号化され、暗号化前のデータに対して SHA-256 ハッシュを計算します。
   - 暗号化されたファイルは、そのハッシュ値を識別子として S3 に保存されます。

3. **インデックスファイルと HEAD ファイルの暗号化**:

   - インデックスファイルおよび HEAD ファイルも同じ共通暗号化キーで暗号化されます。

##### **復号プロセス**

1. **最新インデックスファイルの取得**:

   - 共通暗号化キーで HEAD ファイルを復号し、最新のインデックスファイルの UUID を取得します。
   - 取得した UUID を使用して、最新のインデックスファイルを S3 から取得し、復号します。

2. **ファイルリストとタイムスタンプの取得**:

   - インデックスファイルからファイルリスト、ハッシュ値、タイムスタンプ情報を取得します。

3. **ファイルの復号**:

   - 必要なファイルを S3 から取得し、共通暗号化キーで復号します。

#### 4. **ファイル同期ポリシー**

- **競合検出と解決**

  - **競合検出**:

    - ローカルとリモートのインデックスファイルのタイムスタンプとファイルハッシュを比較します。
    - 同じファイルがローカルとリモートで異なるタイムスタンプやハッシュ値を持つ場合、競合と判断します。

  - **ユーザー通知と選択肢提供**:

    - 競合が検出された際、ユーザーに通知して、強豪ファイルを別名を付けてダウンロードします。

      - 競合ファイルは`conflict-YYYYMMDD.HHmmss.`のプレフィックスをつけて保存します。

    - 将来の機能:
      - 競合が検出された際、ユーザーに通知し、以下の選択肢を提供します。
      - **ローカルの変更を適用**: ローカルのファイルでリモートを上書きする。
      - **リモートの変更を適用**: リモートのファイルでローカルを上書きする。
      - **マージの試行**: テキストファイルの場合、マージツールで統合を試みる。

- **バージョン管理と履歴**

  - **バージョン履歴の保持**:

    - 各インデックスファイルに親の UUID を含めることで、バージョン履歴を管理します。
    - 将来の機能:
      - バージョン間の差分や履歴を追跡し、過去の状態へのロールバックを可能にします。

  - **過去バージョンの復元**:

    - ユーザーは特定のインデックスファイルを指定して、その時点のファイル状態を復元できます。

- **将来の機能**:

  - **ロック機能（オプション）**

  - **ファイルロックの実装**:

    - 編集中のファイルに対してロック情報を管理し、他のユーザーによる同時編集を防ぎます。
    - ロック情報は S3 上の特定のオブジェクトで管理し、ロック取得と解放の操作を提供します。

- **定期的なバックグラウンド更新確認**

  - **自動同期**:

    - 一定間隔で HEAD ファイルをチェックし、リモートの変更を検出します。
    - 競合がなければ自動的にローカルを更新し、競合があればユーザーに通知します。

#### 5. **効率化と無駄の削減**

- **S3 依存度の低減**:

  - S3 のバージョニング機能を使用せず、独自にバージョン管理を行うことで、システムの柔軟性と移植性を向上させます。

- **データ転送の最適化**:

  - ファイルの差分のみを転送する機能を検討します。大きなファイルの更新時に効率的です。
  - s3 との通信は変更があったファイルのみを転送します。

- **メタデータの統合管理**:

  - ファイルごとのメタデータ（ハッシュ値、タイムスタンプ、サイズなど）をインデックスファイルに集約し、管理を一元化します。
  - これにより、メタデータ取得のための追加の S3 アクセスを削減できます。

- **将来の機能**:

  - **不要ファイルのクリーンアップ**:

  - 定期的に未参照のファイルや古いバージョンのファイルをクリーンアップする機能を追加します。
  - ストレージコストの削減とシステムの効率化につながります。

#### 6. **全体の整合性の見直し**

- **一貫した暗号化キーの使用**:

  - すべてのデータ（ファイル、インデックスファイル、HEAD ファイル）で同一の暗号化キーを使用し、キー管理を簡素化します。

- **エラーハンドリングの強化**:

  - ネットワークエラーやアクセス拒否などの例外処理を強化し、ユーザーに適切なフィードバックを提供します。

- **セキュリティの強化**:

  - 暗号化キーの保護と管理を徹底し、必要に応じてキーのローテーション機能を実装します。
  - IAM ポリシーを適切に設定し、最小権限の原則を遵守します。

- **ユーザーインターフェースの改善**:

  - 競合解決やバージョン履歴の参照を直感的に行えるよう、VSCode 拡張の UI/UX を最適化します。

- **ドキュメンテーションの充実**:

  - システムの使用方法、制限事項、トラブルシューティングガイドを含む包括的なドキュメントを提供します。

## バージョニング仕様(OLD)

バージョニングの仕様を、以下のようにまとめ直しました。シンプルな「Last Write Wins (LWW)」方式を採用し、バックグラウンドでの定期的な更新確認やコンフリクト検出とバックアップを組み合わせた実装に基づくバージョニング仕様です。

---

### バージョニングの仕様

#### 1. **バージョン管理の基本構造**

- **インデックスファイル**:

  - バージョンごとにファイルの一覧とそのファイルのハッシュ値（暗号化前）を含むインデックスファイルを作成します。
  - インデックスファイルには UUID version 7 で一意の ID を付与し、S3 に保存します。
  - インデックスファイルはファイルの状態を一意に定義するため、すべてのファイルとそのバージョンがわかる形式です。

- **ファイルの保存形式**:
  - 各ファイルは暗号化して保存します。ファイルのハッシュ値（暗号化前）がキーとなり、同じ内容のファイルは複数バージョンにまたがっても重複せず、効率的に管理されます。

#### 2. **ファイル同期ポリシー**

- **Last Write Wins (LWW) ポリシー**:
  - 同期時にローカルと S3 間で同じファイルが変更されている場合、**タイムスタンプが新しい方の変更を優先**します。
  - LWW を適用することで、競合が発生した際に最も新しいバージョンを自動的に選択し、シンプルな競合解決を行います。

#### 3. **バックグラウンドでの定期的な更新確認**

- **定期チェック機能**:

  - バックグラウンドで一定時間ごとに S3 の更新を確認し、S3 上でローカルに存在しないファイルや、ローカルよりも新しいファイルがあれば自動的にダウンロードします。
  - ローカルでの更新を反映するために、ローカルで変更があった場合も S3 にアップロードします。

- **タイムスタンプの確認**:
  - 各ファイルにタイムスタンプを付与し、同期時にはローカルと S3 のタイムスタンプを比較して、**新しい方を選択**します。

#### 4. **コンフリクトの検出と解決**

- **コンフリクトの検出**:

  - ローカルと S3 のタイムスタンプを比較し、異なるクライアントで同時にファイルが変更された場合、**コンフリクト**として検出します。
  - コンフリクトが発生した場合、LWW に基づき、新しいタイムスタンプを持つファイルで上書きします。

- **バックアップ機能**:
  - コンフリクトが発生した際に、ローカルのファイルが上書きされる前に、自動的にバックアップフォルダに保存されます。
  - これにより、データの損失を防ぎ、後でロールバックが可能になります。

#### 5. **ファイルのハッシュ生成（HMAC 方式）**

- **HMAC によるハッシュ生成**:
  - ファイルのハッシュ値は、暗号化前のデータに対して HMAC（Hash-based Message Authentication Code）を使用して生成します。
  - **HMAC キー**は、システムで一貫して使用される秘密のキーで、他者がハッシュ値を推測できないように保護されます。
- **HMAC のアルゴリズム**:

  - 使用するハッシュアルゴリズムは SHA-256 を推奨します（HMAC-SHA256）。
  - HMAC キーは十分に強力なものを採用し、システム内で厳重に管理します。

- **セキュリティ強化**:
  - HMAC を使用することで、ファイルの内容が同じでも、HMAC キーがなければハッシュ値を推測することができず、安全なハッシュ生成が実現できます。

#### 6. **バージョンの管理と復元**

- **バージョンごとの管理**:
  - 各バージョンのインデックスファイルは S3 上に保存され、いつでも過去のバージョンを特定して復元することができます。
- **バージョンの復元**:
  - バージョン ID（UUID version 7）をキーとして、特定のバージョンのインデックスファイルをダウンロードし、そのバージョンに対応するファイルを復元します。

#### 7. **例外処理と通知**

- **ユーザー通知**:
  - コンフリクトが発生した場合や、同期時に問題があった場合、ユーザーに通知を行います。
- **エラーハンドリング**:
  - ファイルの読み書きや S3 との通信中に発生するエラーは適切に処理し、必要に応じてリトライやログに記録します。

## 例

#### HMAC によるハッシュ生成の実装例

```typescript
import * as crypto from "crypto";

// HMACキーは安全な方法で管理する必要があります
const HMAC_KEY = "your-secret-hmac-key"; // 32バイトの秘密鍵を使用

function generateHmacHash(content: Buffer): string {
  const hmac = crypto.createHmac("sha256", HMAC_KEY);
  hmac.update(content);
  return hmac.digest("hex"); // ハッシュを16進数の文字列として返す
}
```

この方針に基づく実装で、**バックグラウンドタスクによる定期的な更新確認**と、**コンフリクトの検出と LWW での解決**を組み合わせる方法は、非常に合理的です。以下は、その実装における主要なポイントと設計の提案です。

### 1. **バックグラウンドタスクによる定期的な更新確認**

- **タスクスケジューリング**: 定期的に S3 をチェックし、ローカルにダウンロードされたファイルよりも新しいバージョンがあるかを確認します。
- **非同期処理**: UI の操作や他の処理をブロックしないよう、非同期で定期的に S3 のオブジェクト一覧を取得し、変更があればバックグラウンドでダウンロードします。
- **更新があった場合の通知**: 新しい更新が確認された場合、ファイルがローカルに存在している場合は、ローカルファイルと S3 ファイルのタイムスタンプを比較し、新しい方を選択します。

### 実装例（バックグラウンド更新確認）

```typescript
// 定期的な更新チェックの間隔（例えば5分ごと）
const updateCheckInterval = 5 * 60 * 1000;

async function startBackgroundUpdateCheck() {
  setInterval(async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        await checkForUpdates(folder);
      }
    }
  }, updateCheckInterval);
}

async function checkForUpdates(folder: vscode.WorkspaceFolder) {
  const { s3Bucket, s3PrefixPath, aesEncryptionKey, s3 } = await getConfigAndSecrets(context);

  const s3FileList = await listS3Files(s3Bucket, s3PrefixPath, s3);
  for (const s3File of s3FileList) {
    const localFileUri = vscode.Uri.joinPath(folder.uri, s3File.Key.replace(s3PrefixPath, ""));
    const localFileExists = await fileExists(localFileUri);

    if (localFileExists) {
      const localFileStat = await vscode.workspace.fs.stat(localFileUri);
      const s3FileTimestamp = s3File.LastModified?.getTime() ?? 0;

      // LWWを使って新しい方を選択
      if (s3FileTimestamp > localFileStat.mtime) {
        // S3が新しい場合はダウンロード
        await downloadAndDecryptItem(folder, s3File, s3, aesEncryptionKey, s3Bucket, s3PrefixPath);
        logMessage(`Downloaded newer file from S3: ${s3File.Key}`);
      }
    } else {
      // ローカルにないファイルは新規ダウンロード
      await downloadAndDecryptItem(folder, s3File, s3, aesEncryptionKey, s3Bucket, s3PrefixPath);
      logMessage(`Downloaded new file from S3: ${s3File.Key}`);
    }
  }
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}
```

### 2. **コンフリクトの検出**

コンフリクトは、ローカルでファイルが変更され、かつ S3 側でもその間に同じファイルが更新されている場合に発生します。これを検出するために、次のアプローチを取ります。

- **ローカルファイルと S3 ファイルの両方にタイムスタンプを付与し、差分を確認**: ローカルファイルが S3 より古いにもかかわらず、ローカルで編集が行われた場合にコンフリクトとみなします。

- **コンフリクトが検出された場合の処理**: LWW を適用しつつ、必要に応じてユーザーに通知を行います。また、コンフリクトが発生した際に自動でバックアップを取ることで、データの損失を防ぐことができます。

### 3. **LWW の適用とバックアップ**

コンフリクトを検出した場合、以下のプロセスで LWW を適用します。

- **ローカルと S3 のタイムスタンプ比較**: コンフリクト発生時、どちらの変更が新しいかを確認し、新しい方を選択します。
- **バックアップの保存**: ローカルで古いデータが上書きされる前に、古いバージョンのファイルをバックアップフォルダにコピーして保存します。こうすることで、データのロールバックが可能になります。

### 実装例（コンフリクト検出と LWW の適用）

```typescript
async function syncFileWithConflictCheck(fileKey: string, localFileUri: vscode.Uri, localFileTimestamp: number, s3File: any) {
  const s3FileTimestamp = s3File.LastModified?.getTime() ?? 0;

  if (localFileTimestamp > s3FileTimestamp) {
    // ローカルファイルが新しい場合はS3を上書き
    const localFileContent = await vscode.workspace.fs.readFile(localFileUri);
    await uploadFileToS3(fileKey, localFileContent);
    logMessage(`Uploaded local file to S3: ${fileKey}`);
  } else if (localFileTimestamp < s3FileTimestamp) {
    // S3ファイルが新しい場合はローカルを上書き
    const backupUri = createBackup(localFileUri);
    await downloadAndDecryptItem(folder, s3File, s3, aesEncryptionKey, s3Bucket, s3PrefixPath);
    logMessage(`Conflict detected. Backed up local file to: ${backupUri} and downloaded newer S3 file.`);
  }
}

// ローカルファイルのバックアップを作成
async function createBackup(fileUri: vscode.Uri): Promise<vscode.Uri> {
  const backupUri = vscode.Uri.joinPath(fileUri, "../backup", fileUri.path.split("/").pop() ?? "");
  const fileContent = await vscode.workspace.fs.readFile(fileUri);
  await vscode.workspace.fs.writeFile(backupUri, fileContent);
  return backupUri;
}
```

### 4. **その他の考慮点**

- **通知システム**: コンフリクトが発生した場合、バックアップを取ったり自動解決するだけでなく、ユーザーに通知を送ることも検討するとよいでしょう。
- **ファイル変更の監視**: ローカルでの変更を即座に検知するために、VSCode の`workspace.onDidChangeTextDocument`イベントを利用して、ローカルの変更をリアルタイムで S3 と同期する仕組みも追加できます。

### まとめ

- 定期的なバックグラウンドタスクで更新を確認し、変更があればすぐに取得。
- コンフリクトが発生した場合、LWW で最新の変更を適用しつつ、古いバージョンはバックアップ。
- 実装は比較的シンプルで、かつデータの安全性も担保できる構成です。

この方法なら、実装が複雑になりすぎず、コンフリクト発生時にも対処できるようになります。

## LWW 実装例

複数のクライアントが同時に異なる変更を行った場合のコンフリクトを解決する方法として、最もシンプルな実装は**「最後に書き込んだ変更が勝つ」（Last Write Wins, LWW）**という方法です。この方法は非常にシンプルで、特に分散システムや同期システムで広く採用されています。

### 「最後に書き込んだ変更が勝つ」方式（Last Write Wins, LWW）

#### 概要:

- ファイルが更新される際、各変更にタイムスタンプ（通常は「タイムスタンプ」や「バージョン番号」）を付与します。
- 同期中に複数のクライアントが同じファイルに異なる変更を加えた場合、**最も新しいタイムスタンプ**を持つ変更が優先され、古い変更は上書きされます。

#### 実装がシンプルな理由:

- タイムスタンプ（もしくはバージョン番号）を各変更に付与するだけで、複雑なコンフリクト解決のロジックが不要。
- 変更の競合が発生した際は、最新のタイムスタンプを持つデータで上書きするという単純なルールで処理できるため、実装や理解が簡単。

#### 実装の流れ:

1. **タイムスタンプの付与**: ファイルの変更が保存される際、各クライアントが変更に対して「タイムスタンプ」や「バージョン番号」を付与します。UUID version 7 のように時系列に基づく ID も使用可能です。
2. **同期処理時のコンフリクト確認**:
   - 複数の変更が同時に行われたかどうかを、ファイルのタイムスタンプを見て確認します。
   - S3 上のファイルとローカルのファイルのタイムスタンプを比較し、どちらが新しいかを判断します。
3. **最新の変更を優先**:
   - タイムスタンプが新しい方のファイルで、古い方のファイルを上書きします。

#### 利点:

- **シンプルな実装**: タイムスタンプの比較だけで競合を解決できるため、複雑なロジックは必要ありません。
- **高速な処理**: コンフリクト解決に時間をかけずに、すぐに最新の変更を適用できる。
- **実装負荷が低い**: タイムスタンプの管理のみで済むため、システム全体の実装がシンプルにまとまります。

#### 欠点:

- **データの一部が失われるリスク**: 「最後に書いた変更が勝つ」というルールのため、クライアントが上書きした際にもう一方のクライアントの変更内容が失われる可能性があります。
- **適用タイミングの問題**: ネットワーク遅延や時間ずれによって、意図せず新しいデータが上書きされるリスクもあります。

---

### 例: LWW のシンプルな実装例

```typescript
async function syncFile(fileKey: string, localFile: Uint8Array, s3FileTimestamp: number, localFileTimestamp: number) {
  if (localFileTimestamp > s3FileTimestamp) {
    // ローカルファイルが新しい場合、S3を上書き
    await uploadFileToS3(fileKey, localFile);
    console.log("Local file is newer, uploaded to S3.");
  } else if (localFileTimestamp < s3FileTimestamp) {
    // S3ファイルが新しい場合、ローカルを上書き
    const s3File = await downloadFileFromS3(fileKey);
    await writeLocalFile(fileKey, s3File);
    console.log("S3 file is newer, downloaded to local.");
  } else {
    console.log("Files are identical, no sync needed.");
  }
}
```

この例では、単にタイムスタンプを比較して、新しい方のファイルを残す形でコンフリクトを解決しています。この方式であれば、実装がシンプルで、処理の負荷も少ないため、基本的なファイル同期システムには適しています。

### 検討すべき事項:

- もし、データのロスをできるだけ避けたい場合は、**削除前のデータをバックアップ**するか、**コンフリクト時にユーザーに通知**し、手動で解決させる方式も併用することを検討できます（ただし、これらは実装が複雑になります）。

LWW 方式は、シンプルな実装を求める場合には非常に適している方法です。
