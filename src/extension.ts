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
          const includePatterns: string[] = config.get("entryPoints") || [];
          // const excludePatterns: string[] = config.get('excludePatterns') || []; // Add exclude if needed

          if (includePatterns.length === 0) {
            vscode.window.showErrorMessage(
              "React Analysis: No entry points configured in settings (reactAnalysis.entryPoints)."
            );
            outputChannel.appendLine(
              "Error: reactAnalysis.entryPoints is not configured."
            );
            return; // Return inside the inner if
          }

          outputChannel.appendLine(
            `Include patterns: ${includePatterns.join(", ")}`
          );
          // Log exclude patterns if used
          // outputChannel.appendLine(`Exclude patterns: ${excludePatterns.join(', ')}`);

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
                // Use glob to find files based on patterns relative to the workspace root
                const filePaths = await glob(includePatterns, {
                  cwd: workspaceRoot,
                  nodir: true, // Match files only, not directories
                  absolute: true, // Get absolute paths
                  ignore: ["**/node_modules/**"], // Basic ignore
                  // TODO: Add more robust ignore pattern handling from config/gitignore?
                });

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

      for (const fileNode of indexedData.values()) {
        componentCount += fileNode.components.length;
        hookCount += fileNode.hooks.length;
      }

      const summary = `Indexed Data Summary: ${fileCount} files, ${componentCount} components, ${hookCount} hooks found.`;

      outputChannel.appendLine(summary);
      vscode.window.showInformationMessage(summary);

      // TODO: Enhance this command to show more details (e.g., list files/components)
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
