import * as vscode from "vscode";
import { IFileSystem } from "./fileSystem";

export interface ISecureNotesLayoutManager {
  prepareRemotesLayout(options?: { clearExisting?: boolean }): Promise<void>;
  getRemotesDirUri(): vscode.Uri;
}

export class SecureNotesLayoutManager implements ISecureNotesLayoutManager {
  private readonly remotesDirUri: vscode.Uri;

  constructor(private readonly workspaceUri: vscode.Uri, private readonly fileSystem: IFileSystem) {
    this.remotesDirUri = vscode.Uri.joinPath(this.workspaceUri, ".secureNotes", "remotes");
  }

  async prepareRemotesLayout(options?: { clearExisting?: boolean }): Promise<void> {
    const clearExisting = options?.clearExisting ?? false;

    if (clearExisting) {
      try {
        await this.fileSystem.delete(this.remotesDirUri, { recursive: true, useTrash: false });
      } catch {
        // ignore if directory does not exist
      }
    }

    await this.fileSystem.createDirectory(this.remotesDirUri);

    const gitattributesUri = vscode.Uri.joinPath(this.remotesDirUri, ".gitattributes");
    await this.fileSystem.writeFile(gitattributesUri, new TextEncoder().encode("* binary"));
  }

  public getRemotesDirUri(): vscode.Uri {
    return this.remotesDirUri;
  }
}
