import * as fs from "fs"; // Import fs for reading file content
import * as vscode from "vscode";
import { buildScopeTree } from "./buildScopeTree"; // Import the new tree builder
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

  // Register a command to handle "getScopeTree" from webview
  // This might be part of reactAnalysis.analyzeCurrentFile or a separate command
  // For simplicity, adding a new one here.
  // This command is more of an internal handler for messages from an *existing* webview.
  // The webview panel creation and initial message passing should be handled by whatever command shows the panel.

  // The message listener should be set up when the panel is created.
  // Assuming getWebviewPanel() in initializeExtension.ts sets up and returns the panel,
  // and also sets up its onDidReceiveMessage listener.

  // Example of how message handling might be structured if centralized or added to panel creation:
  // (This is conceptual - actual implementation depends on how your webview panel is managed)
  // const panel = getWebviewPanel(); // Or however you access your panel
  // if (panel) {
  //   panel.webview.onDidReceiveMessage(
  //     async message => {
  //       switch (message.command) {
  //         case 'getScopeTree':
  //           try {
  //             if (!message.filePath) {
  //               throw new Error("File path is required to get scope tree.");
  //             }
  //             outputChannel.appendLine(`[Extension] Received getScopeTree command for: ${message.filePath}`);
  //             const fileContent = fs.readFileSync(message.filePath, "utf8");
  //             const tree = buildScopeTree(message.filePath, fileContent);
  //             panel.webview.postMessage({ command: 'showScopeTree', data: tree });
  //           } catch (e: any) {
  //             outputChannel.appendLine(`[Extension] Error building scope tree: ${e.message}`);
  //             vscode.window.showErrorMessage(`Error building scope tree: ${e.message}`);
  //             panel.webview.postMessage({ command: 'showScopeTreeError', error: e.message });
  //           }
  //           return;
  //         case 'revealCode':
  //           try {
  //             const { filePath, loc } = message;
  //             if (!filePath || !loc || !loc.start || !loc.end) {
  //               throw new Error("File path and location are required to reveal code.");
  //             }
  //             outputChannel.appendLine(`[Extension] Received revealCode command for: ${filePath} L${loc.start.line}:${loc.start.column}`);
  //             const document = await vscode.workspace.openTextDocument(filePath);
  //             const editor = await vscode.window.showTextDocument(document);
  //             // VS Code Position is 0-based for line and character
  //             const startPosition = new vscode.Position(loc.start.line - 1, loc.start.column);
  //             const endPosition = new vscode.Position(loc.end.line - 1, loc.end.column);
  //             editor.selection = new vscode.Selection(startPosition, endPosition);
  //             editor.revealRange(new vscode.Range(startPosition, endPosition), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  //           } catch (e: any) {
  //             outputChannel.appendLine(`[Extension] Error revealing code: ${e.message}`);
  //             vscode.window.showErrorMessage(`Error revealing code: ${e.message}`);
  //           }
  //           return;
  //         // ... other existing message handlers from your analyzeFileCommand or similar ...
  //         case 'analyzeDocument': // Example: if your graph analysis is also triggered by message
  //             // ... your existing logic for analyzeDocument ...
  //             return;
  //       }
  //     },
  //     undefined,
  //     context.subscriptions
  //   );
  // }

  // It's more likely that onDidReceiveMessage is set up when the webview panel is created.
  // The `initializeExtension` or the command that creates/shows the panel is responsible for this.
  // I will add the handlers to where the panel would be created/managed,
  // often within the command that shows the webview.
  // For now, I'm adding registration for the 'revealCode' and 'getScopeTree'
  // This assumes that the panel is already created and `getWebviewPanel()` will return it.

  // It is crucial that the webview's onDidReceiveMessage listener is set up correctly.
  // If `registerAnalyzeFileCommand` or a similar function creates the webview,
  // the message handling logic should be integrated there.

  // For `getScopeTree` to work, the webview needs to know the current file path.
  // This path is usually sent when the webview is first opened or when a new file is focused.
  // The `App.tsx` should already have a mechanism to get this (e.g. `fileOpened` message).

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

// Helper function to be called from where the webview panel is managed
// This would typically be inside the command that creates/shows the webview panel.
// e.g., inside registerAnalyzeFileCommand.ts or a new registerShowViewCommand.ts
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

        // Add other message handlers like 'analyzeDocument' (for graph view) here
        // if they are not already handled within their respective registration files.
        // For example:
        // case 'analyzeDocument':
        //   // ... logic to get graph data ...
        //   // panel.webview.postMessage({ command: 'analysisResult', data: graphData });
        //   return;
      }
    },
    undefined,
    context.subscriptions
  );

  // Send initial file context if available, or on editor change
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
      panel.webview.postMessage({ command: "fileOpened", filePath: filePath });
    }
  };

  sendActiveFile(); // Send on panel creation/setup
  vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (
        editor &&
        panel.visible &&
        (editor.document.languageId === "typescript" ||
          editor.document.languageId === "typescriptreact")
      ) {
        sendActiveFile();
      }
    },
    null,
    context.subscriptions
  );

  // When the panel is disposed, clean up subscriptions or other resources if needed
  // panel.onDidDispose(() => { /* cleanup */ }, null, context.subscriptions);
}
