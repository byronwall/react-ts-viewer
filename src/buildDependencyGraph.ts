import * as fs from "fs";
import * as path from "path";
import type { Node, Edge } from "reactflow";
import * as vscode from "vscode";
import { outputChannel } from "./initializeExtension";
import { IndexerService } from "./IndexerService";
import type {
  ComponentNode,
  FileNode,
  HookUsage,
  DependencyInfo,
  ImportData,
} from "./types";
import * as ts from "typescript"; // Need typescript for tsconfig parsing

// New type for enhanced node data
export interface GraphNodeData {
  label: string;
  type: "Component" | "File" | "FileDep" | "LibDep";
  filePath?: string; // For file nodes
  componentId?: string; // For component nodes
  hooksUsed?: HookUsage[];
  fileDependencies?: DependencyInfo[];
  libraryDependencies?: DependencyInfo[];
  isExternal?: boolean; // For dependency nodes
  isEntry?: boolean; // Mark the entry file node
}

// --- START MOVED HELPERS & CACHE ---
interface TsConfig {
  compilerOptions?: {
    baseUrl?: string;
    paths?: Record<string, string[]>;
  };
}

// Helper to find the tsconfig.json recursively upwards
function findTsConfigPath(startDir: string): string | undefined {
  let currentDir = startDir;
  while (true) {
    // Loop until root or found
    const tsconfigPath = path.join(currentDir, "tsconfig.json");
    if (fs.existsSync(tsconfigPath)) {
      return tsconfigPath;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      // We've reached the root directory and haven't found tsconfig.json
      return undefined;
    }
    currentDir = parentDir;
  }
}

// Helper to read and parse tsconfig.json
function readTsConfig(configPath: string): TsConfig | undefined {
  try {
    const configFileText = fs.readFileSync(configPath, "utf8");
    const result = ts.parseConfigFileTextToJson(configPath, configFileText);
    if (result.error) {
      outputChannel.appendLine(
        `[Graph] Error parsing tsconfig.json ${configPath}: ${result.error.messageText}`
      );
      return undefined;
    }
    return result.config as TsConfig;
  } catch (error: any) {
    outputChannel.appendLine(
      `[Graph] Error reading tsconfig.json ${configPath}: ${error.message}`
    );
    return undefined;
  }
}

// Helper function to resolve paths with common extensions and index files
function resolvePathWithExtensions(
  baseDir: string,
  modulePath: string
): string | undefined {
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".json"];
  const resolvedBase = path.resolve(baseDir, modulePath);

  // 1. Check if the exact path exists (might already have extension)
  if (fs.existsSync(resolvedBase) && fs.lstatSync(resolvedBase).isFile()) {
    return resolvedBase;
  }

  // 2. Check with extensions added
  for (const ext of extensions) {
    const potentialPath = resolvedBase + ext;
    if (fs.existsSync(potentialPath) && fs.lstatSync(potentialPath).isFile()) {
      return potentialPath;
    }
  }

  // 3. Check if it's a directory and look for an index file
  if (fs.existsSync(resolvedBase) && fs.lstatSync(resolvedBase).isDirectory()) {
    for (const ext of extensions) {
      const potentialIndexPath = path.join(resolvedBase, `index${ext}`);
      if (
        fs.existsSync(potentialIndexPath) &&
        fs.lstatSync(potentialIndexPath).isFile()
      ) {
        return potentialIndexPath;
      }
    }
  }

  // 4. If original modulePath didn't have extension, check dir/index patterns too
  // (Fix: Ensure we resolve relative to baseDir correctly here)
  const potentialDirForIndex = path.resolve(baseDir, modulePath);
  if (
    fs.existsSync(potentialDirForIndex) &&
    fs.lstatSync(potentialDirForIndex).isDirectory()
  ) {
    for (const ext of extensions) {
      const potentialIndexPath = path.join(potentialDirForIndex, `index${ext}`);
      if (
        fs.existsSync(potentialIndexPath) &&
        fs.lstatSync(potentialIndexPath).isFile()
      ) {
        return potentialIndexPath;
      }
    }
  }

  return undefined; // Could not resolve
}

