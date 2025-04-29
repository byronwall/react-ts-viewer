import * as vscode from "vscode";
import { IndexerService } from "./IndexerService";
import { glob } from "glob"; // Use glob for finding files matching patterns
import * as path from "path";

let indexerService: IndexerService;
let outputChannel: vscode.OutputChannel;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "react-ts-code-analysis" is now active!'
  );
  outputChannel = vscode.window.createOutputChannel("React Analysis");
  outputChannel.appendLine("React TS Code Analysis extension activated.");

  indexerService = new IndexerService();

  // --- Command Registrations ---

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
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
        // Exit early if no workspace folder
      } else {
        // --- Start of code that assumes workspaceFolders is valid ---
        const firstFolder = workspaceFolders[0]; // Now definitely safe
        // Add an explicit check for firstFolder, even if redundant, to satisfy TS
        if (firstFolder) {
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
            return; // Return inside the inner if
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

              // Combine default ignore with configured excludes
              // const ignorePatterns = ["**/node_modules/**", ...excludePatterns]; // No longer needed for findFiles
              // outputChannel.appendLine(`Ignore patterns: ${ignorePatterns.join(", ")}`);

              let filesParsed = 0;
              let componentsFound = 0;
              let hooksFound = 0;
              const startTime = Date.now();

              try {
                // --- Use vscode.workspace.findFiles instead of glob ---
                // Construct patterns suitable for findFiles
                let includePattern: string; // Explicitly type as string
                if (includePatterns.length > 1) {
                  includePattern = `{${includePatterns.join(",")}}`;
                } else {
                  // Since we checked for length === 0 earlier, length must be 1 here.
                  // Use non-null assertion as we know it's safe.
                  includePattern = includePatterns[0]!;
                }

                const excludePattern =
                  allExcludePatterns.length > 0
                    ? allExcludePatterns.join(",") // Simply join with comma
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
                  // Can add maxResults and CancellationToken if needed
                );

                // Convert Uris to file paths
                const filePaths = fileUris.map((uri) => uri.fsPath);
                // --- End of findFiles usage ---

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

                  // Report progress to the notification
                  progress.report({
                    increment: 100 / totalFiles, // Increment percentage
                    message: `(${
                      index + 1
                    }/${totalFiles}) Parsing: ${relativePath}`,
                  });

                  // Log detailed progress to the output channel
                  outputChannel.appendLine(
                    `[${progressPercentage.toFixed(
                      0
                    )}%] Parsing: ${relativePath}`
                  );

                  const result = indexerService.parseFile(filePath);
                  if (result) {
                    filesParsed++;
                    componentsFound += result.components.length;
                    hooksFound += result.hooks.length;
                    // TODO: Store the result (e.g., in a map)
                  }
                }

                const duration = (Date.now() - startTime) / 1000;
                const summary = `Indexing complete in ${duration.toFixed(
                  2
                )}s. Parsed ${filesParsed} files. Found ${componentsFound} components, ${hooksFound} hooks.`;
                outputChannel.appendLine(summary);
                vscode.window.showInformationMessage(
                  `React Analysis: ${summary}`
                );
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
        } else {
          // This case should logically be impossible due to the outer check,
          // but we add it for completeness and to potentially silence TS errors.
          vscode.window.showErrorMessage(
            "React Analysis: Could not determine workspace folder unexpectedly."
          );
          outputChannel.appendLine(
            "Error: Unexpectedly failed to get first workspace folder."
          );
        }
        // --- End of code that assumes workspaceFolders is valid ---
      }
    }
  );

  // Command to show a summary of the indexed data
  const showSummaryCommand = vscode.commands.registerCommand(
    "reactAnalysis.showIndexedSummary",
    () => {
      const indexedData = indexerService.getIndexedData();
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

      // Log detailed information to the output channel
      outputChannel.appendLine("\n--- Indexed Data Details ---");
      for (const [filePath, fileNode] of indexedData.entries()) {
        const relativePath = vscode.workspace.asRelativePath(filePath, false); // Use VS Code API for relative path
        outputChannel.appendLine(`\nFile: ${relativePath}`);
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
      outputChannel.appendLine("\n----------------------------");

      const summary = `Indexed Data Summary: ${fileCount} files, ${componentCount} components, ${hookCount} hooks found. Details logged to Output channel.`;
      vscode.window.showInformationMessage(summary); // Keep the summary message concise

      // Ensure the output channel is visible
      outputChannel.show(true);

      // TODO: Enhance this command further (Quick Pick, Webview?)
    }
  );

  // Register other commands later (analyzeCurrentFile, showComponentGraph, etc.)
  // ... placeholder for M1 and beyond ...

  context.subscriptions.push(indexWorkspaceCommand);
  context.subscriptions.push(showSummaryCommand); // Add the new command
  context.subscriptions.push(outputChannel);

  // Optionally trigger initial index on startup if configured?
  // if (config.get('indexOnStartup')) {
  //     vscode.commands.executeCommand('reactAnalysis.indexWorkspace');
  // }
}

// This method is called when your extension is deactivated
export function deactivate() {
  if (outputChannel) {
    outputChannel.dispose();
  }
  outputChannel.appendLine("React TS Code Analysis extension deactivated.");
  // Perform cleanup if necessary (e.g., dispose watchers, clear caches)
}
