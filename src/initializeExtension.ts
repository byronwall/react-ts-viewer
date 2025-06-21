import * as vscode from "vscode";

export let outputChannel: vscode.OutputChannel;

// --- Initialization ---
export function initializeExtension(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "react-ts-code-analysis" is now active!'
  );
  outputChannel = vscode.window.createOutputChannel(
    "React Analysis | Dependency View"
  );
  outputChannel.appendLine(
    "React TS Code Analysis extension activated. " + Math.random()
  );
  context.subscriptions.push(outputChannel);
}
