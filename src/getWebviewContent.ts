import * as vscode from "vscode";
import { outputChannel } from "./initializeExtension";
import { getNonce } from "./getNonce";

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

  return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}';">
			<link href="${styleUri}" rel="stylesheet">
			<title>Dependency Analyzer</title>
		</head>
		<body>
			<div id="root"></div>
			<script nonce="${nonce}">
				// Pass initial data to the webview
				const vscode = acquireVsCodeApi();
				const initialData = {
					filePath: ${initialFilePathJson} // Embed the JSON stringified path
				};
				vscode.setState(initialData);
			</script>
			<script nonce="${nonce}" src="${scriptUri}"></script>
		</body>
		</html>`;
}
