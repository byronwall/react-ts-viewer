import * as vscode from "vscode";
import {
  indexerService,
  initializeExtension,
  outputChannel,
} from "./initializeExtension";
import { setupTreeView } from "./setupTreeView";
import { registerIndexWorkspaceCommand } from "./registerIndexWorkspaceCommand";
import { registerShowSummaryCommand } from "./registerShowSummaryCommand";
import { registerAnalyzeFileCommand } from "./registerAnalyzeFileCommand";

// Keep track of the status bar item
let analyzeFileStatusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  initializeExtension(context);
  setupTreeView(context, indexerService); // Pass indexerService
  registerIndexWorkspaceCommand(context, indexerService); // Pass indexerService
  registerShowSummaryCommand(context, indexerService); // Pass indexerService
  registerAnalyzeFileCommand(context, indexerService); // Pass indexerService

  // Create status bar item
  analyzeFileStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  analyzeFileStatusBarItem.command = "reactAnalysis.analyzeCurrentFile";
  analyzeFileStatusBarItem.text = `$(microscope) Analyze File`;
  analyzeFileStatusBarItem.tooltip = "Analyze Current React File";
  context.subscriptions.push(analyzeFileStatusBarItem);

  // Show the status bar item
  analyzeFileStatusBarItem.show();

  // Optionally trigger initial index on startup if configured?
  // const config = vscode.workspace.getConfiguration("reactAnalysis");
  // if (config.get('indexOnStartup')) {
  //     vscode.commands.executeCommand('reactAnalysis.indexWorkspace');
  // }
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
