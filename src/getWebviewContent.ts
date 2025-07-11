import * as vscode from "vscode";

import { getNonce } from "./getNonce";
import { outputChannel } from "./initializeExtension";

export function getWebviewContent(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  initialFilePath: string
): string {
  outputChannel.appendLine(
    `[Extension] getWebviewContent called with initialFilePath: ${initialFilePath}`
  );
  // Get the paths to the required resources on disk
  const scriptPathOnDisk = vscode.Uri.joinPath(
    context.extensionUri,
    "out",
    "webview",
    "bundle.js"
  );
  const stylePathOnDisk = vscode.Uri.joinPath(
    context.extensionUri,
    "out",
    "webview",
    "bundle.css"
  );

  // And convert them into URIs usable inside the webview
  const scriptUri = webview.asWebviewUri(scriptPathOnDisk);
  const styleUri = webview.asWebviewUri(stylePathOnDisk);

  // Use a nonce to only allow specific scripts to be run
  const nonce = getNonce();

  // Safely embed the initial file path into the JavaScript string
  const initialFilePathJson = JSON.stringify(initialFilePath);
  outputChannel.appendLine(
    `[Extension] Embedding initial path as JSON string: ${initialFilePathJson}`
  );

  // Get workspace root path (handle potential undefined case)
  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";

  return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${
        webview.cspSource
      } 'unsafe-inline'; img-src ${
        webview.cspSource
      } https: data:; script-src 'nonce-${nonce}'; connect-src ${
        webview.cspSource
      } https: data:;">
			<link href="${styleUri}" rel="stylesheet">
			<title>Dependency Analyzer</title>
			<script nonce="${nonce}">
				// Pass initial data to the webview via window object
				const initialData = {
					filePath: ${initialFilePathJson} // Embed the JSON stringified path
				};
				// Remove vscode.setState - state should be handled by the React app
				// vscode.setState(initialData);

				// Inject initial data and workspace root using JSON.stringify for safe escaping
				window.initialData = initialData;
				window.initialWorkspaceRoot = ${JSON.stringify(workspaceRoot)};
			</script>
		</head>
		<body>
			<div id="root"></div>
			<script nonce="${nonce}" src="${scriptUri}"></script>
		</body>
		</html>`;
}
