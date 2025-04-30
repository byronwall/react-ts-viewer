import * as path from "path";
import * as vscode from "vscode";
import { outputChannel } from "./initializeExtension";
import { IndexerService } from "./IndexerService";

// --- Command Registrations ---
export function registerIndexWorkspaceCommand(
  context: vscode.ExtensionContext,
  indexer: IndexerService
) {
  const indexWorkspaceCommand = vscode.commands.registerCommand(
    "reactAnalysis.indexWorkspace",
    async () => {
      outputChannel.show(true); // Show the output channel
      outputChannel.appendLine("Starting workspace indexing...");
      vscode.window.showInformationMessage(
        "React Analysis: Starting Workspace Index..."
      );

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage(
          "React Analysis: No workspace folder open."
        );
        outputChannel.appendLine("Error: No workspace folder open.");
        return; // Exit early
      }

      // --- Start of code that assumes workspaceFolders is valid ---
      const firstFolder = workspaceFolders[0];
      // Add an explicit check for firstFolder, even if redundant, to satisfy TS
      if (!firstFolder) {
        vscode.window.showErrorMessage(
          "React Analysis: Could not determine workspace folder unexpectedly."
        );
        outputChannel.appendLine(
          "Error: Unexpectedly failed to get first workspace folder."
        );
        return;
      }

      const workspaceRoot = firstFolder.uri.fsPath;
      outputChannel.appendLine(`Workspace root: ${workspaceRoot}`);

      // Get include/exclude patterns from configuration
      const config = vscode.workspace.getConfiguration("reactAnalysis");
      const entryPointPatterns: string[] = config.get("entryPoints") || [];
      const excludeConfigPatterns: string[] =
        config.get("excludePatterns") || [];

      // Separate entry points into include and explicit exclude (those starting with !)
      const includePatterns: string[] = [];
      const explicitExcludePatterns: string[] = [];
      for (const pattern of entryPointPatterns) {
        if (pattern.startsWith("!")) {
          explicitExcludePatterns.push(pattern.substring(1)); // Remove the leading !
        } else {
          includePatterns.push(pattern);
        }
      }

      // Combine explicit excludes from entryPoints with general excludePatterns
      const allExcludePatterns = [
        ...explicitExcludePatterns,
        ...excludeConfigPatterns,
      ];

      if (includePatterns.length === 0) {
        vscode.window.showErrorMessage(
          "React Analysis: No include patterns found in reactAnalysis.entryPoints configuration."
        );
        outputChannel.appendLine(
          "Error: No include patterns configured in reactAnalysis.entryPoints."
        );
        return;
      }

      outputChannel.appendLine(
        `Include patterns: ${includePatterns.join(", ")}`
      );
      outputChannel.appendLine(
        `Exclude patterns: ${allExcludePatterns.join(", ")}`
      );

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "React Analysis: Indexing Workspace",
          cancellable: false, // Consider adding cancellation support later
        },
        async (progress) => {
          progress.report({ increment: 0, message: "Finding files..." });

          let filesParsed = 0;
          let componentsFound = 0;
          let hooksFound = 0;
          const startTime = Date.now();

          try {
            // --- Use vscode.workspace.findFiles instead of glob ---
            let includePattern: string;
            if (includePatterns.length > 1) {
              includePattern = `{${includePatterns.join(",")}}`;
            } else {
              includePattern = includePatterns[0]!;
            }

            const excludePattern =
              allExcludePatterns.length > 0
                ? allExcludePatterns.join(",")
                : undefined;
            outputChannel.appendLine(
              `Using findFiles - Include: ${includePattern}`
            );
            outputChannel.appendLine(
              `Using findFiles - Exclude: ${excludePattern || "(none)"}`
            );

            const fileUris = await vscode.workspace.findFiles(
              includePattern,
              excludePattern
            );

            const filePaths = fileUris.map((uri) => uri.fsPath);
            const totalFiles = filePaths.length;
            outputChannel.appendLine(
              `Found ${totalFiles} files matching patterns.`
            );
            progress.report({
              increment: 0,
              message: `Found ${totalFiles} files. Starting parsing...`,
            });

            for (const [index, filePath] of filePaths.entries()) {
              const relativePath = path.relative(workspaceRoot, filePath);
              const progressPercentage = ((index + 1) / totalFiles) * 100;

              progress.report({
                increment: 100 / totalFiles,
                message: `(${
                  index + 1
                }/${totalFiles}) Parsing: ${relativePath}`,
              });

              outputChannel.appendLine(
                `[${progressPercentage.toFixed(0)}%] Parsing: ${relativePath}`
              );

              const result = indexer.parseFile(filePath);
              if (result) {
                filesParsed++;
                componentsFound += result.components.length;
                hooksFound += result.hooks.length;
                // TODO: Store the result (e.g., in a map) if needed globally
              }
            }

            const duration = (Date.now() - startTime) / 1000;
            const summary = `Indexing complete in ${duration.toFixed(
              2
            )}s. Parsed ${filesParsed} files. Found ${componentsFound} components, ${hooksFound} hooks.`;
            outputChannel.appendLine(summary);
            vscode.window.showInformationMessage(`React Analysis: ${summary}`);
          } catch (error: any) {
            const errorMessage = `Error during indexing: ${error.message}`;
            console.error(errorMessage, error);
            outputChannel.appendLine(errorMessage);
            vscode.window.showErrorMessage(
              "React Analysis: Error during indexing. See Output panel for details."
            );
          }
        }
      ); // End of vscode.window.withProgress
    }
  );
  context.subscriptions.push(indexWorkspaceCommand);
}
