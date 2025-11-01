import * as vscode from "vscode";
import { LocalObjectManager } from "../storage/LocalObjectManager";

/**
 * ワークスペースに紐づく共通サービス
 * 各 ViewProvider やサービスで重複していたワークスペース関連処理を集約する。
 */
export interface IWorkspaceContextService {
  /**
   * アクティブなワークスペースのルート URI を返す。
   * ワークスペースが存在しない場合はエラーを投げる。
   */
  getWorkspaceUri(): vscode.Uri;

  /**
   * ワークスペーススコープの LocalObjectManager を返す。
   * 既に DI コンテナーに登録済みの場合はそちらを再利用する。
   */
  getLocalObjectManager(): LocalObjectManager;
}
