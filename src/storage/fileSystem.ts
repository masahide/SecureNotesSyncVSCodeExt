import * as vscode from "vscode";

export type FileSystemDeleteOptions = {
  recursive?: boolean;
  useTrash?: boolean;
};

export interface IFileSystem {
  createDirectory(uri: vscode.Uri): Thenable<void>;
  delete(uri: vscode.Uri, options?: FileSystemDeleteOptions): Thenable<void>;
  writeFile(uri: vscode.Uri, data: Uint8Array): Thenable<void>;
}

/**
 * VS Code の workspace.fs をラップした標準実装。
 */
export class VsCodeFileSystem implements IFileSystem {
  createDirectory(uri: vscode.Uri): Thenable<void> {
    return vscode.workspace.fs.createDirectory(uri);
  }

  delete(uri: vscode.Uri, options?: FileSystemDeleteOptions): Thenable<void> {
    return vscode.workspace.fs.delete(uri, options);
  }

  writeFile(uri: vscode.Uri, data: Uint8Array): Thenable<void> {
    return vscode.workspace.fs.writeFile(uri, data);
  }
}
