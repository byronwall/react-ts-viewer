import * as vscode from "vscode";
import { IndexerService } from "./IndexerService";
import { glob } from "glob"; // Use glob for finding files matching patterns
import * as path from "path";
import { SidebarProvider } from "./SidebarProvider"; // Added
import * as fs from "fs";
import type { Node, Edge } from "reactflow"; // Import React Flow types
import type { ComponentNode, FileNode, HookNode } from "./types"; // Import indexer types

let indexerService: IndexerService;
let outputChannel: vscode.OutputChannel;
let sidebarProvider: SidebarProvider; // Added
let webviewPanel: vscode.WebviewPanel | undefined;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "react-ts-code-analysis" is now active!'
  );
  outputChannel = vscode.window.createOutputChannel(
    "React Analysis | Dependency View"
  );
  outputChannel.appendLine(
    "React TS Code Analysis extension activated. " + Math.random()
  );

  indexerService = new IndexerService();

  // --- Tree View Setup ---
  sidebarProvider = new SidebarProvider(indexerService);
  const treeView = vscode.window.createTreeView("reactAnalysisSidebar", {
    treeDataProvider: sidebarProvider,
  });
  context.subscriptions.push(treeView);

  // Refresh tree when index updates
  const indexUpdateDisposable = indexerService.onIndexUpdate(() => {
    sidebarProvider.refresh();
  });
  context.subscriptions.push(indexUpdateDisposable);
  // Also refresh tree after full index completes (might catch edge cases)
  // (Consider if this is redundant with per-file updates)

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
            // Added: Show rendered components
            if (comp.renderedComponents && comp.renderedComponents.length > 0) {
              outputChannel.appendLine(`      Rendered:`);
              comp.renderedComponents.forEach((rendered) => {
                // Display location info (optional, could be verbose)
                // const loc = rendered.location.range.start;
                // outputChannel.appendLine(`        - ${rendered.name} (at line ${loc.line + 1})`);
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

  let analyzeFileCommand = vscode.commands.registerCommand(
    "reactAnalysis.analyzeCurrentFile",
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage(
          "Open a file first to analyze dependencies."
        );
        return;
      }

      const filePath = editor.document.uri.fsPath;
      const column = vscode.ViewColumn.Beside;

      if (webviewPanel) {
        // If we already have a panel, reveal it
        webviewPanel.reveal(column);
        outputChannel.appendLine(
          `[Extension] Updating existing panel with file: ${filePath}`
        );
        // Send the new file path to the existing webview
        webviewPanel.webview.postMessage({
          command: "setFile",
          filePath: filePath,
        });
        outputChannel.appendLine(
          `[Extension] Sent setFile message to existing panel for: ${filePath}`
        );
      } else {
        // Otherwise, create a new panel
        webviewPanel = vscode.window.createWebviewPanel(
          "dependencyAnalyzer",
          "Dependency Analyzer",
          column,
          {
            enableScripts: true,
            localResourceRoots: [
              vscode.Uri.joinPath(context.extensionUri, "out", "webview"),
            ],
          }
        );

        webviewPanel.webview.html = getWebviewContent(
          context,
          webviewPanel.webview,
          filePath
        );

        // Handle messages from the webview
        webviewPanel.webview.onDidReceiveMessage(
          (message) => {
            switch (message.command) {
              case "runAnalysis":
                const targetPath = message.filePath;
                if (!targetPath) {
                  vscode.window.showErrorMessage(
                    "No file path provided for analysis."
                  );
                  return;
                }
                vscode.window.withProgress(
                  {
                    location: vscode.ProgressLocation.Notification,
                    title: `Analyzing ${path.basename(targetPath)}...`,
                    cancellable: false,
                  },
                  async (progress) => {
                    progress.report({
                      increment: 0,
                      message: "Checking index...",
                    }); // Updated progress

                    // --- Check if file is indexed, parse if necessary ---
                    const isIndexed = indexerService
                      .getIndexedData()
                      .has(targetPath);
                    if (!isIndexed) {
                      outputChannel.appendLine(
                        `[Extension] File not indexed, parsing on demand: ${targetPath}`
                      );
                      progress.report({
                        increment: 10,
                        message: "Parsing file...",
                      }); // Update progress
                      try {
                        const parseResult =
                          indexerService.parseFile(targetPath);
                        if (!parseResult) {
                          outputChannel.appendLine(
                            `[Extension] On-demand parsing failed for: ${targetPath}`
                          );
                          vscode.window.showErrorMessage(
                            `React Analysis: Failed to parse ${path.basename(
                              targetPath
                            )}.`
                          );
                          return; // Stop if parsing fails
                        }
                        outputChannel.appendLine(
                          `[Extension] On-demand parsing successful for: ${targetPath}`
                        );
                      } catch (error: any) {
                        outputChannel.appendLine(
                          `[Extension] Error during on-demand parsing for ${targetPath}: ${error.message}`
                        );
                        vscode.window.showErrorMessage(
                          `React Analysis: Error parsing ${path.basename(
                            targetPath
                          )}. See Output.`
                        );
                        return; // Stop if parsing errors
                      }
                    } else {
                      outputChannel.appendLine(
                        `[Extension] File already indexed: ${targetPath}`
                      );
                    }
                    // --- End check ---

                    progress.report({
                      increment: 30,
                      message: "Building graph...",
                    }); // Update progress
                    const maxDepth = message.settings?.maxDepth ?? 5; // Use default if not provided

                    // --- Build the actual dependency graph ----
                    // Pass the potentially updated indexerService
                    const results = buildDependencyGraph(
                      targetPath,
                      maxDepth,
                      indexerService // Pass the service instance
                    );
                    // --- End analysis logic ---

                    progress.report({ increment: 100, message: "Done!" }); // Final progress update
                    webviewPanel?.webview.postMessage({
                      command: "showResults",
                      data: results,
                    });
                  }
                );
                return;
            }
          },
          undefined,
          context.subscriptions
        );

        // Reset panel when closed
        webviewPanel.onDidDispose(
          () => {
            webviewPanel = undefined;
          },
          null,
          context.subscriptions
        );
      }
    }
  );

  context.subscriptions.push(analyzeFileCommand);
}

