import * as path from "path";
import * as vscode from "vscode";
import { buildDependencyGraph } from "./buildDependencyGraph";

import { outputChannel } from "./initializeExtension";
import { getWebviewContent } from "./getWebviewContent";
import { IndexerService } from "./IndexerService";
import { setupWebviewPanelMessageHandler } from "./setupWebviewPanelMessageHandler";

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

        // Setup the message handler for webview communication
        setupWebviewPanelMessageHandler(webviewPanel, context);

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
          async (message) => {
            console.log("[Extension] Received message:", message);
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
              case "openFile":
                console.log("[Extension] Handling openFile:", message.payload);
                if (message.payload?.filePath) {
                  try {
                    const uri = vscode.Uri.file(message.payload.filePath);
                    console.log(
                      "[Extension] Attempting to open file:",
                      uri.fsPath
                    );
                    await vscode.window.showTextDocument(uri);
                    console.log(
                      "[Extension] Successfully opened file:",
                      uri.fsPath
                    );
                  } catch (error) {
                    console.error("[Extension] Error opening file:", error);
                    vscode.window.showErrorMessage(
                      `Error opening file: ${error}`
                    );
                  }
                } else {
                  console.warn(
                    "[Extension] openFile command missing filePath payload."
                  );
                }
                return;
              case "findReferences":
                console.log(
                  "[Extension] Handling findReferences:",
                  message.payload
                );
                if (message.payload?.filePath && message.payload?.symbolName) {
                  try {
                    const uri = vscode.Uri.file(message.payload.filePath);
                    const symbolName = message.payload.symbolName;
                    console.log(
                      `[Extension] Attempting findReferences for symbol '${symbolName}' in file:`,
                      uri.fsPath
                    );

                    // Open the document first
                    const document = await vscode.workspace.openTextDocument(
                      uri
                    );
                    await vscode.window.showTextDocument(document);

                    // Find the first occurrence (simple approach)
                    const text = document.getText();
                    const firstOccurrenceOffset = text.indexOf(symbolName);
                    let position = new vscode.Position(0, 0); // Default to start
                    if (firstOccurrenceOffset !== -1) {
                      position = document.positionAt(firstOccurrenceOffset);
                      console.log(
                        `[Extension] Found first occurrence of '${symbolName}' at line ${
                          position.line + 1
                        }, char ${position.character + 1}`
                      );
                    } else {
                      console.warn(
                        `[Extension] Could not find symbol '${symbolName}' in file ${uri.fsPath} for positioning.`
                      );
                    }

                    // Move cursor to the approximate position AND show references
                    const editor = vscode.window.activeTextEditor;
                    if (editor && editor.document.uri.fsPath === uri.fsPath) {
                      editor.selection = new vscode.Selection(
                        position,
                        position
                      );
                      editor.revealRange(new vscode.Range(position, position));
                      console.log(
                        "[Extension] Moved cursor to symbol position."
                      );

                      // Step 1: Get reference locations programmatically
                      console.log(
                        `[Extension] Executing references-view.findReferences`
                      );
                      await vscode.commands.executeCommand(
                        "references-view.findReferences"
                      );
                      console.log(
                        "[Extension] references-view.findReferences command executed."
                      );
                    } else {
                      console.warn(
                        "[Extension] Could not move cursor - active editor mismatch or unavailable."
                      );
                    }
                  } catch (error) {
                    console.error(
                      "[Extension] Error finding references:",
                      error
                    );
                    vscode.window.showErrorMessage(
                      `Error finding references: ${error}`
                    );
                  }
                } else {
                  console.warn(
                    "[Extension] findReferences command missing filePath or symbolName payload."
                  );
                }
                return;
              default:
                console.warn(
                  "[Extension] Received unknown command:",
                  message.command
                );
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
