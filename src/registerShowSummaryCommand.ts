import * as vscode from "vscode";
import { outputChannel } from "./initializeExtension";
import { IndexerService } from "./IndexerService";

export function registerShowSummaryCommand(
  context: vscode.ExtensionContext,
  indexer: IndexerService
) {
  const showSummaryCommand = vscode.commands.registerCommand(
    "reactAnalysis.showIndexedSummary",
    () => {
      const indexedData = indexer.getIndexedData();
      const fileCount = indexedData.size;
      let componentCount = 0;
      let hookCount = 0;

      if (fileCount === 0) {
        const msg =
          "No data indexed yet. Run 'React Analysis: Index Workspace' first.";
        outputChannel.appendLine(msg);
        vscode.window.showInformationMessage(msg);
        return;
      }

      outputChannel.appendLine("\n--- Indexed Data Details ---");
      for (const [filePath, fileNode] of indexedData.entries()) {
        const relativePath = vscode.workspace.asRelativePath(filePath, false);
        outputChannel.appendLine(`File: ${relativePath}`);
        componentCount += fileNode.components.length;
        hookCount += fileNode.hooks.length;

        if (fileNode.components.length > 0) {
          outputChannel.appendLine(
            `  Components (${fileNode.components.length}):`
          );
          fileNode.components.forEach((comp) => {
            outputChannel.appendLine(
              `    - ${comp.name} (${comp.exported ? "exported" : "local"}, ${
                comp.isClassComponent ? "class" : "func"
              })`
            );
            if (comp.renderedComponents && comp.renderedComponents.length > 0) {
              outputChannel.appendLine(`      Rendered:`);
              comp.renderedComponents.forEach((rendered) => {
                outputChannel.appendLine(`        - ${rendered.name}`);
              });
            }
          });
        }
        if (fileNode.hooks.length > 0) {
          outputChannel.appendLine(`  Hooks (${fileNode.hooks.length}):`);
          fileNode.hooks.forEach((hook) => {
            outputChannel.appendLine(
              `    - ${hook.name} (${hook.exported ? "exported" : "local"})`
            );
          });
        }
        if (fileNode.components.length === 0 && fileNode.hooks.length === 0) {
          outputChannel.appendLine(`  (No components or hooks found)`);
        }
      }
      outputChannel.appendLine("----------------------------");

      const summary = `Indexed Data Summary: ${fileCount} files, ${componentCount} components, ${hookCount} hooks found. Details logged to Output channel.`;
      vscode.window.showInformationMessage(summary);
      outputChannel.show(true);
    }
  );
  context.subscriptions.push(showSummaryCommand);
}