/**
 * Builds the dependency graph for a given file path.
 *
 * @param targetPath The starting file path for the analysis.
 * @param maxDepth The maximum depth to traverse the dependency tree.
 * @param indexerService The instance of the IndexerService containing the indexed data.
 * @returns An object containing the nodes and edges for React Flow.
 */
function buildDependencyGraph(
  targetPath: string,
  maxDepth: number,
  indexerService: IndexerService
): { nodes: Node[]; edges: Edge[] } {
  outputChannel.appendLine(
    `[Graph] Building graph for: ${targetPath} (maxDepth: ${maxDepth})`
  ); // Added Log
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const visited = new Set<string>(); // Keep track of visited component/file/edge IDs
  const queue: { filePath: string; depth: number; parentNodeId?: string }[] = [
    { filePath: targetPath, depth: 0 },
  ];
  const nodePositions: { [id: string]: { x: number; y: number } } = {}; // Store positions to avoid overlaps
  let currentY = 50;
  const xSpacing = 250;
  const ySpacing = 150;

  const indexedData = indexerService.getIndexedData();
  outputChannel.appendLine(`[Graph] Index size: ${indexedData.size}`); // Added Log

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      outputChannel.appendLine(
        "[Graph] Queue shifted undefined, breaking loop."
      ); // Added Log
      break; // Should not happen with length check, but safe guard
    }
    if (current.depth > maxDepth) {
      outputChannel.appendLine(
        `[Graph] Skipping queue item due to depth: ${current.filePath} (depth ${current.depth} > ${maxDepth})`
      ); // Added Log
      continue;
    }

    outputChannel.appendLine(
      `[Graph] Processing queue item: ${current.filePath} (depth ${
        current.depth
      }, parent: ${current.parentNodeId || "none"})`
    ); // Added Log
    const { filePath, depth, parentNodeId } = current;
    const fileNode = indexedData.get(filePath);

    if (!fileNode) {
      outputChannel.appendLine(`[Graph] File not found in index: ${filePath}`); // Added Log
      continue;
    }

    const fileNodeId = `file::${fileNode.id}`;
    if (visited.has(fileNodeId)) {
      outputChannel.appendLine(
        `[Graph] File node already visited: ${fileNodeId} (${fileNode.name})`
      ); // Added Log
      // Continue processing components even if file node visited, but don't re-add file node/edge
    } else {
      outputChannel.appendLine(
        `[Graph] Adding File node: ${fileNodeId} (${fileNode.name}) at depth ${depth}`
      ); // Added Log
      visited.add(fileNodeId);
      // Simple positioning logic (improve later if needed)
      const position = { x: depth * xSpacing, y: currentY };
      nodePositions[fileNodeId] = position;
      nodes.push({
        id: fileNodeId,
        position: position,
        data: { label: `${fileNode.name}` },
        type: "input", // Mark entry files
        style: { backgroundColor: "#1a3d5c", color: "white" },
      });
      currentY += ySpacing;

      // Add edge from parent file/component if applicable
      if (parentNodeId) {
        const edgeId = `${parentNodeId}->${fileNodeId}`;
        if (!visited.has(edgeId)) {
          outputChannel.appendLine(`[Graph] Adding Edge: ${edgeId}`); // Added Log
          edges.push({
            id: edgeId,
            source: parentNodeId,
            target: fileNodeId,
            animated: true,
          });
          visited.add(edgeId);
        } else {
          outputChannel.appendLine(`[Graph] Edge already visited: ${edgeId}`); // Added Log
        }
      }
    }

    // --- Add Nodes for Components in the File ---
    outputChannel.appendLine(
      `[Graph] Processing ${fileNode.components.length} components in ${fileNode.name}`
    ); // Added Log
    const fileNodePosition = nodePositions[fileNodeId];
    let componentYOffset = fileNodePosition
      ? fileNodePosition.y + ySpacing / 2
      : currentY; // Use file Y or currentY as fallback
    for (const component of fileNode.components) {
      const componentNodeId = `component::${component.id}`;
      outputChannel.appendLine(
        `[Graph] Checking component: ${component.name} (ID: ${componentNodeId})`
      ); // Added Log
      if (!visited.has(componentNodeId)) {
        outputChannel.appendLine(
          `[Graph] Adding Component node: ${componentNodeId} (${component.name})`
        ); // Added Log
        visited.add(componentNodeId);
        const position = {
          x: depth * xSpacing + xSpacing / 2,
          y: componentYOffset,
        }; // Indent slightly
        nodePositions[componentNodeId] = position;
        nodes.push({
          id: componentNodeId,
          position: position,
          data: { label: component.name },
          // parentNode: fileNodeId, // For potential hierarchy later
          // extent: "parent",
          style: { backgroundColor: "#004d40", color: "white" },
        });
        componentYOffset += ySpacing / 2;

        // Add edge from file to component
        const fileToCompEdgeId = `${fileNodeId}->${componentNodeId}`;
        if (!visited.has(fileToCompEdgeId)) {
          outputChannel.appendLine(
            `[Graph] Adding Edge (File->Comp): ${fileToCompEdgeId}`
          ); // Added Log
          edges.push({
            id: fileToCompEdgeId,
            source: fileNodeId,
            target: componentNodeId,
          });
          visited.add(fileToCompEdgeId);
        } else {
          outputChannel.appendLine(
            `[Graph] Edge (File->Comp) already visited: ${fileToCompEdgeId}`
          ); // Added Log
        }
      } else {
        outputChannel.appendLine(
          `[Graph] Component node already visited: ${componentNodeId} (${component.name})`
        ); // Added Log
      }

      // --- Process Rendered Components (Dependencies) ---
      if (component.renderedComponents && depth < maxDepth) {
        outputChannel.appendLine(
          `[Graph] Processing ${component.renderedComponents.length} rendered components for ${component.name}`
        ); // Added Log
        for (const rendered of component.renderedComponents) {
          outputChannel.appendLine(
            `[Graph] Checking rendered: ${rendered.name}`
          ); // Added Log

          let renderedFileNode: FileNode | undefined;
          let renderedComponentNode: ComponentNode | undefined;
          let resolvedDepPath: string | undefined; // Store the resolved path

          // 1. Find the import declaration for the rendered component in the current file
          const importDecl = fileNode.imports.find((imp) =>
            imp.moduleSpecifier?.includes(rendered.name)
          );

          if (!importDecl) {
            outputChannel.appendLine(
              `[Graph] No import declaration found for '${rendered.name}' in ${fileNode.name}. Skipping.`
            );
            continue; // Cannot resolve without import info
          }

          outputChannel.appendLine(
            `[Graph] Found import for '${rendered.name}' from '${importDecl.moduleSpecifier}'`
          );

          // 2. Resolve the import source to an absolute path
          // TODO: Add robust path resolution (aliases, node_modules, extensions)
          // Basic relative path resolution for now:
          try {
            resolvedDepPath = path.resolve(
              path.dirname(filePath), // Directory of the current file
              importDecl.moduleSpecifier
            );

            // Basic extension guessing (can be improved)
            const possibleExtensions = [".tsx", ".ts", ".jsx", ".js"];
            if (!fs.existsSync(resolvedDepPath)) {
              let found = false;
              for (const ext of possibleExtensions) {
                const pathWithExt = resolvedDepPath + ext;
                if (fs.existsSync(pathWithExt)) {
                  resolvedDepPath = pathWithExt;
                  found = true;
                  break;
                }
                const indexPath = path.join(resolvedDepPath, "index" + ext);
                if (fs.existsSync(indexPath)) {
                  resolvedDepPath = indexPath;
                  found = true;
                  break;
                }
              }
              if (!found) {
                // Check node_modules if not found locally (basic check)
                // This needs enhancement for proper Node resolution algorithm
                try {
                  resolvedDepPath = require.resolve(
                    importDecl.moduleSpecifier,
                    {
                      paths: [path.dirname(filePath)],
                    }
                  );
                  outputChannel.appendLine(
                    `[Graph] Resolved '${importDecl.moduleSpecifier}' to node_modules path: ${resolvedDepPath}`
                  );
                  found = true;
                } catch (resolveError) {
                  outputChannel.appendLine(
                    `[Graph] Could not resolve import source '${importDecl.moduleSpecifier}' to a file or node_module from ${filePath}. Error: ${resolveError}`
                  );
                  resolvedDepPath = undefined; // Ensure it's undefined
                }
              }
            }

            if (!resolvedDepPath) {
              continue; // Skip if path resolution failed
            }

            outputChannel.appendLine(
              `[Graph] Resolved import source '${importDecl.moduleSpecifier}' to absolute path: ${resolvedDepPath}`
            );
          } catch (error: any) {
            outputChannel.appendLine(
              `[Graph] Error resolving path for import '${importDecl.moduleSpecifier}' in ${fileNode.name}: ${error.message}`
            );
            continue; // Skip if resolution fails
          }

          // 3. Check if the resolved file is indexed, parse if necessary
          if (!indexedData.has(resolvedDepPath)) {
            outputChannel.appendLine(
              `[Graph] Dependency file not indexed, parsing on demand: ${resolvedDepPath}`
            );
            try {
              const parseResult = indexerService.parseFile(resolvedDepPath);
              if (parseResult) {
                outputChannel.appendLine(
                  `[Graph] On-demand parsing successful for: ${resolvedDepPath}`
                );
                // Refresh indexedData map reference after potential update
                // NOTE: getIndexedData() should return the updated map reference from the service
                // (Assuming IndexerService updates its internal map correctly)
                // No explicit refresh needed here if getIndexedData returns the live map.
                // indexedData = indexerService.getIndexedData(); // Uncomment if service returns copies
              } else {
                outputChannel.appendLine(
                  `[Graph] On-demand parsing failed or returned no data for: ${resolvedDepPath}`
                );
                // Optionally continue, maybe the component exists elsewhere?
                // For now, we'll assume parsing is required for this path.
                continue; // Skip if parsing failed for the resolved path
              }
            } catch (error: any) {
              outputChannel.appendLine(
                `[Graph] Error during on-demand parsing for ${resolvedDepPath}: ${error.message}`
              );
              continue; // Skip if parsing errors
            }
          }

          // 4. Get the FileNode and ComponentNode from the index (should exist now)
          renderedFileNode = indexerService
            .getIndexedData()
            .get(resolvedDepPath);
          if (renderedFileNode) {
            renderedComponentNode = renderedFileNode.components.find(
              (c) => c.name === rendered.name
            );
          }

          // 5. If found, add edge and queue dependency
          if (renderedFileNode && renderedComponentNode) {
            const renderedFileId = `file::${renderedFileNode.id}`;
            const renderedCompId = `component::${renderedComponentNode.id}`; // Target the component
            const edgeId = `${componentNodeId}->${renderedCompId}`;
            outputChannel.appendLine(
              `[Graph] Successfully resolved dependency: ${component.name} -> ${renderedComponentNode.name} (File: ${renderedFileNode.name}, Edge ID: ${edgeId})`
            ); // Updated Log

            if (!visited.has(edgeId)) {
              outputChannel.appendLine(
                `[Graph] Adding Edge (Comp->Comp): ${edgeId}`
              ); // Added Log
              edges.push({
                id: edgeId,
                source: componentNodeId,
                target: renderedCompId,
                animated: true,
              });
              visited.add(edgeId);
            } else {
              outputChannel.appendLine(
                `[Graph] Edge (Comp->Comp) already visited: ${edgeId}`
              ); // Added Log
            }

            // Add the dependency file to the queue if its *file node* hasn't been visited
            if (!visited.has(renderedFileId)) {
              outputChannel.appendLine(
                `[Graph] Queueing dependency file: ${
                  renderedFileNode.filePath
                } (Depth: ${depth + 1}, Parent: ${componentNodeId})`
              ); // Added Log
              queue.push({
                filePath: renderedFileNode.filePath,
                depth: depth + 1,
                parentNodeId: componentNodeId, // Link from the rendering component
              });
            } else {
              outputChannel.appendLine(
                `[Graph] Dependency file node already visited, not queueing: ${renderedFileId} (${renderedFileNode.name})`
              ); // Updated Log
            }
          } else {
            outputChannel.appendLine(
              `[Graph] Could not find component '${rendered.name}' in parsed file: ${resolvedDepPath}`
            ); // Updated Log
          }
        }
      } else if (depth >= maxDepth) {
        outputChannel.appendLine(
          `[Graph] Max depth reached (${depth}), not processing rendered components for ${component.name}`
        ); // Added Log
      }
    }
    // TODO: Consider adding Hooks as nodes?
  }

  outputChannel.appendLine(
    `[Graph] Build complete for ${targetPath}: ${nodes.length} nodes, ${edges.length} edges`
  ); // Added Log
  // console.log(
  //   `Graph built for ${targetPath}: ${nodes.length} nodes, ${edges.length} edges`
  // );
  return { nodes, edges };
}

function getWebviewContent(
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

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// This method is called when your extension is deactivated
export function deactivate() {
  if (outputChannel) {
    outputChannel.dispose();
  }
  // Dispose the indexer service emitter
  if (indexerService) {
    indexerService.dispose();
  }
  outputChannel.appendLine("React TS Code Analysis extension deactivated.");
  // Perform cleanup if necessary (e.g., dispose watchers, clear caches)

  if (webviewPanel) {
    webviewPanel.dispose();
  }
}
