import * as fs from "fs";
import * as vscode from "vscode";
import { buildScopeTree } from "./buildScopeTree";
import { outputChannel } from "./initializeExtension";

/**
 * Sets up message handler for webview panel communication
 * Handles commands like getScopeTree and revealCode from the webview
 */
export function setupWebviewPanelMessageHandler(
  panel: vscode.WebviewPanel,
  context: vscode.ExtensionContext
) {
  panel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case "getScopeTree":
          try {
            if (!message.filePath) {
              throw new Error("File path is required to get scope tree.");
            }
            outputChannel.appendLine(
              `[Extension] Webview requested scope tree for: ${message.filePath}`
            );
            const fileContent = await fs.promises.readFile(
              message.filePath,
              "utf8"
            );
            const tree = buildScopeTree(message.filePath, fileContent);
            panel.webview.postMessage({
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
            panel.webview.postMessage({
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
            const editor = await vscode.window.showTextDocument(document, {
              preview: false,
            });

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
            editor.selection = new vscode.Selection(range.start, range.end);
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
        editor.document.languageId === "typescriptreact")
    ) {
      const filePath = editor.document.uri.fsPath;
      outputChannel.appendLine(
        `[Extension] Sending initial/active file to webview: ${filePath}`
      );
      panel.webview.postMessage({
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
      if (panel.visible) {
        sendActiveFile();
      }
    })
  );
}