// Module-level cache for tsconfig
let tsConfigCache: TsConfig | null | undefined = undefined; // undefined = not checked, null = not found/error
let tsConfigBasePath: string | undefined = undefined;
// --- END MOVED HELPERS & CACHE ---

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
): { nodes: Node<GraphNodeData>[]; edges: Edge[] } {
  outputChannel.appendLine(
    `[Graph] Building graph for: ${targetPath} (maxDepth: ${maxDepth})`
  );

  // --- START MOVED TSCONFIG INIT ---
  // Initialize tsconfig cache at the start of the build
  // Reset cache state for each build in case workspace changes
  tsConfigCache = undefined;
  tsConfigBasePath = undefined;
  const entryDir = path.dirname(targetPath);
  const configPath = findTsConfigPath(entryDir);

  if (configPath) {
    tsConfigBasePath = path.dirname(configPath);
    outputChannel.appendLine(`[Graph] Found tsconfig at: ${configPath}`);
    tsConfigCache = readTsConfig(configPath);
    if (!tsConfigCache) {
      outputChannel.appendLine("[Graph] Failed to read/parse tsconfig.");
      tsConfigCache = null; // Mark as failed
    } else {
      outputChannel.appendLine("[Graph] Successfully parsed tsconfig.");
      if (tsConfigCache.compilerOptions?.paths) {
        outputChannel.appendLine(
          `[Graph] tsconfig paths: ${JSON.stringify(
            tsConfigCache.compilerOptions.paths
          )}`
        );
      }
      if (tsConfigCache.compilerOptions?.baseUrl) {
        outputChannel.appendLine(
          `[Graph] tsconfig baseUrl: ${tsConfigCache.compilerOptions.baseUrl}`
        );
      }
    }
  } else {
    outputChannel.appendLine(
      `[Graph] Could not find tsconfig.json starting from ${entryDir}. Alias resolution might fail.`
    );
    tsConfigCache = null; // Mark as not found
  }
  // --- END MOVED TSCONFIG INIT ---

  const nodes: Node<GraphNodeData>[] = [];
  const edges: Edge[] = [];
  const nodePositions: { [id: string]: { x: number; y: number } } = {};

  const xSpacing = 350; // Increased spacing for potential dependency nodes
  const ySpacing = 100;

  const addedNodeIds = new Set<string>();
  const addedEdgeIds = new Set<string>();
  const exploredComponentIds = new Set<string>();

  type QueueItem =
    | {
        type: "file";
        filePath: string;
        depth: number;
        sourceNodeId?: string;
      }
    | {
        type: "component";
        componentId: string; // ID from indexer (filePath:Name)
        componentName: string;
        filePath: string;
        depth: number;
        sourceNodeId: string;
      };
  const queue: QueueItem[] = [{ type: "file", filePath: targetPath, depth: 0 }];

  const findComponentDetails = (
    compId: string // Indexer ID (filePath:Name)
  ): { component: ComponentNode; file: FileNode } | undefined => {
    // Extract filePath from the component ID
    const filePath = compId.substring(0, compId.lastIndexOf(":"));
    const fileNode = indexerService.getIndexedData().get(filePath);
    if (!fileNode) {
      outputChannel.appendLine(
        `[Graph Helper] findComponentDetails failed - File not found for ID: ${compId}`
      );
      return undefined;
    }
    const component = fileNode.components.find((c) => c.id === compId);
    if (component) {
      return { component, file: fileNode };
    }
    outputChannel.appendLine(
      `[Graph Helper] findComponentDetails failed - Component not found in file for ID: ${compId}`
    );
    return undefined;
  };

  const getGraphNodeId = (
    type: "file" | "component" | "filedep" | "libdep",
    id: string
  ): string => {
    return `${type}::${id}`;
  };

  const addNode = (node: Node<GraphNodeData>, depth: number) => {
    if (!addedNodeIds.has(node.id)) {
      // Determine x position based on depth and type (Component vs others)
      let currentX = depth * xSpacing;
      if (node.data.type === "Component") {
        currentX += xSpacing / 2; // Offset components slightly
      } else if (node.data.type === "FileDep" || node.data.type === "LibDep") {
        currentX += xSpacing * 0.75; // Offset dependencies even further?
      }

      // Count nodes already placed at this specific X coordinate to determine Y
      const nodesAtThisX = nodes.filter(
        (n) => nodePositions[n.id]?.x === currentX
      );
      const position = {
        x: currentX,
        y: 50 + nodesAtThisX.length * ySpacing, // Stack vertically at the same X
      };

      node.position = position;
      nodePositions[node.id] = position;
      nodes.push(node);
      addedNodeIds.add(node.id);

      outputChannel.appendLine(
        `[Graph] Adding Node: ${node.id} (${node.data.label}) at depth ${depth} Type: ${node.data.type} Pos:(${position.x}, ${position.y})`
      );
    } else {
      outputChannel.appendLine(`[Graph] Node already exists: ${node.id}`);
    }
  };

  const addEdge = (edge: Edge) => {
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
    if (!currentItem) break;

    outputChannel.appendLine(
      `[Graph] Processing Queue Item: ${JSON.stringify(currentItem)}`
    );

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

    if (currentItem.type === "file") {
      const { filePath, sourceNodeId } = currentItem;
      let fileNode = indexerService.getIndexedData().get(filePath);

      if (!fileNode) {
        outputChannel.appendLine(
          `[Graph] File not indexed, parsing on demand: ${filePath}`
        );
        try {
          const parseResult = indexerService.parseFile(filePath);
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

      processFileNode(fileNode, currentDepth, sourceNodeId);
    } else if (currentItem.type === "component") {
      const { componentId, componentName, filePath, sourceNodeId } =
        currentItem;
      const graphComponentId = getGraphNodeId("component", componentId);

      // Check if already explored this specific component ID
      if (exploredComponentIds.has(componentId)) {
        outputChannel.appendLine(
          `[Graph] Component ${componentId} already explored, skipping.`
        );
        continue;
      }

      // Find component details using the indexer ID
      const details = findComponentDetails(componentId);
      if (!details) {
        outputChannel.appendLine(
          `[Graph] Component details not found for ${componentId}, skipping.`
        );
        continue; // Skip if component data isn't found
      }
      const { component, file: parentFileNode } = details;

      // Add the component node
      addNode(
        {
          id: graphComponentId,
          position: { x: 0, y: 0 }, // Placeholder
          // Pass relevant data to the node for rendering
          data: {
            label: componentName,
            type: "Component",
            componentId: componentId, // Store indexer ID
            hooksUsed: component.hooksUsed,
            fileDependencies: component.fileDependencies,
            libraryDependencies: component.libraryDependencies,
            filePath: filePath, // Store defining file path
          },
          type: "ComponentNode", // Custom node type for React Flow
        },
        currentDepth
      );

      // Add edge from the source (file or component) to this component
      addEdge({
        id: `e-${sourceNodeId}-${graphComponentId}`,
        source: sourceNodeId,
        target: graphComponentId,
        animated: true,
        type: "smoothstep",
        // style: { stroke: '#00ff00' }, // Optional: Style component definition edges
      });

      // Mark as explored *before* processing dependencies to prevent cycles
      exploredComponentIds.add(componentId);

      // Process rendered components (outgoing rendering edges)
      if (currentDepth < maxDepth) {
        component.renderedComponents.forEach((rendered) => {
          // Pass the componentId (indexer ID) of the current (rendering) component
          resolveAndQueueRenderedComponent(
            rendered,
            component, // Pass the full ComponentNode
            componentId, // Pass indexer ID
            parentFileNode,
            currentDepth // Depth of the rendering component
          );
        });

        // Process file dependencies (outgoing dependency edges)
        component.fileDependencies.forEach((dep) => {
          processDependency(dep, graphComponentId, currentDepth, "filedep");
        });

        // Process library dependencies (outgoing dependency edges)
        component.libraryDependencies.forEach((dep) => {
          processDependency(dep, graphComponentId, currentDepth, "libdep");
        });
      }
    }
  }

  // --- Helper Functions Nested Inside ---

  function processFileNode(
    fileNode: FileNode,
    depth: number,
    sourceNodeId?: string
  ) {
    const graphFileId = getGraphNodeId("file", fileNode.id);
    outputChannel.appendLine(
      `[Graph] Processing File Node: ${fileNode.id} at depth ${depth}`
    );

    addNode(
      {
        id: graphFileId,
        position: { x: 0, y: 0 }, // Placeholder
        data: {
          label: fileNode.name,
          type: "File",
          filePath: fileNode.filePath,
          isEntry: depth === 0, // Mark if it's the root file
        },
        type: "FileNode", // Custom node type for React Flow
      },
      depth
    );

    // If this file was reached from another node, add the edge
    if (sourceNodeId) {
      addEdge({
        id: `e-${sourceNodeId}-${graphFileId}`,
        source: sourceNodeId,
        target: graphFileId,
        animated: false,
        type: "smoothstep",
        style: { stroke: "#aaa", strokeDasharray: "5 5" }, // Style file import edges
      });
    }

    // Queue components defined in this file (only if depth allows further exploration)
    if (depth < maxDepth) {
      fileNode.components.forEach((comp) => {
        outputChannel.appendLine(
          `[Graph] Queuing component from file ${fileNode.id}: ${comp.name}`
        );
        queue.push({
          type: "component",
          componentId: comp.id, // Use the indexer ID
          componentName: comp.name,
          filePath: fileNode.filePath,
          depth: depth + 1,
          sourceNodeId: graphFileId, // Source is the file node
        });
      });
    }
  }

  // New function to handle processing and adding dependency nodes/edges
  function processDependency(
    dep: DependencyInfo,
    sourceComponentGraphId: string, // Graph ID of the component using the dep
    componentDepth: number,
    depType: "filedep" | "libdep"
  ) {
    const targetId = dep.source; // Use module specifier as base ID
    const graphDepId = getGraphNodeId(depType, targetId);
    const depDepth = componentDepth + 1; // Place deps at next level

    if (depDepth > maxDepth) {
      outputChannel.appendLine(
        `[Graph] Skipping dependency due to depth: ${targetId}`
      );
      return;
    }

    outputChannel.appendLine(
      `[Graph] Processing Dependency: ${targetId} from ${sourceComponentGraphId}`
    );

    addNode(
      {
        id: graphDepId,
        position: { x: 0, y: 0 }, // Placeholder
        data: {
          label: targetId, // Display module specifier
          type: depType === "filedep" ? "FileDep" : "LibDep",
          filePath: depType === "filedep" ? targetId : undefined, // Store path for file deps
          isExternal: depType === "libdep",
        },
        type: "DependencyNode", // Custom node type for React Flow
      },
      depDepth // Add at the next depth level
    );

    addEdge({
      id: `e-${sourceComponentGraphId}-${graphDepId}`,
      source: sourceComponentGraphId,
      target: graphDepId,
      animated: false,
      type: "smoothstep",
      style: { stroke: "#f6ad55", strokeDasharray: "3 3" }, // Style dependency edges
    });

    // FUTURE: If it's a file dependency, we *could* potentially queue the actual file
    // for further analysis, turning the FileDep node into a File node if found.
    // This requires resolving the relative path `dep.source` against the source component's file path.
    // Example (needs path resolution logic):
    // if (depType === 'filedep') {
    //     const sourceCompFilePath = nodes.find(n => n.id === sourceComponentGraphId)?.data.filePath;
    //     if (sourceCompFilePath) {
    //         const resolvedDepPath = resolveImportPath(dep.source, sourceCompFilePath); // You need this helper
    //         if (resolvedDepPath) {
    //             // Check if this file is already added or in queue to avoid cycles/redundancy
    //             const existingFileGraphId = getGraphNodeId("file", resolvedDepPath);
    //             if (!addedNodeIds.has(existingFileGraphId)) {
    //                  // We could queue it, but might make graph huge. Stick to showing the dependency link for now.
    //                 // queue.push({ type: 'file', filePath: resolvedDepPath, depth: depDepth, sourceNodeId: sourceComponentGraphId });
    //             }
    //         }
    //     }
    // }
  }

  function resolveAndQueueRenderedComponent(
    rendered: { name: string; location: any },
    renderingComponent: ComponentNode,
    renderingComponentId: string, // indexer ID (filePath:Name)
    parentFileNode: FileNode,
    currentDepth: number // Depth of the *rendering* component
  ) {
    const renderingComponentGraphId = getGraphNodeId(
      "component",
      renderingComponentId
    );
    outputChannel.appendLine(
      `[Graph] Resolving rendered component: ${rendered.name} by ${renderingComponent.name}`
    );

    // 1. Find the import statement for the rendered component name in the parent file
    const importInfo = findImportInfo(rendered.name, parentFileNode.imports);

    if (!importInfo) {
      outputChannel.appendLine(
        `[Graph] Could not find import for rendered component: ${rendered.name} in ${parentFileNode.filePath}. Assuming local.`
      );
      // Attempt to find the component defined in the *same file*
      const localComponent = parentFileNode.components.find(
        (c) => c.name === rendered.name
      );
      if (localComponent) {
        const localComponentGraphId = getGraphNodeId(
          "component",
          localComponent.id
        );
        // Check if the target component is already explored or would exceed depth
        if (
          !exploredComponentIds.has(localComponent.id) &&
          currentDepth + 1 <= maxDepth
        ) {
          outputChannel.appendLine(
            `[Graph] Queuing locally defined component: ${localComponent.name}`
          );
          queue.push({
            type: "component",
            componentId: localComponent.id,
            componentName: localComponent.name,
            filePath: parentFileNode.filePath,
            depth: currentDepth + 1,
            sourceNodeId: renderingComponentGraphId, // Link from the rendering component
          });
        } else if (addedNodeIds.has(localComponentGraphId)) {
          // If already added but not queued (due to depth/explored), still draw the edge
          outputChannel.appendLine(
            `[Graph] Adding edge to existing local component node: ${localComponent.name}`
          );
          addEdge({
            id: `e-${renderingComponentGraphId}-${localComponentGraphId}`,
            source: renderingComponentGraphId,
            target: localComponentGraphId,
            animated: true,
            type: "smoothstep",
          });
        }
      }
      return; // Stop here if assumed local
    }

    outputChannel.appendLine(
      `[Graph] Found import for ${rendered.name}: ${JSON.stringify(importInfo)}`
    );

    // 2. Resolve the imported module path to an absolute file path
    const resolvedPath = resolveImportPath(
      importInfo.moduleSpecifier,
      parentFileNode.filePath
    );

    if (!resolvedPath) {
      // Could be an external library or unresolved path
      outputChannel.appendLine(
        `[Graph] Could not resolve import path: ${importInfo.moduleSpecifier}. Treating as external/unresolved.`
      );
      // Optional: Create a node for unresolved/external imports?
      // For now, we just don't queue it.
      return;
    }

    outputChannel.appendLine(`[Graph] Resolved import path: ${resolvedPath}`);

    // 3. Find the target component definition in the resolved file
    // We need to parse the target file if it hasn't been already
    let targetFileNode = indexerService.getIndexedData().get(resolvedPath);
    if (!targetFileNode) {
      outputChannel.appendLine(
        `[Graph] Target file for import ${resolvedPath} not indexed, parsing.`
      );
      const parsedFileNode = indexerService.parseFile(resolvedPath);
      if (!parsedFileNode) {
        outputChannel.appendLine(
          `[Graph] Failed to parse target file: ${resolvedPath}`
        );
        return; // Cannot proceed if target file parsing fails
      }
      targetFileNode = parsedFileNode; // Assign the successfully parsed node
    }

    // Find the component in the target file (using the imported name, could be alias)
    const targetComponent = targetFileNode.components.find(
      (c) =>
        c.name === importInfo.importedName || // Match original name
        (importInfo.isDefault && c.exported) // Or match default export if imported as default
      // TODO: Handle named exports with aliases more robustly
    );

    if (!targetComponent) {
      outputChannel.appendLine(
        `[Graph] Could not find exported component ${importInfo.importedName} in ${resolvedPath}`
      );
      // TODO: Maybe check hooks as well? Or just skip.
      return;
    }

    const targetComponentGraphId = getGraphNodeId(
      "component",
      targetComponent.id
    );

    // 4. Queue the found component for processing if conditions met
    if (
      !exploredComponentIds.has(targetComponent.id) &&
      currentDepth + 1 <= maxDepth
    ) {
      outputChannel.appendLine(
        `[Graph] Queuing imported component: ${targetComponent.name} from ${resolvedPath}`
      );
      queue.push({
        type: "component",
        componentId: targetComponent.id,
        componentName: targetComponent.name,
        filePath: resolvedPath,
        depth: currentDepth + 1,
        sourceNodeId: renderingComponentGraphId, // Link from the rendering component
      });
    } else if (addedNodeIds.has(targetComponentGraphId)) {
      // If already added but not queued, draw the edge
      outputChannel.appendLine(
        `[Graph] Adding edge to existing imported component node: ${targetComponent.name}`
      );
      addEdge({
        id: `e-${renderingComponentGraphId}-${targetComponentGraphId}`,
        source: renderingComponentGraphId,
        target: targetComponentGraphId,
        animated: true,
        type: "smoothstep",
      });
    }
  }

  function findImportInfo(
    localName: string,
    imports: ImportData[] // Use the actual ImportData type (already imported)
  ):
    | { moduleSpecifier: string; importedName: string; isDefault: boolean }
    | undefined {
    for (const imp of imports) {
      // Check default import
      if (imp.defaultImport && imp.defaultImport === localName) {
        // Need to know the *actual* exported name if it was exported as default
        // This is tricky without deeper analysis. Assume default export name isn't readily available here.
        // For now, we'll signal it's a default import and maybe handle it downstream.
        return {
          moduleSpecifier: imp.moduleSpecifier,
          importedName: localName, // Use the local name for now
          isDefault: true,
        };
      }

      // Check named imports
      if (imp.namedBindings) {
        for (const namedImport of imp.namedBindings) {
          // TODO: Handle aliases (e.g., import { Button as MyButton } from ...)
          if (namedImport === localName) {
            return {
              moduleSpecifier: imp.moduleSpecifier,
              importedName: namedImport, // The name as it appears in the import statement
              isDefault: false,
            };
          }
        }
      }

      // Check namespace import (e.g., import * as Material from '@mui/material')
      if (imp.namespaceImport) {
        const namespace = imp.namespaceImport; // e.g., "Material"
        if (localName.startsWith(`${namespace}.`)) {
          const actualName = localName.substring(namespace.length + 1);
          return {
            moduleSpecifier: imp.moduleSpecifier,
            importedName: actualName,
            isDefault: false, // Namespace imports access named exports
          };
        }
      }
    }
    return undefined;
  }

  function resolveImportPath(
    moduleSpecifier: string,
    currentFilePath: string
  ): string | undefined {
    const currentDir = path.dirname(currentFilePath);

    // 1. Handle relative paths
    if (moduleSpecifier.startsWith(".")) {
      try {
        const resolved = resolvePathWithExtensions(currentDir, moduleSpecifier);
        if (resolved) {
          // outputChannel.appendLine(`[Graph] Resolved relative path '${moduleSpecifier}' to '${resolved}'`);
          return resolved;
        }
        outputChannel.appendLine(
          `[Graph] Could not resolve relative import '${moduleSpecifier}' from '${currentFilePath}'`
        );
        return undefined;
      } catch (error: any) {
        outputChannel.appendLine(
          `[Graph] Error resolving relative import '${moduleSpecifier}' from '${currentFilePath}': ${error.message}`
        );
        return undefined;
      }
    } else {
      // 2. Handle non-relative paths (alias or external/node_modules)

      // Attempt alias resolution using tsconfig
      if (tsConfigCache && tsConfigBasePath && tsConfigCache.compilerOptions) {
        const { baseUrl, paths } = tsConfigCache.compilerOptions;
        // Important: baseUrl paths are relative to tsConfigBasePath
        const absoluteBaseUrl = baseUrl
          ? path.resolve(tsConfigBasePath, baseUrl)
          : tsConfigBasePath;

        if (paths) {
          // outputChannel.appendLine(`[Graph] Attempting alias resolution for: ${moduleSpecifier} using base: ${absoluteBaseUrl}`);

          // Find the best matching alias key (longest prefix match first)
          const matchingAlias = Object.keys(paths)
            .sort((a, b) => b.length - a.length) // Sort by length descending
            .find((alias) => {
              if (alias.endsWith("/*")) {
                return moduleSpecifier.startsWith(alias.slice(0, -2));
              } else {
                return moduleSpecifier === alias;
              }
            });

          if (matchingAlias) {
            const aliasTargets = paths[matchingAlias];
            const isStarAlias = matchingAlias.endsWith("/*");
            const aliasPattern = isStarAlias
              ? matchingAlias.slice(0, -2)
              : matchingAlias;
            const remainingPath = isStarAlias
              ? moduleSpecifier.substring(aliasPattern.length)
              : "";

            // --- START LINTER FIX ---
            if (!aliasTargets) {
              outputChannel.appendLine(
                `[Graph] Warning: No path targets found for matched alias '${matchingAlias}' in tsconfig.`
              );
              // Continue to the next check (external/node_modules)
            } else {
              // --- END LINTER FIX ---

              outputChannel.appendLine(
                `[Graph] Matched alias: '${matchingAlias}'. Remaining path: '${remainingPath}'`
              );

              for (const targetPathPattern of aliasTargets) {
                // Replace wildcard in target pattern if needed
                const targetBase =
                  isStarAlias && targetPathPattern.endsWith("/*")
                    ? targetPathPattern.slice(0, -2)
                    : targetPathPattern;

                const potentialDir = path.resolve(absoluteBaseUrl, targetBase);
                const potentialPath = path.join(potentialDir, remainingPath);

                outputChannel.appendLine(
                  `[Graph] Trying potential alias path: ${potentialPath} (from target ${targetPathPattern})`
                );

                // Resolve the potential path using the same extension/index logic
                // Use dirname/basename to handle passing to the helper correctly
                const resolved = resolvePathWithExtensions(
                  path.dirname(potentialPath),
                  `./${path.basename(potentialPath)}`
                );

                if (
                  resolved &&
                  fs.existsSync(resolved) &&
                  fs.lstatSync(resolved).isFile()
                ) {
                  outputChannel.appendLine(
                    `[Graph] Resolved alias '${moduleSpecifier}' to file: ${resolved}`
                  );
                  return resolved;
                } else {
                  outputChannel.appendLine(
                    `[Graph] Alias resolution check failed for: ${
                      resolved || potentialPath
                    }`
                  );
                }
              }
              outputChannel.appendLine(
                `[Graph] Could not resolve alias '${moduleSpecifier}' using pattern '${matchingAlias}' after checking all targets.`
              );
              // --- START LINTER FIX (Closing brace for the if check) ---
            }
            // --- END LINTER FIX ---
          } else {
            // outputChannel.appendLine(`[Graph] No matching tsconfig alias found for '${moduleSpecifier}'.`);
          }
        } else {
          // outputChannel.appendLine(`[Graph] No paths defined in tsconfig compilerOptions.`);
        }
      } else {
        outputChannel.appendLine(
          `[Graph] Skipping alias check: ${
            !tsConfigCache ? "tsconfig not found/parsed" : "no compilerOptions"
          }`
        );
      }

      // 3. If alias resolution fails or no tsconfig, treat as external/node_modules
      //    (We don't attempt to resolve node_modules in this version)
      outputChannel.appendLine(
        `[Graph] Treating import '${moduleSpecifier}' as external (alias resolution failed or node_modules).`
      );
      return undefined;
    }
  }

  outputChannel.appendLine(
    `[Graph] Build complete. Nodes: ${nodes.length}, Edges: ${edges.length}`
  );
  console.log("Graph Nodes:", nodes);
  console.log("Graph Edges:", edges);

  // Add root node styling if targetPath was processed
  const rootNodeId = getGraphNodeId("file", targetPath);
  const rootNode = nodes.find((n) => n.id === rootNodeId);
  if (rootNode) {
    rootNode.style = {
      ...rootNode.style,
      backgroundColor: "rgba(0, 255, 0, 0.1)",
      border: "1px solid green",
    }; // Example highlight
  }

  return { nodes, edges };
}
