
import * as vscode from 'vscode';
import { IndexFile } from './types';
import { logMessage } from './logger';
import { getAESKey } from './extension';
import { IWorkspaceContextService } from './interfaces/IWorkspaceContextService';

export class IndexHistoryProvider implements vscode.TreeDataProvider<IndexItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<IndexItem | undefined | null | void> = new vscode.EventEmitter<IndexItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<IndexItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(
        private context: vscode.ExtensionContext,
        private workspaceContext: IWorkspaceContextService
    ) {
        logMessage('IndexHistoryProvider: constructor called');
    }

    refresh(): void {
        logMessage('IndexHistoryProvider: refresh called');
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: IndexItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: IndexItem): Promise<IndexItem[]> {
        logMessage('IndexHistoryProvider: getChildren called');
        if (element) {
            logMessage('IndexHistoryProvider: getChildren - element exists, returning empty array');
            return [];
        }

        const encryptionKey = await getAESKey(this.context);
        if (!encryptionKey) {
            logMessage('IndexHistoryProvider: AES encryption key not found.');
            vscode.window.showErrorMessage('AES encryption key not found. Please set it in the settings.');
            return [];
        }
        logMessage('IndexHistoryProvider: AES encryption key loaded successfully.');

        let workspaceUri: vscode.Uri;
        try {
            workspaceUri = this.workspaceContext.getWorkspaceUri();
        } catch (error: any) {
            logMessage(`IndexHistoryProvider: Workspace folder not found. ${error?.message ?? error}`);
            vscode.window.showErrorMessage('No workspace folder open.');
            return [];
        }
        logMessage(`IndexHistoryProvider: Workspace folder: ${workspaceUri.fsPath}`);

        const localObjectManager = this.workspaceContext.getLocalObjectManager();

        try {
            logMessage('IndexHistoryProvider: Loading remote indexes...');
            const indexes = await localObjectManager.loadRemoteIndexes({ encryptionKey, environmentId: "" });
            logMessage(`IndexHistoryProvider: Found ${indexes.length} remote indexes.`);

            indexes.sort((a, b) => b.timestamp - a.timestamp);
            logMessage('IndexHistoryProvider: Indexes sorted by timestamp descending.');

            const recentIndexes = indexes.slice(0, 30);
            logMessage(`IndexHistoryProvider: Sliced to ${recentIndexes.length} recent indexes.`);

            const indexItems = recentIndexes.map(index => new IndexItem(index));
            logMessage(`IndexHistoryProvider: Mapped to ${indexItems.length} IndexItem objects.`);
            return indexItems;
        } catch (error) {
            logMessage(`IndexHistoryProvider: Error loading index history: ${error}`);
            vscode.window.showErrorMessage(`Error loading index history: ${error}`);
            return [];
        }
    }
}

class IndexItem extends vscode.TreeItem {
    constructor(public readonly indexFile: IndexFile) {
        super(new Date(indexFile.timestamp).toLocaleString(), vscode.TreeItemCollapsibleState.None);
        this.tooltip = `UUID: ${indexFile.uuid}\nFiles: ${indexFile.files.length}`;
        this.description = `Files: ${indexFile.files.length}`;
        this.command = {
            command: 'secureNotes.previewIndex',
            title: 'Preview Index',
            arguments: [indexFile],
        };
    }
}
