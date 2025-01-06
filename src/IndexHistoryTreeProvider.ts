// src/IndexHistoryTreeProvider.ts
import * as vscode from "vscode";
import { IndexFile } from "./types";
import { LocalObjectManager } from "./storage/LocalObjectManager";


// ツリーで使うノード
export class IndexHistoryNode {
    constructor(
        public label: string,
        public indexFile: IndexFile | null,
        public children: IndexHistoryNode[] = []
    ) { }
}

export class IndexHistoryTreeItem extends vscode.TreeItem {
    constructor(
        public node: IndexHistoryNode
    ) {
        super(node.label);
        // 子要素があれば折りたたみ可能にする
        this.collapsibleState = node.children.length > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None;
        // tooltip や説明など必要に応じて設定可能
        if (node.indexFile) {
            this.tooltip = `UUID: ${node.indexFile.uuid}`;
            this.description = `Files: ${node.indexFile.files.length}`;
        }
    }
}

export class IndexHistoryTreeProvider implements vscode.TreeDataProvider<IndexHistoryTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<IndexHistoryTreeItem | undefined | void> = new vscode.EventEmitter<IndexHistoryTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<IndexHistoryTreeItem | undefined | void> = this._onDidChangeTreeData.event;

    private tree: IndexHistoryNode[] = [];

    constructor() {
        // コンストラクタ時に必要であればツリーを作成しておく
    }

    // 外部から再読み込みしたいときに呼ぶ
    public refresh() {
        this._onDidChangeTreeData.fire();
    }

    // VSCodeが子要素を取得するときに呼ばれる
    getChildren(element?: IndexHistoryTreeItem): IndexHistoryTreeItem[] | Thenable<IndexHistoryTreeItem[]> {
        if (!element) {
            // ルート要素を返す
            return this.tree.map(node => new IndexHistoryTreeItem(node));
        } else {
            // element.nodeの子ノードを返す
            return element.node.children.map(node => new IndexHistoryTreeItem(node));
        }
    }

    // VSCodeがTreeItemを取得するときに呼ばれる
    getTreeItem(element: IndexHistoryTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * 全インデックスファイルを読み込み、ツリー状に格納
     */
    public async loadIndexHistory(encryptionKey: string, environmentId: string) {
        this.tree = [];

        // 全IndexFileを読み出し
        const indexFiles: IndexFile[] = await LocalObjectManager["loadAllIndexFiles"]({
            environmentId,
            encryptionKey,
        });

        // UUID -> IndexFile のマップを作る
        const mapByUuid = new Map<string, IndexFile>();
        for (const idx of indexFiles) {
            if (idx.uuid) {
                mapByUuid.set(idx.uuid, idx);
            }
        }

        // 子リストを作成 (uuid -> string[] of childUuids)
        const childrenMap = new Map<string, string[]>();
        for (const idx of indexFiles) {
            for (const parentUuid of idx.parentUuids) {
                if (!childrenMap.has(parentUuid)) {
                    childrenMap.set(parentUuid, []);
                }
                childrenMap.get(parentUuid)!.push(idx.uuid);
            }
        }

        // 親を持たない(または親が見つからない)ものをルートに
        const rootUuids: string[] = [];
        for (const idxFile of indexFiles) {
            if (idxFile.parentUuids.length === 0) {
                rootUuids.push(idxFile.uuid);
            } else {
                // 親が欠落している場合もルート扱い
                let allParentsExist = true;
                for (const p of idxFile.parentUuids) {
                    if (!mapByUuid.has(p)) {
                        allParentsExist = false;
                        break;
                    }
                }
                if (!allParentsExist) {
                    rootUuids.push(idxFile.uuid);
                }
            }
        }
        const uniqueRootUuids = [...new Set(rootUuids)];

        // ルートからDAGをDFSしてTreeを構築
        const visited = new Set<string>();
        for (const rootUuid of uniqueRootUuids) {
            const rootNode = this.buildTree(rootUuid, mapByUuid, childrenMap, visited);
            if (rootNode) {
                this.tree.push(rootNode);
            }
        }

        this.refresh();
    }

    /**
     * 再帰的にノードをたどり、IndexHistoryNodeを作成
     */
    private buildTree(uuid: string, mapByUuid: Map<string, IndexFile>, childrenMap: Map<string, string[]>, visited: Set<string>): IndexHistoryNode | null {
        if (visited.has(uuid)) {
            // ループや多重参照を簡単に示すため、同じUUIDを繰り返し表示しない例
            return new IndexHistoryNode(`${uuid} (already visited)`, null, []);
        }
        visited.add(uuid);

        const idxFile = mapByUuid.get(uuid);
        if (!idxFile) {
            return new IndexHistoryNode(`${uuid} (missing)`, null, []);
        }

        // label は適宜変更してください
        const label = `${idxFile.uuid} - (${new Date(idxFile.timestamp).toISOString()})`;

        // 子をたどる
        const childUuids = childrenMap.get(uuid) || [];
        const childNodes: IndexHistoryNode[] = [];
        for (const childUuid of childUuids) {
            const childNode = this.buildTree(childUuid, mapByUuid, childrenMap, visited);
            if (childNode) {
                childNodes.push(childNode);
            }
        }

        return new IndexHistoryNode(label, idxFile, childNodes);
    }
}
