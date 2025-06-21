import * as vscode from "vscode";

import { IndexerService } from "./IndexerService";

export let outputChannel: vscode.OutputChannel;
export let indexerService: IndexerService;

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

  indexerService = new IndexerService();
  context.subscriptions.push(indexerService); // Assuming IndexerService has a dispose method
}
