import * as vscode from "vscode";
import { LocalObjectManager } from "./storage/LocalObjectManager";
import { IndexFile } from "./types";
import { getAESKey } from "./extension";
import { logMessage, showError } from "./logger";

/**
 * ブランチ単位・Index履歴表示用の TreeViewProvider
 *  - ブランチ一覧(上位レベル)
 *  - 各ブランチの Index 履歴(下位レベル)
 */
export class BranchTreeViewProvider
    implements vscode.TreeDataProvider<BranchItem | IndexItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<
        BranchItem | IndexItem | undefined | void
    > = new vscode.EventEmitter<BranchItem | IndexItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<
        BranchItem | IndexItem | undefined | void
    > = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) { }

    /**
     * TreeViewを再描画するためのリフレッシュ
     */
    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * getTreeItem:
     *   与えられた要素が TreeItem としてどう表示されるかを決定
     */
    getTreeItem(
        element: BranchItem | IndexItem
    ): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    /**
     * getChildren:
     *   指定された要素の子要素を返す
     *   - undefined の場合、最上位の要素（ブランチ一覧）を返す
     *   - BranchItem の場合、そのブランチのIndex履歴一覧を返す
     */
    async getChildren(
        element?: BranchItem | IndexItem
    ): Promise<(BranchItem | IndexItem)[]> {
        if (!element) {
            // 1) ブランチ一覧を返す
            return this.getBranchList();
        } else if (element instanceof BranchItem) {
            // 2) 指定ブランチの Index 履歴を返す
            return this.getIndexHistoryOfBranch(element);
        }
        // IndexItemには子要素を設けず空配列を返す
        return [];
    }

    /**
     * .secureNotes/remotes/refs/以下にあるブランチファイルを列挙して
     * BranchItem を生成して返す
     */
    private async getBranchList(): Promise<BranchItem[]> {
        try {
            const refsDir = LocalObjectManager.getRefsDirUri(); // => .secureNotes/remotes/refs
            const entries = await vscode.workspace.fs.readDirectory(refsDir);
            const branchItems: BranchItem[] = [];

            for (const [name, fileType] of entries) {
                // fileType === vscode.FileType.File ならブランチrefとみなす
                if (fileType === vscode.FileType.File) {
                    branchItems.push(new BranchItem(name));
                }
            }

            // ソートしたければここで branchItems.sort() など
            return branchItems;
        } catch (err: any) {
            // refsDir がない場合など
            logMessage(`getBranchList error: ${err?.message ?? err}`);
            return [];
        }
    }

    /**
     * 指定ブランチの HEAD UUID から親を辿って、Index 履歴を取得する
     * （分岐がある可能性もあるが、本例では「親が複数あれば1つ目のみを辿る」簡易実装）
     */
    private async getIndexHistoryOfBranch(branchItem: BranchItem): Promise<IndexItem[]> {
        const aesKey = await getAESKey(this.context);
        if (!aesKey) {
            showError("AES Key が設定されていません。");
            return [];
        }
        const branchName = branchItem.branchName;

        // 1) HEADのUUIDを読む
        const headUuid = await LocalObjectManager.readBranchRef(branchName, aesKey);
        if (!headUuid) {
            // ブランチにまだIndexが無い場合
            return [];
        }

        // 2) HEADから親を辿って配列を作る
        const indexFiles: IndexFile[] = [];
        let currentUuid: string | undefined = headUuid;

        try {
            while (currentUuid) {
                const idxFile = await LocalObjectManager.loadIndex(currentUuid, {
                    environmentId: "",
                    encryptionKey: aesKey,
                });
                indexFiles.push(idxFile);

                // 親が複数ある場合、一番先頭だけ辿る（単純化）
                if (idxFile.parentUuids && idxFile.parentUuids.length > 0) {
                    currentUuid = idxFile.parentUuids[0];
                } else {
                    currentUuid = undefined;
                }
            }
        } catch (err: any) {
            logMessage(`getIndexHistoryOfBranch loadIndex error: ${err?.message ?? err}`);
        }

        // 3) 古い順 or 新しい順に並べる
        //   "順にリスト表示"とだけあるのでお好みで。ここでは 古い -> 新しい 順に
        indexFiles.sort((a, b) => a.timestamp - b.timestamp);

        // 4) IndexItem を生成
        return indexFiles.map((idx) => new IndexItem(idx));
    }
}

/**
 * ブランチを表すTreeItem
 *  - コンテキストメニューやコマンドに branchName を渡す
 *  - collapsibleState は Collapsed にすると子要素を表示できる
 */
export class BranchItem extends vscode.TreeItem {
    constructor(public readonly branchName: string) {
        super(branchName, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = "branchItem";
        this.tooltip = `Branch: ${branchName}`;

        // 左クリックで「checkoutBranch」したいなら以下のように command を付与
        // ただし、右クリックメニューを使うなら不要
        //this.command = {
        //    command: "extension.checkoutBranch",
        //    title: "Checkout Branch",
        //    arguments: [this],
        //};
    }
}

/**
 * ブランチ内の過去Index（履歴）を表すTreeItem
 *  - contextValueを "indexItem" としておけば、右クリックメニューで
 *    "extension.createBranchFromIndex" コマンドを関連付けやすい
 */
export class IndexItem extends vscode.TreeItem {
    constructor(public readonly indexFile: IndexFile) {
        // ラベルを適当に作成。ここではタイムスタンプとUUIDの一部を表示
        super(
            `${new Date(indexFile.timestamp).toLocaleString()} [${indexFile.uuid.slice(
                0,
                14
            )}...]`,
            vscode.TreeItemCollapsibleState.None
        );
        this.contextValue = "indexItem";

        // tooltip にはUUID全部や親UUIDなどを入れてもよい
        this.tooltip = `UUID: ${indexFile.uuid}\nParent: ${indexFile.parentUuids.join(
            ","
        )}`;
    }
}
