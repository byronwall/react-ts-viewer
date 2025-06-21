import * as fs from "fs";
import * as vscode from "vscode";

import { getWebviewContent } from "./getWebviewContent";
import { outputChannel } from "./initializeExtension";
import { buildScopeTree } from "./parsers/buildScopeTree";

let webviewPanel: vscode.WebviewPanel | undefined;

export function registerAnalyzeFileCommand(context: vscode.ExtensionContext) {
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
          command: "fileOpened",
          filePath: filePath,
        });
        outputChannel.appendLine(
          `[Extension] Sent fileOpened message to existing panel for: ${filePath}`
        );
      } else {
        webviewPanel = vscode.window.createWebviewPanel(
          "dependencyAnalyzer",
          "Dependency Analyzer",
          column,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
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

        webviewPanel.webview.onDidReceiveMessage(
          async (message) => {
            console.log("[Extension] Received message:", message);
            switch (message.command) {
              case "saveWebviewState":
                try {
                  await context.globalState.update(
                    "reactAnalysisWebviewState",
                    message.state
                  );
                } catch (e: any) {
                  // Error handling without logging
                }
                return;

              case "getWebviewState":
                try {
                  const savedState = context.globalState.get(
                    "reactAnalysisWebviewState"
                  );
                  webviewPanel?.webview.postMessage({
                    command: "webviewStateResponse",
                    state: savedState || null,
                  });
                } catch (e: any) {
                  webviewPanel?.webview.postMessage({
                    command: "webviewStateResponse",
                    state: null,
                  });
                }
                return;

              case "getScopeTree":
                try {
                  if (!message.filePath) {
                    throw new Error("File path is required to get scope tree.");
                  }
                  outputChannel.appendLine(
                    `[Extension] Webview requested scope tree for: ${message.filePath} with options: ${JSON.stringify(message.options || {})}`
                  );
                  const fileContent = await fs.promises.readFile(
                    message.filePath,
                    "utf8"
                  );
                  const tree = buildScopeTree(
                    message.filePath,
                    fileContent,
                    message.options
                  );
                  webviewPanel?.webview.postMessage({
                    command: "showScopeTree",
                    data: tree,
                    filePath: message.filePath,
                  });
                } catch (e: any) {
                  outputChannel.appendLine(
                    `[Extension] Error building scope tree: ${e.message}`
                  );
                  vscode.window.showErrorMessage(
                    `Error building scope tree for ${message.filePath}: ${e.message}`
                  );
                  webviewPanel?.webview.postMessage({
                    command: "showScopeTreeError",
                    error: e.message,
                    filePath: message.filePath,
                  });
                }
                return;

              case "revealCode":
                try {
                  const { filePath, loc } = message;
                  if (!filePath || !loc || !loc.start || !loc.end) {
                    throw new Error(
                      "File path and location are required to reveal code."
                    );
                  }
                  outputChannel.appendLine(
                    `[Extension] Webview requested revealCode for: ${filePath} L${loc.start.line}`
                  );

                  const uri = vscode.Uri.file(filePath);
                  const document = await vscode.workspace.openTextDocument(uri);
                  const editor = await vscode.window.showTextDocument(
                    document,
                    {
                      preview: false,
                    }
                  );

                  // VS Code Position is 0-based for line and character
                  // Our Position type is 1-based for line, 0-based for column
                  const startPosition = new vscode.Position(
                    loc.start.line - 1,
                    loc.start.column
                  );
                  const endPosition = new vscode.Position(
                    loc.end.line - 1,
                    loc.end.column
                  );

                  const range = new vscode.Range(startPosition, endPosition);
                  editor.selection = new vscode.Selection(
                    range.start,
                    range.end
                  );
                  editor.revealRange(
                    range,
                    vscode.TextEditorRevealType.InCenterIfOutsideViewport
                  );
                } catch (e: any) {
                  outputChannel.appendLine(
                    `[Extension] Error revealing code: ${e.message}`
                  );
                  vscode.window.showErrorMessage(
                    `Error revealing code: ${e.message}`
                  );
                }
                return;

              case "showInformationMessage":
                if (message.text && typeof message.text === "string") {
                  vscode.window.showInformationMessage(message.text);
                }
                return;

              case "showErrorMessage":
                if (message.text && typeof message.text === "string") {
                  vscode.window.showErrorMessage(message.text);
                }
                return;
            }
          },
          undefined,
          context.subscriptions
        );

        // Send initial file context if available
        const sendActiveFile = () => {
          const editor = vscode.window.activeTextEditor;
          if (
            editor &&
            (editor.document.languageId === "typescript" ||
              editor.document.languageId === "typescriptreact" ||
              editor.document.languageId === "css" ||
              editor.document.languageId === "scss")
          ) {
            const filePath = editor.document.uri.fsPath;
            outputChannel.appendLine(
              `[Extension] Sending initial/active file to webview: ${filePath}`
            );
            webviewPanel?.webview.postMessage({
              command: "fileOpened",
              filePath: filePath,
            });
          }
        };

        // Send initial file info when panel is created
        sendActiveFile();

        // Update on editor change
        context.subscriptions.push(
          vscode.window.onDidChangeActiveTextEditor(() => {
            if (webviewPanel?.visible) {
              sendActiveFile();
            }
          })
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
