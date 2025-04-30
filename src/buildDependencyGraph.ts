import * as fs from "fs";
import * as path from "path";
import type { Node, Edge } from "reactflow";
import * as vscode from "vscode";
import { outputChannel } from "./initializeExtension";
import { IndexerService } from "./IndexerService";
import type { ComponentNode, FileNode } from "./types";

/**
 * Builds the dependency graph for a given file path.
 *
 * @param targetPath The starting file path for the analysis.
 * @param maxDepth The maximum depth to traverse the dependency tree.
 * @param indexerService The instance of the IndexerService containing the indexed data.
 * @returns An object containing the nodes and edges for React Flow.
 */
export function buildDependencyGraph(
  targetPath: string,
  maxDepth: number,
  indexerService: IndexerService
): { nodes: Node[]; edges: Edge[] } {
  outputChannel.appendLine(
    `[Graph] Building graph for: ${targetPath} (maxDepth: ${maxDepth})`
  ); // Added Log
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const nodePositions: { [id: string]: { x: number; y: number } } = {}; // Keep for layout

  // let currentY = 50; // Replaced with dynamic calculation per depth
  const xSpacing = 300; // Increased spacing
  const ySpacing = 100; // Decreased vertical spacing

  // --- State Tracking ---
  const addedNodeIds = new Set<string>(); // Tracks file::id and component::id added to nodes array
  const addedEdgeIds = new Set<string>(); // Tracks sourceId->targetId
  const exploredComponentIds = new Set<string>(); // Tracks component::id whose dependencies have been processed

  // --- Queue ---
  // Store component full ID and its originating file path for import resolution
  type QueueItem =
    | {
        type: "file";
        filePath: string;
        depth: number;
        sourceNodeId?: string; // ID of the node that led to this file (e.g., a component rendering something here)
      }
    | {
        type: "component";
        componentId: string; // e.g., "component::uuid..."
        componentName: string; // For logging/debugging
        filePath: string; // File where this component is defined
        depth: number;
        sourceNodeId: string; // ID of the node that led to this component (file or another component)
      };
  const queue: QueueItem[] = [{ type: "file", filePath: targetPath, depth: 0 }];

  // Get the initial index - IMPORTANT: re-fetch inside loop if index changes due to parsing
  // const indexedData = indexerService.getIndexedData();
  // Helper function to get component data and its file path
  // This might be inefficient if called repeatedly; consider a cache or lookup map if needed.
  const findComponentDetails = (
    compId: string
  ): { component: ComponentNode; file: FileNode } | undefined => {
    // Make sure to use the LATEST index data
    for (const fileNode of indexerService.getIndexedData().values()) {
      const component = fileNode.components.find(
        (c) => `component::${c.id}` === compId
      );
      if (component) {
        return { component, file: fileNode };
      }
    }
    outputChannel.appendLine(
      `[Graph Helper] findComponentDetails failed for ID: ${compId}`
    );
    return undefined;
  };

  // Helper to add a node if it doesn't exist and calculate position
  const addNode = (node: Node, depth: number) => {
    if (!addedNodeIds.has(node.id)) {
      // Simple stacking layout logic: position based on depth (x) and order added at that depth (y)
      // Re-calculate nodes at this depth each time to get current count for Y positioning
      const nodesAtThisDepth = nodes.filter(
        (n) =>
          nodePositions[n.id]?.x ===
          depth * xSpacing +
            (node.id.startsWith("component::") ? xSpacing / 2 : 0)
      );
      const position = {
        x:
          depth * xSpacing +
          (node.id.startsWith("component::") ? xSpacing / 2 : 0), // Offset components horizontally
        y: 50 + nodesAtThisDepth.length * ySpacing, // Stack vertically
      };

      node.position = position; // Assign calculated position
      nodePositions[node.id] = position; // Store position for layout reference
      nodes.push(node);
      addedNodeIds.add(node.id);

      outputChannel.appendLine(
        `[Graph] Adding Node: ${node.id} (${node.data.label}) at depth ${depth} Pos:(${position.x}, ${position.y})`
      );
    } else {
      // If node exists, potentially update position if a shorter path is found?
      // For now, keep original position.
      outputChannel.appendLine(`[Graph] Node already exists: ${node.id}`);
    }
  };

  // Helper to add an edge if it doesn't exist
  const addEdge = (edge: Edge) => {
    // Prevent self-loops just in case
    if (edge.source === edge.target) {
      outputChannel.appendLine(`[Graph] Skipping self-loop edge: ${edge.id}`);
      return;
    }
    if (!addedEdgeIds.has(edge.id)) {
      edges.push(edge);
      addedEdgeIds.add(edge.id);
      outputChannel.appendLine(`[Graph] Adding Edge: ${edge.id}`);
    } else {
      outputChannel.appendLine(`[Graph] Edge already exists: ${edge.id}`);
    }
  };

  while (queue.length > 0) {
    const currentItem = queue.shift();
    if (!currentItem) break; // Should not happen

    outputChannel.appendLine(
      `[Graph] Processing Queue Item: ${JSON.stringify(currentItem)}`
    );

    // Use item's depth for checks and positioning
    const currentDepth = currentItem.depth;

    if (currentDepth > maxDepth) {
      outputChannel.appendLine(
        `[Graph] Skipping item due to depth limit (${currentDepth} > ${maxDepth}): ${
          currentItem.type
        } ${
          currentItem.type === "file"
            ? currentItem.filePath
            : currentItem.componentId
        }`
      );
      continue;
    }

    // --- Process File Item ---
    if (currentItem.type === "file") {
      const { filePath, sourceNodeId } = currentItem;
      let fileNode = indexerService.getIndexedData().get(filePath); // Use latest index

      if (!fileNode) {
        outputChannel.appendLine(
          `[Graph] File not indexed, parsing on demand: ${filePath}`
        );
        try {
          const parseResult = indexerService.parseFile(filePath); // This should update the index map in the service
          if (!parseResult) {
            outputChannel.appendLine(
              `[Graph] On-demand parsing returned no result for: ${filePath}`
            );
            continue;
          }
          fileNode = indexerService.getIndexedData().get(filePath); // Try getting again
          if (!fileNode) {
            outputChannel.appendLine(
              `[Graph] On-demand parsing failed to produce node for: ${filePath}`
            );
            continue; // Skip if still not found
          }
          outputChannel.appendLine(
            `[Graph] On-demand parsing successful for: ${filePath}`
          );
        } catch (error: any) {
          outputChannel.appendLine(
            `[Graph] Error during on-demand parsing for ${filePath}: ${error.message}`
          );
          continue; // Skip on error
        }
      }
      // File node exists (either initially or after parsing)
      processFileNode(fileNode, currentDepth, sourceNodeId);
    }

    // --- Process Component Item ---
    else if (currentItem.type === "component") {
      const { componentId, componentName, filePath, sourceNodeId } =
        currentItem;

      // Add the component node itself (position calculated based on currentDepth)
      addNode(
        {
          id: componentId,
          position: { x: 0, y: 0 }, // Placeholder, addNode calculates
          data: { label: componentName }, // Use name from queue item
          style: { backgroundColor: "#004d40", color: "white" },
        },
        currentDepth
      ); // Pass depth for positioning

      // Add edge from source (file or component) to this component
      const edgeToComponent: Edge = {
        id: `${sourceNodeId}->${componentId}`,
        source: sourceNodeId,
        target: componentId,
        animated: sourceNodeId.startsWith("component::"), // Animate component->component edges
      };
      addEdge(edgeToComponent);

      // Check if we've already explored *from* this component
      if (exploredComponentIds.has(componentId)) {
        outputChannel.appendLine(
          `[Graph] Component dependencies already explored: ${componentId} (${componentName})`
        );
        continue; // Don't re-explore dependencies
      }

      // Explore dependencies only if maxDepth not reached *at the next level*
      if (currentDepth >= maxDepth) {
        outputChannel.appendLine(
          `[Graph] Max depth reached at component ${componentId}, not exploring its dependencies.`
        );
        continue;
      }

      // Mark as explored *before* processing dependencies to handle cycles
      exploredComponentIds.add(componentId);
      outputChannel.appendLine(
        `[Graph] Exploring dependencies of component: ${componentId} (${componentName})`
      );

      const details = findComponentDetails(componentId);
      if (!details) {
        outputChannel.appendLine(
          `[Graph] ERROR: Could not find component details for ID: ${componentId}. Cannot explore dependencies.`
        );
        continue;
      }
      const { component: componentNode, file: parentFileNode } = details;

      // --- Explore Rendered Components (Dependencies) ---
      if (
        componentNode.renderedComponents &&
        componentNode.renderedComponents.length > 0
      ) {
        outputChannel.appendLine(
          `[Graph] Found ${componentNode.renderedComponents.length} rendered components for ${componentNode.name}`
        );
        for (const rendered of componentNode.renderedComponents) {
          outputChannel.appendLine(
            `[Graph] Processing rendered dependency: ${rendered.name}`
          );
          resolveAndQueueRenderedComponent(
            rendered,
            componentNode, // The component doing the rendering
            componentId, // ID of the component doing the rendering
            parentFileNode, // File where the rendering component lives
            currentDepth // Pass current depth (next level will be depth + 1)
          );
        }
      } else {
        outputChannel.appendLine(
          `[Graph] No rendered components found for ${componentNode.name}`
        );
      }
    }
  } // End while loop

  // --- Helper function to process a FileNode ---
  function processFileNode(
    fileNode: FileNode,
    depth: number,
    sourceNodeId?: string
  ) {
    const fileNodeId = `file::${fileNode.id}`;
    outputChannel.appendLine(
      `[Graph] Processing FileNode: ${fileNodeId} (${fileNode.name}) at depth ${depth}`
    );

    // Add the file node (position calculated based on depth)
    addNode(
      {
        id: fileNodeId,
        position: { x: 0, y: 0 }, // Placeholder, addNode calculates
        data: { label: fileNode.name },
        type: "input", // Keep styling for files consistent
        style: { backgroundColor: "#1a3d5c", color: "white" },
      },
      depth
    ); // Pass depth for positioning

    // Add edge from source node (if any) to this file node
    if (sourceNodeId) {
      const edgeToFile: Edge = {
        id: `${sourceNodeId}->${fileNodeId}`,
        source: sourceNodeId,
        target: fileNodeId,
        animated: false, // Don't animate edges leading to files? Optional.
      };
      addEdge(edgeToFile);
    }

    // Queue components within this file for exploration
    outputChannel.appendLine(
      `[Graph] Queuing ${fileNode.components.length} components from file ${fileNode.name}`
    );
    for (const component of fileNode.components) {
      const componentId = `component::${component.id}`;
      // Queue the component to be processed.
      // Source is the file node. Depth is the *next* level for the component node.
      queue.push({
        type: "component",
        componentId: componentId,
        componentName: component.name,
        filePath: fileNode.filePath, // File where component is defined
        depth: depth + 1, // Components are conceptually deeper than the file containing them
        sourceNodeId: fileNodeId,
      });
      outputChannel.appendLine(
        `[Graph] Queued component ${
          component.name
        } (ID: ${componentId}) from file ${fileNode.name} at depth ${depth + 1}`
      );
    }
  }

  // --- Helper function to resolve and queue a rendered component ---
  function resolveAndQueueRenderedComponent(
    rendered: { name: string; location: any }, // Location might be useful for diagnostics
    renderingComponent: ComponentNode,
    renderingComponentId: string, // ID ("component::uuid") of the component doing the rendering
    parentFileNode: FileNode, // File where the rendering component lives
    currentDepth: number // Depth of the *rendering* component
  ) {
    outputChannel.appendLine(
      `[Graph] Resolving rendered '${rendered.name}' by '${renderingComponent.name}' (ID: ${renderingComponentId})`
    );

    // 1. Find Import Declaration (Improved Check)
    if (!parentFileNode.imports || !Array.isArray(parentFileNode.imports)) {
      outputChannel.appendLine(
        `[Graph] ERROR: Parent file node ${parentFileNode.name} is missing 'imports' array or it's not an array. Skipping dependency '${rendered.name}'.`
      );
      return;
    }
    const importInfo = findImportInfo(rendered.name, parentFileNode.imports);

    if (!importInfo) {
      outputChannel.appendLine(
        `[Graph] No import declaration found or resolvable for '${rendered.name}' in ${parentFileNode.name}. Skipping.`
      );
      return;
    }
    outputChannel.appendLine(
      `[Graph] Found import for '${rendered.name}' (as '${importInfo.importedName}') from '${importInfo.moduleSpecifier}'`
    );

    // 2. Resolve Path
    let resolvedDepPath: string | undefined = resolveImportPath(
      importInfo.moduleSpecifier,
      parentFileNode.filePath
    );

    if (!resolvedDepPath) {
      outputChannel.appendLine(
        `[Graph] Path resolution failed for module '${importInfo.moduleSpecifier}'. Skipping dependency '${rendered.name}'.`
      );
      return; // Skip if path resolution failed
    }
    outputChannel.appendLine(
      `[Graph] Resolved import '${importInfo.moduleSpecifier}' to absolute path: ${resolvedDepPath}`
    );

    // 3. Ensure dependency file is indexed
    let renderedFileNode = indexerService.getIndexedData().get(resolvedDepPath);
    if (!renderedFileNode) {
      outputChannel.appendLine(
        `[Graph] Dependency file not indexed, parsing on demand: ${resolvedDepPath}`
      );
      try {
        const parseResult = indexerService.parseFile(resolvedDepPath);
        if (!parseResult) {
          outputChannel.appendLine(
            `[Graph] On-demand parsing returned no result for: ${resolvedDepPath}`
          );
          return; // Skip if parsing failed for the resolved path
        }
        renderedFileNode = indexerService.getIndexedData().get(resolvedDepPath); // Get again
        if (!renderedFileNode) {
          outputChannel.appendLine(
            `[Graph] On-demand parsing failed to produce node for: ${resolvedDepPath}`
          );
          return;
        }
        outputChannel.appendLine(
          `[Graph] On-demand parsing successful for: ${resolvedDepPath}`
        );
      } catch (error: any) {
        outputChannel.appendLine(
          `[Graph] Error during on-demand parsing for ${resolvedDepPath}: ${error.message}`
        );
        return; // Skip if parsing errors
      }
    }

    // 4. Find the specific rendered ComponentNode in the target file
    // Use the name *as it was imported* (or potentially default import)
    const targetComponentName = importInfo.importedName; // The name expected in the *target* file
    const renderedComponentNode = renderedFileNode.components.find(
      (c) => c.name === targetComponentName && c.exported
    ); // Match name and ensure it's exported

    if (!renderedComponentNode) {
      outputChannel.appendLine(
        `[Graph] Could not find exported component '${targetComponentName}' (imported as '${rendered.name}') in file: ${resolvedDepPath}.`
      );
      // TODO: Check for default exports if importInfo indicated a default import.
      return;
    }

    // 5. Add Nodes/Edges and Queue Dependency Component
    const renderedCompId = `component::${renderedComponentNode.id}`;
    outputChannel.appendLine(
      `[Graph] Linking dependency: ${renderingComponent.name} -> ${renderedComponentNode.name} (File: ${renderedFileNode.name}, Target Comp ID: ${renderedCompId})`
    );

    // Ensure target component node exists (position based on next depth)
    addNode(
      {
        id: renderedCompId,
        position: { x: 0, y: 0 }, // Placeholder, addNode calculates
        data: { label: renderedComponentNode.name }, // Use the actual name from the component node
        style: { backgroundColor: "#004d40", color: "white" }, // Standard component style
      },
      currentDepth + 1
    ); // Position at the next depth level

    // Add edge from rendering component to rendered component
    const compToCompEdge: Edge = {
      id: `${renderingComponentId}->${renderedCompId}`,
      source: renderingComponentId,
      target: renderedCompId,
      animated: true,
    };
    addEdge(compToCompEdge);

    // Queue the *rendered component* for further exploration if depth allows and not already explored
    const nextDepth = currentDepth + 1;
    if (nextDepth <= maxDepth) {
      // Check if already explored before queueing
      if (!exploredComponentIds.has(renderedCompId)) {
        outputChannel.appendLine(
          `[Graph] Queueing rendered component for exploration: ${renderedComponentNode.name} (ID: ${renderedCompId}) at depth ${nextDepth}`
        );
        queue.push({
          type: "component",
          componentId: renderedCompId,
          componentName: renderedComponentNode.name,
          filePath: renderedFileNode.filePath, // File where the *rendered* component lives
          depth: nextDepth, // Depth for the next level of exploration
          sourceNodeId: renderingComponentId, // The source is the component that rendered this one
        });
      } else {
        outputChannel.appendLine(
          `[Graph] Not queueing rendered component ${renderedComponentNode.name} (ID: ${renderedCompId}) because its dependencies have already been explored.`
        );
      }
    } else {
      outputChannel.appendLine(
        `[Graph] Max depth reached, not queueing rendered component ${renderedComponentNode.name} (ID: ${renderedCompId})`
      );
    }
  } // End resolveAndQueueRenderedComponent

  // --- Helper function to find how a name was imported ---
  // Assuming the type for individual import objects is ImportInfo based on FileNode structure
  // Replace the problematic ReturnType with the actual expected type
  // We need to know the exact type name from 'types.ts' - let's assume 'ImportInfo' for now.
  // If 'ImportInfo' is not correct, this needs adjustment based on the actual type definition.
  // Using any[] for now to resolve linter error.
  function findImportInfo(
    localName: string,
    imports: any[]
  ):
    | { moduleSpecifier: string; importedName: string; isDefault: boolean }
    | undefined {
    outputChannel.appendLine(
      `[Graph Import] Searching for '${localName}' in ${
        imports?.length ?? 0
      } imports.`
    ); // Add log
    for (const [index, imp] of imports.entries()) {
      // Add detailed log for each import statement being checked
      outputChannel.appendLine(
        `[Graph Import] Checking import #${index}: ${JSON.stringify(imp)}`
      );
      if (!imp?.moduleSpecifier) {
        outputChannel.appendLine(
          `[Graph Import] Skipping import #${index} due to missing moduleSpecifier.`
        );
        continue;
      }

      let foundMatch = false;

      // Priority 1: Check namedImports (handles aliases)
      if (imp.namedImports && Array.isArray(imp.namedImports)) {
        outputChannel.appendLine(
          `[Graph Import] Checking ${imp.namedImports.length} named imports in '${imp.moduleSpecifier}'...`
        );
        for (const [namedIndex, named] of imp.namedImports.entries()) {
          outputChannel.appendLine(
            `[Graph Import]   Named import (structured) #${namedIndex}: ${JSON.stringify(
              named
            )}`
          ); // Log each named import detail
          if (named?.alias === localName) {
            outputChannel.appendLine(
              `[Graph Import]   Found match via alias: alias '${named.alias}' === localName '${localName}'. Original name: '${named.name}'.`
            );
            foundMatch = true;
            return {
              moduleSpecifier: imp.moduleSpecifier,
              importedName: named.name,
              isDefault: false,
            };
          }
          if (!named?.alias && named?.name === localName) {
            outputChannel.appendLine(
              `[Graph Import]   Found match via name: name '${named.name}' === localName '${localName}'.`
            );
            foundMatch = true;
            return {
              moduleSpecifier: imp.moduleSpecifier,
              importedName: named.name,
              isDefault: false,
            };
          }
        }
        outputChannel.appendLine(
          `[Graph Import] No match found in structured 'namedImports' for '${localName}'.`
        );
      } else {
        outputChannel.appendLine(
          `[Graph Import] No valid structured 'namedImports' array found for '${imp.moduleSpecifier}'.`
        );
      }

      // Priority 2: Check namedBindings (simple array of strings)
      if (
        !foundMatch &&
        imp.namedBindings &&
        Array.isArray(imp.namedBindings)
      ) {
        outputChannel.appendLine(
          `[Graph Import] Checking ${imp.namedBindings.length} named bindings (string array) in '${imp.moduleSpecifier}'...`
        );
        for (const [bindingIndex, bindingName] of imp.namedBindings.entries()) {
          outputChannel.appendLine(
            `[Graph Import]   Named binding (string) #${bindingIndex}: "${bindingName}"`
          );
          if (typeof bindingName === "string" && bindingName === localName) {
            outputChannel.appendLine(
              `[Graph Import]   Found match via binding name: binding '${bindingName}' === localName '${localName}'.`
            );
            // For simple bindings, importedName is the same as localName
            foundMatch = true;
            return {
              moduleSpecifier: imp.moduleSpecifier,
              importedName: bindingName,
              isDefault: false,
            };
          }
        }
        outputChannel.appendLine(
          `[Graph Import] No match found in 'namedBindings' array for '${localName}'.`
        );
      } else if (!foundMatch) {
        outputChannel.appendLine(
          `[Graph Import] No valid 'namedBindings' array found or already matched via namedImports for '${imp.moduleSpecifier}'.`
        );
      }

      // TODO: Check default import: import localName from ...
    }
    return undefined;
  }

  // --- Helper function for robust path resolution ---
  function resolveImportPath(
    moduleSpecifier: string,
    currentFilePath: string
  ): string | undefined {
    const currentDirPath = path.dirname(currentFilePath);
    outputChannel.appendLine(
      `[Graph Path] Attempting to resolve '${moduleSpecifier}' from '${currentDirPath}'`
    );

    // 1. Try require.resolve (handles node_modules and core modules)
    try {
      const resolved = require.resolve(moduleSpecifier, {
        paths: [currentDirPath],
      });
      outputChannel.appendLine(
        `[Graph Path] Resolved '${moduleSpecifier}' via require.resolve to: ${resolved}`
      );
      // Check if it resolved to a directory (likely pointing to package.json main/module)
      // require.resolve usually gives a file, but be cautious.
      if (fs.existsSync(resolved) && fs.lstatSync(resolved).isFile()) {
        return resolved;
      }
      // If it's a directory, maybe we need index file? This part is tricky with require.resolve.
      outputChannel.appendLine(
        `[Graph Path] require.resolve result is not a file: ${resolved}`
      );
      // Fall through to manual resolution if needed, though unusual for require.resolve
    } catch (e) {
      outputChannel.appendLine(
        `[Graph Path] require.resolve failed for '${moduleSpecifier}': ${e}`
      );
      // Proceed to manual resolution for relative paths or aliases
    }

    // 2. Handle potential aliases (basic example: '~/' mapping to workspace root)
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    let effectivePath = moduleSpecifier;
    let isAliasResolved = false;
    if (moduleSpecifier.startsWith("~/") && workspaceRoot) {
      // Prioritize resolving ~/ relative to <workspaceRoot>/src
      const srcPath = path.join(
        workspaceRoot,
        "src",
        moduleSpecifier.substring(2)
      );
      // Check if the base path (without extension) might exist within src
      // This is a heuristic; a full tsconfig paths lookup would be more robust
      const potentialDirOrFile = path.dirname(srcPath); // Check if the directory structure leading to it exists
      if (fs.existsSync(potentialDirOrFile)) {
        effectivePath = srcPath;
        outputChannel.appendLine(
          `[Graph Path] Resolved alias '~/' relative to src/: ${effectivePath}`
        );
        isAliasResolved = true;
      } else {
        // Fallback: Resolve relative to plain workspace root if src/ path doesn't seem valid
        effectivePath = path.join(workspaceRoot, moduleSpecifier.substring(2));
        outputChannel.appendLine(
          `[Graph Path] Resolved alias '~/' relative to workspace root (fallback): ${effectivePath}`
        );
        isAliasResolved = true;
        // Consider adding a warning here? Might indicate misconfiguration or unexpected structure.
      }
    } else if (moduleSpecifier.startsWith("@/") && workspaceRoot) {
      // Add basic handling for @/ alias, often also maps to src/
      const srcPath = path.join(
        workspaceRoot,
        "src",
        moduleSpecifier.substring(2)
      );
      const potentialDirOrFile = path.dirname(srcPath);
      if (fs.existsSync(potentialDirOrFile)) {
        effectivePath = srcPath;
        outputChannel.appendLine(
          `[Graph Path] Resolved alias '@/' relative to src/: ${effectivePath}`
        );
        isAliasResolved = true;
      } else {
        effectivePath = path.join(workspaceRoot, moduleSpecifier.substring(2));
        outputChannel.appendLine(
          `[Graph Path] Resolved alias '@/' relative to workspace root (fallback): ${effectivePath}`
        );
        isAliasResolved = true;
      }
      // Add more alias handling here if needed based on tsconfig.json paths
    }

    // 3. Manual Resolution (relative paths, extensions, index files) - more robust
    // If not starting with '.' or '/', assume it might be resolvable relative to current dir OR node_modules (handled by require.resolve)
    // Focus on relative paths here.
    let basePath: string;
    if (isAliasResolved) {
      basePath = effectivePath; // Use the path resolved from the alias
    } else if (path.isAbsolute(effectivePath)) {
      basePath = effectivePath;
    } else if (effectivePath.startsWith(".")) {
      basePath = path.resolve(currentDirPath, effectivePath);
    } else {
      // It's a bare specifier not resolved by require.resolve - likely an error or unhandled alias/case
      outputChannel.appendLine(
        `[Graph Path] Cannot resolve bare specifier '${moduleSpecifier}' manually.`
      );
      return undefined;
    }
    outputChannel.appendLine(
      `[Graph Path] Manual resolution base path: ${basePath}`
    );

    const possibleExtensions = ["", ".tsx", ".ts", ".jsx", ".js", ".json"]; // Added "" for exact match / directories

    for (const ext of possibleExtensions) {
      const pathWithExt = basePath + ext;
      outputChannel.appendLine(`[Graph Path] Trying path: ${pathWithExt}`);

      if (fs.existsSync(pathWithExt)) {
        const stats = fs.lstatSync(pathWithExt);
        if (stats.isFile()) {
          outputChannel.appendLine(`[Graph Path] Found file: ${pathWithExt}`);
          return pathWithExt; // Found a file directly
        }
        if (stats.isDirectory()) {
          outputChannel.appendLine(
            `[Graph Path] Found directory: ${pathWithExt}. Checking index files...`
          );
          // Check for index file within the directory
          for (const indexExt of possibleExtensions.slice(1)) {
            // Skip "" extension here
            const indexPath = path.join(pathWithExt, `index${indexExt}`);
            outputChannel.appendLine(
              `[Graph Path] Trying index path: ${indexPath}`
            );
            if (fs.existsSync(indexPath) && fs.lstatSync(indexPath).isFile()) {
              outputChannel.appendLine(
                `[Graph Path] Found index file: ${indexPath}`
              );
              return indexPath; // Found index file
            }
          }
        }
      }
    }

    outputChannel.appendLine(
      `[Graph Path] Manual resolution failed for base path: ${basePath}`
    );
    return undefined; // Failed to resolve
  }

  outputChannel.appendLine(
    `[Graph] Build complete for ${targetPath}: ${nodes.length} nodes, ${edges.length} edges`
  ); // Added Log

  // console.log(
  //   `Graph built for ${targetPath}: ${nodes.length} nodes, ${edges.length} edges`
  // );
  return { nodes, edges };
}
