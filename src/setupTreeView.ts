import * as vscode from "vscode";
import { IndexerService } from "./IndexerService";
import { SidebarProvider } from "./SidebarProvider";

export let sidebarProvider: SidebarProvider; // Added

// --- Tree View Setup ---
export function setupTreeView(
  context: vscode.ExtensionContext,
  indexer: IndexerService
) {
  sidebarProvider = new SidebarProvider(indexer);
  const treeView = vscode.window.createTreeView("reactAnalysisSidebar", {
    treeDataProvider: sidebarProvider,
  });
  context.subscriptions.push(treeView);

  // Refresh tree when index updates
  const indexUpdateDisposable = indexer.onIndexUpdate(() => {
    sidebarProvider.refresh();
  });
  context.subscriptions.push(indexUpdateDisposable);
  // Also refresh tree after full index completes (might catch edge cases)
  // (Consider if this is redundant with per-file updates)
}
