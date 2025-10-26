- src/extension.ts:429 の getAESKey：
  1Password CLI 成功/失敗やキャッシュ有効期限を跨ぐケースの分岐が多く、
  Secret API フォールバックが期待どおり働くかをモックしたテストで検証したいです。
- src/extension.ts:309 の setupAutoSyncListeners：
  enableAutoSync フラグやタイムアウト設定によって secureNotes.sync が発火する条件を確認する自動テストがなく、
  不要な同期トリガーや未発火を検出できません。
- src/SyncService.ts:106 の performIncrementalSync／:134 の performTraditionalIncrementalSync：
  ローカル変更とリモート変更の組み合わせに応じた分岐・アップロード判定が複雑で、スタブ化した
  LocalObjectManager/IStorageProvider によるユニットテストが必要です。
- src/SyncService.ts:220 の handleRemoteUpdates：
  競合検出 → 解決 → マージの流れを LocalObjectManager モックで差し替え、競合有無・解決失敗時の挙動を検証するテストが無い状態です。
- src/storage/LocalObjectManager.ts:245 の saveEncryptedObjects と関連する loadIndex/loadRemoteIndex：
  暗号化ファイルの保存先パス分割や復号処理が正しいか、既存ファイルの再暗号化条件を含めてテストで保証したい箇所です。
- src/storage/LocalObjectManager.ts:542 の resolveConflicts：
  衝突種別ごとの退避ファイル生成や削除処理が複雑で、想定パスへファイルが生成されるかの検証が不足しています。
- src/storage/GithubProvider.ts:201 の pullRemoteChanges と :285 の upload：
  git コマンド結果による分岐や差分判定の挙動をモック化して確認するテストが無く、失敗時リカバリーやコミットスキップが保証できていません。
