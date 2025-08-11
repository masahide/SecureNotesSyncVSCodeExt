/**
 * Invariant tests for workspaceUri immutability and no fallback usage
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Prepare initial workspace
const initialWsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'invtest-ws-'));
const initialWorkspaceFolder = { uri: vscode.Uri.file(initialWsDir), name: 'ws1', index: 0 } as vscode.WorkspaceFolder;
Object.defineProperty(vscode.workspace, 'workspaceFolders', { value: [initialWorkspaceFolder], writable: true, configurable: true });

import { LocalObjectManager } from '../storage/LocalObjectManager';
import { GitHubSyncProvider } from '../storage/GithubProvider';

suite('Invariant Tests', () => {
  test('LocalObjectManager uses fixed workspace after construction', async () => {
    const lom = new LocalObjectManager(vscode.Uri.file(initialWsDir));
    const refs1 = lom.getRefsDirUri();

    // Change workspaceFolders to a different folder
    const anotherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'invtest-ws2-'));
    const anotherWorkspaceFolder = { uri: vscode.Uri.file(anotherDir), name: 'ws2', index: 0 } as vscode.WorkspaceFolder;
    Object.defineProperty(vscode.workspace, 'workspaceFolders', { value: [anotherWorkspaceFolder], writable: true, configurable: true });

    const refs2 = lom.getRefsDirUri();
    assert.strictEqual(path.dirname(path.dirname(refs1.fsPath)), path.dirname(path.dirname(refs2.fsPath)), 'Refs directory should remain under initial workspace');
  });

  test('GitHubSyncProvider requires workspaceUri and keeps it immutable in practice', async () => {
    const provider = new GitHubSyncProvider('file:///dummy.git', vscode.Uri.file(initialWsDir));
    // Assert internal workspaceUri matches initial path
    const internalWs = (provider as any).workspaceUri as vscode.Uri;
    assert.ok(internalWs, 'workspaceUri should be set');
    assert.strictEqual(internalWs.fsPath, initialWsDir, 'workspaceUri should equal constructor arg');
  });
});

