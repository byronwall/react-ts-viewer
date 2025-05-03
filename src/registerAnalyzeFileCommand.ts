import * as path from "path";
import * as vscode from "vscode";
import { buildDependencyGraph } from "./buildDependencyGraph";

import { outputChannel } from "./initializeExtension";
import { getWebviewContent } from "./getWebviewContent";
import { IndexerService } from "./IndexerService";

export let webviewPanel: vscode.WebviewPanel | undefined;

export function registerAnalyzeFileCommand(
  context: vscode.ExtensionContext,
  indexer: IndexerService
) {
  const analyzeFileCommand = vscode.commands.registerCommand(
    "reactAnalysis.analyzeCurrentFile",
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage(
          "Open a file first to analyze dependencies."
        );
        return;
      }

      const filePath = editor.document.uri.fsPath;
      const column = vscode.ViewColumn.Active;

      if (webviewPanel) {
        webviewPanel.reveal(column);
        outputChannel.appendLine(
          `[Extension] Updating existing panel with file: ${filePath}`
        );
        webviewPanel.webview.postMessage({
          command: "setFile",
          filePath: filePath,
        });
        outputChannel.appendLine(
          `[Extension] Sent setFile message to existing panel for: ${filePath}`
        );
      } else {
        webviewPanel = vscode.window.createWebviewPanel(
          "dependencyAnalyzer",
          "Dependency Analyzer",
          column,
          {
            enableScripts: true,
            localResourceRoots: [
              vscode.Uri.joinPath(context.extensionUri, "out", "webview"),
            ],
          }
        );

        webviewPanel.webview.html = getWebviewContent(
          context,
          webviewPanel.webview,
          filePath
        );

        // --- Get workspace root (moved outside switch) ---
        const workspaceFolders = vscode.workspace.workspaceFolders;
        let workspaceRoot: string | undefined;
        if (workspaceFolders && workspaceFolders.length > 0) {
          workspaceRoot = workspaceFolders[0]?.uri.fsPath;
        } // Note: Handle cases where workspaceRoot might still be undefined if needed
        // ---

        // --- Declare variables outside switch ---
        let targetPath: string | undefined;
        // ---

        webviewPanel.webview.onDidReceiveMessage(
          (message) => {
            switch (message.command) {
              case "runAnalysis":
                // --- Assign targetPath here ---
                targetPath = message.filePath;
                // ---
                if (!targetPath) {
                  vscode.window.showErrorMessage(
                    "No file path provided for analysis."
                  );
                  return;
                }

                // --- Check if workspace root was found ---
                if (!workspaceRoot) {
                  vscode.window.showErrorMessage(
                    "React Analysis: Could not determine workspace root for analysis."
                  );
                  return;
                }
                // ---

                vscode.window.withProgress(
                  {
                    location: vscode.ProgressLocation.Notification,
                    title: `Analyzing ${path.basename(targetPath)}...`,
                    cancellable: false,
                  },
                  async (progress) => {
                    progress.report({
                      increment: 0,
                      message: "Checking index...",
                    });

                    const isIndexed = indexer.getIndexedData().has(targetPath!);
                    if (!isIndexed) {
                      outputChannel.appendLine(
                        `[Extension] File not indexed, parsing on demand: ${targetPath}`
                      );
                      progress.report({
                        increment: 10,
                        message: "Parsing file...",
                      });
                      try {
                        const parseResult = indexer.parseFile(targetPath!);
                        if (!parseResult) {
                          outputChannel.appendLine(
                            `[Extension] On-demand parsing failed for: ${targetPath}`
                          );
                          vscode.window.showErrorMessage(
                            `React Analysis: Failed to parse ${path.basename(
                              targetPath!
                            )}.`
                          );
                          return;
                        }
                        outputChannel.appendLine(
                          `[Extension] On-demand parsing successful for: ${targetPath}`
                        );
                      } catch (error: any) {
                        outputChannel.appendLine(
                          `[Extension] Error during on-demand parsing for ${targetPath}: ${error.message}`
                        );
                        vscode.window.showErrorMessage(
                          `React Analysis: Error parsing ${path.basename(
                            targetPath!
                          )}. See Output.`
                        );
                        return;
                      }
                    } else {
                      outputChannel.appendLine(
                        `[Extension] File already indexed: ${targetPath}`
                      );
                    }

                    progress.report({
                      increment: 30,
                      message: "Building graph...",
                    });
                    const maxDepth = message.settings?.maxDepth ?? 5;

                    const results = buildDependencyGraph(
                      targetPath!,
                      maxDepth,
                      indexer, // Pass the service instance
                      workspaceRoot // <-- Pass workspace root
                    );

                    progress.report({ increment: 100, message: "Done!" });
                    webviewPanel?.webview.postMessage({
                      command: "showResults",
                      data: results,
                    });
                  }
                );
                return;
            }
          },
          undefined,
          context.subscriptions
        );

        webviewPanel.onDidDispose(
          () => {
            webviewPanel = undefined;
          },
          null,
          context.subscriptions
        );
        context.subscriptions.push(webviewPanel); // Ensure panel is disposed when extension deactivates
      }
    }
  );
  context.subscriptions.push(analyzeFileCommand);
}
