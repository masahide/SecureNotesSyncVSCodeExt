import * as vscode from "vscode";
import { LocalObjectManager } from "../storage/LocalObjectManager";
import { IWorkspaceContextService } from "../interfaces/IWorkspaceContextService";
import { ServiceLocator } from "../container/ServiceLocator";
import { ServiceKeys } from "../container/ServiceKeys";

/**
 * ワークスペース関連の共通処理をまとめたサービス。
 * 既存コードで重複していた LocalObjectManager の生成や
 * ワークスペースフォルダの取得ロジックを一元化する。
 */
export class WorkspaceContextService implements IWorkspaceContextService {
  private cachedLocalObjectManager: LocalObjectManager | null = null;

  getWorkspaceUri(): vscode.Uri {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error("No workspace folder found. Open a workspace to use Secure Notes Sync.");
    }
    return workspaceFolder.uri;
  }

  getLocalObjectManager(): LocalObjectManager {
    if (ServiceLocator.isInitialized() && ServiceLocator.isRegistered(ServiceKeys.LOCAL_OBJECT_MANAGER)) {
      return ServiceLocator.getLocalObjectManager();
    }

    if (!this.cachedLocalObjectManager) {
      const workspaceUri = this.getWorkspaceUri();
      this.cachedLocalObjectManager = new LocalObjectManager(workspaceUri);

      if (ServiceLocator.isInitialized()) {
        ServiceLocator.getContainer().registerInstance(
          ServiceKeys.LOCAL_OBJECT_MANAGER,
          this.cachedLocalObjectManager
        );
      }
    }

    return this.cachedLocalObjectManager;
  }
}
