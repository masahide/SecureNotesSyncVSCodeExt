// src/interfaces/IBranchTreeViewProvider.ts

/**
 * ブランチツリービュープロバイダーのインターフェース
 * TypeScriptのベストプラクティスに従って、any型を避けるために定義
 */
export interface IBranchTreeViewProvider {
  /**
   * TreeViewを再描画するためのリフレッシュ
   */
  refresh(): void;
}
