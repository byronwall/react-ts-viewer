import * as fs from "fs";
import * as vscode from "vscode";
import { buildScopeTree } from "./parsers/buildScopeTree";
import { outputChannel } from "./initializeExtension";

// State management
interface WebviewState {
  filePath?: string;
  activeView?: string;
  treemapSettings?: any;
  settings?: any;
  currentAnalysisTarget?: string;
  isSettingsPanelOpen?: boolean;
}

// Global state storage key
const WEBVIEW_STATE_KEY = "reactAnalysisWebviewState";

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
        case "saveWebviewState":
          try {
            await context.globalState.update(WEBVIEW_STATE_KEY, message.state);
          } catch (e: any) {
            // Error handling without logging
          }
          return;

        case "getWebviewState":
          try {
            const savedState =
              context.globalState.get<WebviewState>(WEBVIEW_STATE_KEY);
            panel.webview.postMessage({
              command: "webviewStateResponse",
              state: savedState || null,
            });
          } catch (e: any) {
            panel.webview.postMessage({
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

        // It's good practice to have a default case, though not strictly necessary
        // if all known commands are handled.
        default:
          outputChannel.appendLine(
            `[Extension] Received unknown command from webview: ${message.command}`
          );
          // Optionally, inform the webview or user about the unknown command
          // vscode.window.showWarningMessage(`Unknown command received: ${message.command}`);
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
