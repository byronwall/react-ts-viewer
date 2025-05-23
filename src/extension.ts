import * as fs from "fs"; // Import fs for reading file content
import * as vscode from "vscode";
import { buildScopeTree } from "./parsers/buildScopeTree"; // Import the new tree builder
import {
  indexerService,
  initializeExtension,
  outputChannel,
} from "./initializeExtension";
import { registerAnalyzeFileCommand } from "./registerAnalyzeFileCommand";
import { registerIndexWorkspaceCommand } from "./registerIndexWorkspaceCommand";
import { registerShowSummaryCommand } from "./registerShowSummaryCommand";
import { setupTreeView } from "./setupTreeView";

// Keep track of the status bar item
let analyzeFileStatusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  initializeExtension(context); // This should set up webview panel handling
  setupTreeView(context, indexerService);
  registerIndexWorkspaceCommand(context, indexerService);
  registerShowSummaryCommand(context, indexerService);
  registerAnalyzeFileCommand(context, indexerService);

  // Create status bar item
  analyzeFileStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  analyzeFileStatusBarItem.command = "reactAnalysis.analyzeCurrentFile"; // Or a new command that opens the view
  analyzeFileStatusBarItem.text = `$(microscope) Analyze File`;
  analyzeFileStatusBarItem.tooltip =
    "Analyze Current React File (Graph/Treemap)";
  context.subscriptions.push(analyzeFileStatusBarItem);
  analyzeFileStatusBarItem.show();

  outputChannel.appendLine(
    "React TS Code Analysis extension activated with Treemap capability."
  );
}

// This method is called when your extension is deactivated
export function deactivate() {
  // indexerService and outputChannel are disposed via context.subscriptions
  // if they were added correctly during initialization.
  // webviewPanel is also disposed via context.subscriptions if it was created.

  // Explicitly log deactivation
  if (outputChannel) {
    outputChannel.appendLine("React TS Code Analysis extension deactivated.");
  } else {
    console.log("React TS Code Analysis extension deactivated."); // Fallback logging
  }

  // No need to explicitly dispose things added to context.subscriptions
  // vscode handles that automatically.

  // Optional: Log which resources *were* disposed if needed for debugging
  // console.log("Disposed resources:", context.subscriptions);
}
