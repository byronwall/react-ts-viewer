import * as vscode from "vscode";
import { IndexerService } from "./IndexerService";
import { FileNode, ComponentNode, HookNode } from "./types";
import {
  TreeNode,
  FileTreeItem,
  ComponentTreeItem,
  HookTreeItem,
  MessageTreeItem,
} from "./treeViewTypes";

export class SidebarProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    TreeNode | undefined | null | void
  > = new vscode.EventEmitter<TreeNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    TreeNode | undefined | null | void
  > = this._onDidChangeTreeData.event;

  constructor(private indexerService: IndexerService) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): Thenable<TreeNode[]> {
    if (!this.indexerService) {
      return Promise.resolve([new MessageTreeItem("Indexer not available.")]);
    }

    // If asking for children of the root
    if (!element) {
      const indexedData = this.indexerService.getIndexedData();
      if (indexedData.size === 0) {
        // Potentially check if indexing is in progress vs. genuinely no data
        return Promise.resolve([
          new MessageTreeItem("Run 'Index Workspace' first."),
        ]);
      }

      // Convert FileNodes map to an array of FileTreeItems, sorted by path
      const fileItems = Array.from(indexedData.values())
        .sort((a, b) => a.filePath.localeCompare(b.filePath))
        .map((fileNode) => new FileTreeItem(fileNode));

      return Promise.resolve(fileItems);
    }

    // If asking for children of a File node
    if (element instanceof FileTreeItem) {
      const fileNode = element.fileNode;
      const componentItems = fileNode.components.map(
        (comp) => new ComponentTreeItem(comp)
      );
      const hookItems = fileNode.hooks.map((hook) => new HookTreeItem(hook));
      // Sort components and hooks alphabetically by name
      componentItems.sort((a, b) => a.label.localeCompare(b.label));
      hookItems.sort((a, b) => a.label.localeCompare(b.label));
      return Promise.resolve([...componentItems, ...hookItems]);
    }

    // If asking for children of a Component node (to show rendered components AND used hooks)
    if (element instanceof ComponentTreeItem) {
      const componentNode = element.componentNode;
      const children: vscode.TreeItem[] = [];

      // 1. Add rendered components (if any)
      if (
        componentNode.renderedComponents &&
        componentNode.renderedComponents.length > 0
      ) {
        const renderedItems = componentNode.renderedComponents
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((rendered) => {
            // Using MessageTreeItem for now, could be enhanced
            const item = new MessageTreeItem(`Renders: ${rendered.name}`);
            item.iconPath = new vscode.ThemeIcon("symbol-structure"); // Differentiate rendered
            // Add command to jump to render location?
            // item.command = { ... };
            return item;
          });
        children.push(...renderedItems);
      }

      // 2. Add used hooks (if any)
      if (componentNode.hooksUsed && componentNode.hooksUsed.length > 0) {
        const hookItems = componentNode.hooksUsed
          .sort((a, b) => a.hookName.localeCompare(b.hookName))
          .map((hookUse) => {
            // Use MessageTreeItem to satisfy the TreeNode[] return type
            const item = new MessageTreeItem(`Uses: ${hookUse.hookName}`);
            item.iconPath = new vscode.ThemeIcon("symbol-variable"); // Icon for used hook
            item.tooltip = `Hook Used: ${hookUse.hookName}\nClick to navigate`;
            item.contextValue = "hookUsage"; // Context for potential actions
            // Command to jump to the hook usage location
            item.command = {
              command: "vscode.open",
              title: "Go to Hook Usage",
              arguments: [
                hookUse.location.uri,
                { selection: hookUse.location.range },
              ],
            };
            return item;
          });
        children.push(...hookItems);
      }

      return Promise.resolve(children as TreeNode[]);
    }

    // Hooks and Messages don't have children currently
    return Promise.resolve([]);
  }
}
