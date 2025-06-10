import * as vscode from "vscode";
import { FileNode, ComponentNode, HookNode, BaseNode } from "./types";

// Union type for all possible elements in the tree
export type TreeNode =
  | FileTreeItem
  | ComponentTreeItem
  | HookTreeItem
  | MessageTreeItem;

// Base class for tree items to reduce boilerplate
abstract class BaseTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly node?: BaseNode // Optional reference back to the original analysis node
  ) {
    super(label, collapsibleState);
  }

  // Define common properties or methods if needed
}

// Represents a file in the tree
export class FileTreeItem extends BaseTreeItem {
  constructor(public readonly fileNode: FileNode) {
    super(
      fileNode.name, // Use basename for the label
      vscode.TreeItemCollapsibleState.Collapsed, // Files are expandable
      fileNode
    );
    this.description = vscode.workspace.asRelativePath(
      fileNode.filePath,
      false
    ); // Show relative path
    this.resourceUri = vscode.Uri.file(fileNode.filePath); // Used for icon theme
    this.contextValue = "file"; // For context menus
    // Set icon based on file type (optional, VS Code often handles this)
    this.iconPath = vscode.ThemeIcon.File;
  }
}

// Represents a component in the tree
export class ComponentTreeItem extends BaseTreeItem {
  constructor(public readonly componentNode: ComponentNode) {
    const hasRenderedChildren = componentNode.renderedComponents?.length > 0;
    const hasUsedHooks = componentNode.hooksUsed?.length > 0;
    super(
      componentNode.name,
      hasRenderedChildren || hasUsedHooks // Expandable if it renders components OR uses hooks
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
      componentNode
    );
    this.description = `${componentNode.exported ? "exported" : "local"}, ${
      componentNode.isClassComponent ? "class" : "func"
    }`;
    this.contextValue = "component";
    // TODO: Add icon differentiating class/function components?
    this.iconPath = new vscode.ThemeIcon("symbol-structure"); // Example icon

    // Add tooltip showing used hooks
    if (componentNode.hooksUsed && componentNode.hooksUsed.length > 0) {
      const hookNames = componentNode.hooksUsed
        .map((h) => h.hookName)
        .join(", ");
      this.tooltip = `Used Hooks: ${hookNames}`;
    } else {
      this.tooltip = `${componentNode.name} (Component)`; // Default tooltip
    }

    // Command to execute when clicked
    this.command = {
      command: "vscode.open",
      title: "Open File",
      arguments: [
        componentNode.location.uri,
        {
          selection: componentNode.location.range, // Jump to the definition
        },
      ],
    };
  }
}

// Represents a hook in the tree
export class HookTreeItem extends BaseTreeItem {
  constructor(public readonly hookNode: HookNode) {
    super(
      hookNode.name,
      vscode.TreeItemCollapsibleState.None, // Hooks are not expandable for now
      hookNode
    );
    this.description = `${hookNode.exported ? "exported" : "local"}`;
    this.contextValue = "hook";
    this.iconPath = new vscode.ThemeIcon("symbol-function"); // Example icon

    // Command to execute when clicked
    this.command = {
      command: "vscode.open",
      title: "Open File",
      arguments: [
        hookNode.location.uri,
        {
          selection: hookNode.location.range, // Jump to the definition
        },
      ],
    };
  }
}

// Represents a simple message in the tree (e.g., "Indexing..." or "No components found")
export class MessageTreeItem extends BaseTreeItem {
  constructor(label: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "message";
  }
}
