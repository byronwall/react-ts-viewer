import * as fs from "fs";
import * as path from "path";
import type { Edge, Node } from "reactflow";
import * as ts from "typescript"; // Need typescript for tsconfig parsing
import { IndexerService } from "./IndexerService";
import { outputChannel } from "./initializeExtension";
import type {
  ComponentNode,
  DependencyInfo,
  FileNode,
  HookUsage,
  ImportData,
} from "./types";

// New type for enhanced node data
export interface GraphNodeData {
  label: string;
  type: "Component" | "File" | "FileDep" | "LibDep" | "HookUsage";
  filePath?: string; // For file nodes
  componentId?: string; // For component nodes
  hooksUsed?: HookUsage[];
  fileDependencies?: DependencyInfo[];
  libraryDependencies?: DependencyInfo[];
  aggregatedLibraryDependencies?: DependencyInfo[]; // Added for File nodes
  isExternal?: boolean; // For dependency nodes
  isEntry?: boolean; // Mark the entry file node
  hookName?: string;
  parentComponentId?: string;
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
  // --- START LINTER FIX ---
  // Keep searching upwards until we find tsconfig.json or reach the root
  let tsconfigPath = path.join(currentDir, "tsconfig.json");
  while (!fs.existsSync(tsconfigPath)) {
    const parentDir = path.dirname(currentDir);
    // Stop if we have reached the root directory
    if (parentDir === currentDir) {
      return undefined;
    }
    currentDir = parentDir;
    tsconfigPath = path.join(currentDir, "tsconfig.json");
  }
  return tsconfigPath;
  // --- END LINTER FIX ---
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
 * @param workspaceRoot The workspace root directory.
 * @returns An object containing the nodes and edges for React Flow.
 */
export function buildDependencyGraph(
  targetPath: string,
  maxDepth: number,
  indexerService: IndexerService,
  workspaceRoot: string
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
  const fileNodeDimensions: {
    [id: string]: { width: number; height: number };
  } = {}; // Store dimensions for file nodes

  const xSpacing = 450; // Increased spacing for parent nodes
  const ySpacing = 400; // Increased vertical spacing for parent nodes
  const componentXOffset = 50; // Offset for components within files
  const componentYOffset = 60; // Increased offset to make space for component label
  const componentYSpacing = 120; // Vertical spacing between components in a file
  const hookXOffset = 10; // Offset for hooks within components
  const hookYOffset = 35; // Start hooks below the component label
  const hookYSpacing = 40; // Vertical spacing between hooks

  const addedNodeIds = new Set<string>();
  const addedEdgeIds = new Set<string>();
  const exploredComponentIds = new Set<string>();
  const componentsInFile: { [fileGraphId: string]: number } = {}; // Track component count per file for positioning

  type QueueItem =
    | {
        type: "file";
        filePath: string;
        depth: number;
        // Removed sourceNodeId as file->component edge is replaced by parent/child
      }
    | {
        type: "component";
        componentId: string; // ID from indexer (filePath:Name)
        componentName: string;
        filePath: string;
        depth: number;
        sourceComponentGraphId: string; // The component *rendering* this one
      };
  // Start with the initial file
  const initialFileQueueItem: QueueItem = {
    type: "file",
    filePath: targetPath,
    depth: 0,
  };
  const queue: QueueItem[] = [initialFileQueueItem];

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

  // Consistent ID generation
  const getGraphNodeId = (
    type: "file" | "component" | "filedep" | "libdep",
    id: string, // Base ID (filePath, componentId, depSource)
    // Optional suffix for uniqueness, like hook index
    suffix?: string | number
  ): string => {
    // Use Buffer to create a more filesystem-friendly ID from paths
    const baseSafeId = Buffer.from(id).toString("base64url");
    const suffixPart = suffix !== undefined ? `::${suffix}` : "";
    return `${type}::${baseSafeId}${suffixPart}`;
  };

  const addNode = (node: Node<GraphNodeData>, depth: number) => {
    if (addedNodeIds.has(node.id)) {
      outputChannel.appendLine(`[Graph] Node already exists: ${node.id}`);
      return; // Don't add or reposition if already present
    }

    let position: { x: number; y: number };

    if (node.data.type === "File") {
      // Position File (parent) nodes in a grid based on depth
      const nodesAtThisDepth = nodes.filter(
        (n) =>
          n.data.type === "File" && nodePositions[n.id]?.x === depth * xSpacing
      );
      position = {
        x: depth * xSpacing,
        y: 50 + nodesAtThisDepth.length * ySpacing,
      };
      // Initialize component count for positioning within this file
      componentsInFile[node.id] = 0;
      // Store initial dimensions (will be updated later if needed)
      fileNodeDimensions[node.id] = {
        width: xSpacing - 50,
        height: ySpacing - 50,
      };
      node.style = {
        ...node.style,
        // Set default dimensions - React Flow might override if children exceed this
        width: fileNodeDimensions[node.id]?.width ?? xSpacing - 50,
        height: fileNodeDimensions[node.id]?.height ?? ySpacing - 50,
        backgroundColor: "rgba(100, 80, 60, 0.1)", // Brownish background
        borderColor: "rgba(160, 120, 80, 0.8)",
        borderWidth: 1,
        borderStyle: "solid",
        // Ensure label is readable
        color: "#ccc", // Light text color for dark theme
        fontSize: "12px",
        // Add padding inside the file node for its children
        padding: "20px",
        zIndex: 0, // Ensure file is behind components
      };
      // Mark as a parent type for React Flow
      node.type = "group"; // Use React Flow's group type for containers
    } else if (node.data.type === "Component" && node.parentNode) {
      // --- Component Node Logic ---
      node.extent = "parent"; // Keep component inside file parent bounds

      // Position Component nodes relative to their parent File node
      const fileGraphId = node.parentNode;
      const componentIndex = componentsInFile[fileGraphId] ?? 0;
      position = {
        x: componentXOffset, // Fixed X offset within parent
        y: componentYOffset + componentIndex * componentYSpacing, // Stack vertically
      };
      componentsInFile[fileGraphId] = componentIndex + 1; // Increment count

      // Optionally update parent file node dimensions if needed (basic estimation)
      const fileDims = fileNodeDimensions[fileGraphId];
      if (fileDims) {
        const requiredHeight = position.y + componentYSpacing; // Estimate needed height
        if (requiredHeight > fileDims.height) {
          fileDims.height = requiredHeight + componentYOffset; // Add padding
          const parentNode = nodes.find((n) => n.id === fileGraphId);
          if (parentNode) {
            parentNode.style = {
              ...parentNode.style,
              height: fileDims.height,
            };
          }
        }
        // Similar logic could be added for width if needed
      }

      // Basic Style for component group node
      node.style = {
        backgroundColor: "rgba(16, 94, 80, 0.3)", // Dark teal background
        borderColor: "rgba(22, 163, 136, 1)", // Teal border
        borderWidth: 1,
        borderStyle: "solid",
        color: "#eee",
        fontSize: "11px",
        padding: "5px", // Reduced padding as hooks are now nodes
        width: xSpacing - 50 - 2 * componentXOffset - 20, // Parent width - margins - padding
        height: hookYOffset, // Base height before adding hooks, label is implicitly positioned by react-flow
      };

      // --- Add Hook Nodes as Children ---
      let componentHeight = hookYOffset; // Start height calculation
      if (node.data.hooksUsed && node.data.hooksUsed.length > 0) {
        node.data.hooksUsed.forEach((hook, index) => {
          const hookGraphId = getGraphNodeId(
            "component", // Base type off parent
            node.id, // Use component graph ID as base
            `hook_${index}` // Add hook index for uniqueness
          );
          const hookNode: Node<GraphNodeData> = {
            id: hookGraphId,
            position: { x: 0, y: 0 }, // Positioned relative to component in HookUsage block
            parentNode: node.id, // Set parent to the component node
            extent: "parent",
            data: {
              label: hook.hookName,
              type: "HookUsage",
              hookName: hook.hookName,
              parentComponentId: node.data.componentId, // Store originating component indexer ID
            },
          };
          // Recursively call addNode for the hook
          addNode(hookNode, depth + 1); // Place hooks visually 'inside' component level
          componentHeight += hookYSpacing; // Increment height for each hook
        });
      }
      // Update component node height based on hooks added
      node.style.height = Math.max(componentHeight, 50); // Ensure a minimum height
      // -------------------------------
    } else if (node.data.type === "HookUsage" /* && node.parentNode */) {
      // --- HookUsage Node Logic (No longer parented to Component visually) ---
      // Hooks will now position relative to the canvas origin, not the component
      // Position Hook nodes relative to their parent Component node
      // const componentGraphId = node.parentNode; // ParentNode link is broken by removing group

      // Find index based on ID suffix (hacky, but works for now)
      const parts = node.id.split("::");
      const indexStr = parts[parts.length - 1]?.split("_")[1];
      const hookIndex = indexStr ? parseInt(indexStr, 10) : 0;

      position = {
        x: hookXOffset, // Fixed X offset within parent component
        y: hookYOffset + hookIndex * hookYSpacing, // Stack vertically
      };
      // Style HookUsage nodes
      node.style = {
        backgroundColor: "rgba(40, 50, 100, 0.4)", // Bluish background
        borderColor: "rgba(80, 100, 200, 1)", // Blue border
        borderWidth: 1,
        borderStyle: "solid",
        color: "#ddd",
        fontSize: "9px",
        padding: "3px 5px",
        // Width can be fixed or dynamic based on label
        // width: (nodePositions[componentGraphId]?.x ? (nodes.find(n => n.id === componentGraphId)?.style?.width as number ?? 200) : 200) - 2 * hookXOffset - 10,
        width: 150, // Fixed width for now
        height: hookYSpacing - 10, // Fit within spacing
      };
    } else if (node.data.type === "FileDep" || node.data.type === "LibDep") {
      // Position Dependency nodes - maybe position relative to source component later?
      // For now, place them at the next depth level, similar to original logic
      const currentX = (depth + 0.5) * xSpacing; // Place between file/component levels
      const nodesAtThisX = nodes.filter(
        (n) =>
          (n.data.type === "FileDep" || n.data.type === "LibDep") &&
          nodePositions[n.id]?.x === currentX
      );
      position = {
        x: currentX,
        y: 100 + nodesAtThisX.length * ySpacing * 0.5, // Adjust Y spacing for deps
      };
      node.style = {
        backgroundColor: "rgba(60, 60, 60, 0.3)",
        borderColor: "#888",
        borderWidth: 1,
        borderStyle: "dashed",
        color: "#bbb",
        fontSize: "10px",
        padding: "5px",
      };
    } else {
      // Default positioning for any other unexpected node types or components without parents
      outputChannel.appendLine(
        `[Graph] Warning: Node ${node.id} (${node.data.type}) has unexpected state for positioning.`
      );
      position = { x: depth * xSpacing, y: 500 }; // Fallback position
    }

    node.position = position;
    nodePositions[node.id] = position; // Store absolute position for layout reference
    nodes.push(node);
    addedNodeIds.add(node.id);

    outputChannel.appendLine(
      `[Graph] Adding Node: ${node.id} (${node.data.label}) Type: ${
        node.data.type
      } ${node.parentNode ? `Parent: ${node.parentNode}` : ""} Pos:(${
        position.x
      }, ${position.y})`
    );
  };

  const addEdge = (edge: Edge) => {
    if (edge.source === edge.target) {
      outputChannel.appendLine(`[Graph] Skipping self-loop edge: ${edge.id}`);
      return;
    }
    if (!addedNodeIds.has(edge.source) || !addedNodeIds.has(edge.target)) {
      outputChannel.appendLine(
        `[Graph] Skipping edge ${edge.id} because source or target node not found.`
      );
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
      const { filePath } = currentItem;
      let fileNodeData = indexerService.getIndexedData().get(filePath);

      if (!fileNodeData) {
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
          fileNodeData = indexerService.getIndexedData().get(filePath); // Try getting again
          if (!fileNodeData) {
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

      processFileNode(fileNodeData, currentDepth); // Pass depth
    } else if (currentItem.type === "component") {
      const {
        componentId,
        componentName,
        filePath,
        sourceComponentGraphId, // Renamed from sourceNodeId for clarity
      } = currentItem;
      const graphComponentId = getGraphNodeId("component", componentId);
      const parentFileGraphId = getGraphNodeId("file", filePath); // ID of the file this component is defined in

      // Check if already explored this specific component ID
      if (exploredComponentIds.has(componentId)) {
        outputChannel.appendLine(
          `[Graph] Component ${componentId} already explored, skipping queue processing.`
        );
        // Still add the edge if the source component is valid and node exists
        if (
          sourceComponentGraphId &&
          addedNodeIds.has(sourceComponentGraphId) &&
          addedNodeIds.has(graphComponentId)
        ) {
          addEdge({
            id: `e-${sourceComponentGraphId}-renders-${graphComponentId}`, // More descriptive ID
            source: sourceComponentGraphId,
            target: graphComponentId,
            animated: true,
            type: "smoothstep",
            style: { stroke: "#00bbff" }, // Style component render edges
          });
        }
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
      const { component, file: parentFileNode } = details; // parentFileNode here is the FileNode from indexer

      // Add the component node, associating it with its parent file
      addNode(
        {
          id: graphComponentId,
          position: { x: 0, y: 0 }, // Position is relative to parent, calculated in addNode
          // --- START Parent Association ---
          parentNode: parentFileGraphId, // Link to the file container node
          extent: "parent", // Keep node inside parent bounds
          // --- END Parent Association ---
          data: {
            label: componentName,
            type: "Component",
            componentId: componentId, // Store indexer ID
            hooksUsed: component.hooksUsed,
            fileDependencies: component.fileDependencies,
            libraryDependencies: component.libraryDependencies,
            filePath: filePath, // Store defining file path
          },
          // type: 'ComponentNode', // Keep or adjust based on frontend needs
        },
        currentDepth // Pass depth for potential fallback positioning logic
      );

      // --- Edge Removed: No longer drawing edge from file to component ---
      // The parent/child relationship handles this visually.

      // Add edge from the *rendering* component to this component
      // Ensure the source component node actually exists before adding edge
      if (sourceComponentGraphId && addedNodeIds.has(sourceComponentGraphId)) {
        addEdge({
          id: `e-${sourceComponentGraphId}-renders-${graphComponentId}`,
          source: sourceComponentGraphId,
          target: graphComponentId,
          animated: true,
          type: "smoothstep",
          style: { stroke: "#00bbff" }, // Style component render edges
        });
      } else if (sourceComponentGraphId) {
        outputChannel.appendLine(
          `[Graph] Skipping render edge to ${graphComponentId} because source component ${sourceComponentGraphId} not found.`
        );
      }

      // Mark as explored *before* processing dependencies to prevent cycles
      exploredComponentIds.add(componentId);

      // Process rendered components (outgoing rendering edges) only if depth allows
      if (currentDepth < maxDepth) {
        component.renderedComponents.forEach((rendered) => {
          resolveAndQueueRenderedComponent(
            rendered,
            component, // Pass the full ComponentNode data from indexer
            componentId, // Pass indexer ID of the *rendering* component
            parentFileNode, // Pass the FileNode data from indexer
            currentDepth // Depth of the *rendering* component
          );
        });

        // Process file dependencies (outgoing dependency edges)
        component.fileDependencies.forEach((dep) => {
          // Pass the *component's* graph ID as source
          processDependency(dep, graphComponentId, currentDepth, "filedep");
        });

        // Process library dependencies (outgoing dependency edges)
        component.libraryDependencies.forEach((dep) => {
          // Pass the *component's* graph ID as source
          processDependency(dep, graphComponentId, currentDepth, "libdep");
        });
      }
    }
  }

  // --- Helper Functions Nested Inside ---

  function processFileNode(fileNodeData: FileNode, depth: number) {
    const graphFileId = getGraphNodeId("file", fileNodeData.filePath); // Use filePath for unique ID
    // Use relative path for label if possible
    const relativeFilePath = path.relative(
      workspaceRoot,
      fileNodeData.filePath
    );
    outputChannel.appendLine(
      `[Graph] Processing File Node (as Parent): ${relativeFilePath} at depth ${depth}`
    );

    // --- START Aggregate Library Dependencies ---
    const aggregatedLibs = new Map<string, DependencyInfo>();
    fileNodeData.components.forEach((comp) => {
      comp.libraryDependencies?.forEach((dep) => {
        // Use source as the key to avoid duplicates
        if (!aggregatedLibs.has(dep.source)) {
          aggregatedLibs.set(dep.source, dep);
        }
      });
    });
    const aggregatedLibraryDependencies = Array.from(aggregatedLibs.values());
    // --- END Aggregate Library Dependencies ---

    // Check if file node already added (could happen if referenced as dependency before being processed directly)
    if (!addedNodeIds.has(graphFileId)) {
      addNode(
        {
          id: graphFileId,
          position: { x: 0, y: 0 }, // Placeholder, calculated in addNode
          data: {
            label: relativeFilePath || fileNodeData.name, // Display relative path
            type: "File",
            filePath: fileNodeData.filePath,
            isEntry: depth === 0, // Mark if it's the root file
            // --- START Add Aggregated Dependencies ---
            aggregatedLibraryDependencies: aggregatedLibraryDependencies,
            // --- END Add Aggregated Dependencies ---
          },
          // type: 'FileNode', // Set to 'group' in addNode
        },
        depth
      );
    } else {
      outputChannel.appendLine(
        `[Graph] File node ${graphFileId} already added.`
      );
      // Ensure it's marked as entry if it's the root file being processed now
      // Also update its aggregated dependencies if processed again
      const existingNode = nodes.find((n) => n.id === graphFileId);
      if (existingNode) {
        if (depth === 0 && !existingNode.data.isEntry) {
          existingNode.data.isEntry = true;
          // Re-apply entry styling if needed? (Handled by React Flow based on data)
        }
        // Update dependencies (merge or replace? Replacing seems simpler for now)
        existingNode.data.aggregatedLibraryDependencies =
          aggregatedLibraryDependencies;
      }
    }

    // Queue components defined in this file (only if depth allows further exploration)
    // Components are queued with depth+1
    if (depth < maxDepth) {
      fileNodeData.components.forEach((comp) => {
        outputChannel.appendLine(
          `[Graph] Queuing component from file ${relativeFilePath}: ${comp.name}`
        );
        // Components are rendered *by* something. Here, they are defined within the file.
        // We need to decide if we want edges representing definition.
        // For now, the parent/child relationship shows definition.
        // We only queue components if they are *rendered* by another component.
        // Let's initiate the component processing directly from the file processing
        // if we want to show components even if not rendered by the entry point's components.

        // Check if component already explored or added
        const graphCompId = getGraphNodeId("component", comp.id);
        if (
          !exploredComponentIds.has(comp.id) &&
          !addedNodeIds.has(graphCompId)
        ) {
          // Add the component node directly, parented to the file
          addNode(
            {
              id: graphCompId,
              position: { x: 0, y: 0 }, // Relative pos calculated in addNode
              parentNode: graphFileId,
              extent: "parent",
              data: {
                label: comp.name,
                type: "Component",
                componentId: comp.id,
                hooksUsed: comp.hooksUsed,
                fileDependencies: comp.fileDependencies,
                libraryDependencies: comp.libraryDependencies,
                filePath: fileNodeData.filePath,
              },
              // type: 'ComponentNode'
            },
            depth + 1 // Treat components as being at the next logical level
          );
          // Now, explore this component's dependencies and rendered children
          exploredComponentIds.add(comp.id); // Mark as explored

          if (depth + 1 < maxDepth) {
            // Process rendered components
            comp.renderedComponents.forEach((rendered) => {
              resolveAndQueueRenderedComponent(
                rendered,
                comp,
                comp.id,
                fileNodeData,
                depth + 1 // Depth of this component
              );
            });

            // Process dependencies
            comp.fileDependencies.forEach((dep) => {
              processDependency(dep, graphCompId, depth + 1, "filedep");
            });
            comp.libraryDependencies.forEach((dep) => {
              processDependency(dep, graphCompId, depth + 1, "libdep");
            });
          }
        } else {
          outputChannel.appendLine(
            `[Graph] Component ${comp.name} (${comp.id}) already added or explored.`
          );
        }
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
    const depDepth = componentDepth; // Place deps visually closer to their source component level

    // Don't check maxDepth here, let the component logic handle traversal depth.
    // Always show direct dependencies of explored components.
    // if (depDepth > maxDepth) { ... } // Removed depth check here

    outputChannel.appendLine(
      `[Graph] Processing Dependency: ${targetId} from ${sourceComponentGraphId}`
    );

    // --- START DEPENDENCY NODE REMOVAL ---
    // Comment out adding separate nodes and edges for dependencies
    /*
    // Only add the node if it doesn't exist
    if (!addedNodeIds.has(graphDepId)) {
      addNode(
        {
          id: graphDepId,
          position: { x: 0, y: 0 }, // Placeholder, calculated in addNode
          data: {
            label: targetId, // Display module specifier
            type: depType === "filedep" ? "FileDep" : "LibDep",
            // Resolve file path for file dependencies if possible (useful for linking later)
            filePath:
              depType === "filedep"
                ? resolveImportPath(
                    targetId,
                    nodes.find((n) => n.id === sourceComponentGraphId)?.data
                      .filePath ?? ""
                  ) // Attempt resolution
                : undefined,
            isExternal: depType === "libdep",
          },
          // type: 'DependencyNode', // Keep or adjust based on frontend needs
        },
        depDepth // Add node at the calculated depth
      );
    }

    // Always add the edge from the component to the dependency node
    addEdge({
      id: `e-${sourceComponentGraphId}-depends-${graphDepId}`,
      source: sourceComponentGraphId,
      target: graphDepId,
      animated: false,
      type: "smoothstep",
      style: { stroke: "#f6ad55", strokeDasharray: "3 3" }, // Style dependency edges
    });
    */
    outputChannel.appendLine(
      `[Graph] Skipped adding separate node/edge for dependency: ${targetId}`
    );
    // --- END DEPENDENCY NODE REMOVAL ---

    // Future Enhancement: If it's a successfully resolved 'filedep',
    // we could potentially link `graphDepId` to the actual `FileNode` (`graphFileId`)
    // instead of showing a separate 'FileDep' node. This would connect components
    // directly to the File containers they import from.
    // This requires reliable path resolution and checking if the target file node exists.
  }

  function resolveAndQueueRenderedComponent(
    rendered: { name: string; location: any }, // location might be useful later
    renderingComponentData: ComponentNode, // Data of the component doing the rendering
    renderingComponentId: string, // indexer ID (filePath:Name) of the rendering component
    parentFileNodeData: FileNode, // FileNode data where rendering component is defined
    renderingComponentDepth: number // Depth of the *rendering* component
  ) {
    const renderingComponentGraphId = getGraphNodeId(
      "component",
      renderingComponentId
    );
    // Ensure the rendering component node actually exists in the graph before proceeding
    if (!addedNodeIds.has(renderingComponentGraphId)) {
      outputChannel.appendLine(
        `[Graph] Skipping rendered component resolution for ${rendered.name} because rendering component ${renderingComponentGraphId} is not added (likely due to depth).`
      );
      return;
    }

    outputChannel.appendLine(
      `[Graph Resolve] Resolving rendered component: ${rendered.name} rendered by ${renderingComponentData.name}`
    );

    // 1. Find the import statement for the rendered component name
    const importInfo = findImportInfo(
      rendered.name,
      parentFileNodeData.imports
    );

    let targetComponentId: string | undefined; // Indexer ID (filePath:Name)
    let targetComponentName: string | undefined;
    let targetFilePath: string | undefined;

    if (!importInfo) {
      outputChannel.appendLine(
        `[Graph Resolve]   Could not find import for rendered component: ${rendered.name} in ${parentFileNodeData.filePath}. Assuming local.`
      );
      // Attempt to find the component defined in the *same file*
      const localComponent = parentFileNodeData.components.find(
        (c) => c.name === rendered.name
      );
      if (localComponent) {
        targetComponentId = localComponent.id;
        targetComponentName = localComponent.name;
        targetFilePath = parentFileNodeData.filePath;
        outputChannel.appendLine(
          `[Graph Resolve]   Found locally defined component: ${targetComponentName} (${targetComponentId})`
        );
      } else {
        outputChannel.appendLine(
          `[Graph Resolve]   Could not find local component ${rendered.name}. Cannot resolve.`
        );
        return; // Stop if not found locally
      }
    } else {
      outputChannel.appendLine(
        `[Graph Resolve]   Found import for ${rendered.name}: ${JSON.stringify(
          importInfo
        )}`
      );

      // 2. Resolve the imported module path to an absolute file path
      const resolvedPath = resolveImportPath(
        importInfo.moduleSpecifier,
        parentFileNodeData.filePath // Resolve relative to the file doing the import
      );

      if (!resolvedPath) {
        outputChannel.appendLine(
          `[Graph Resolve]   Could not resolve import path: ${importInfo.moduleSpecifier} from ${parentFileNodeData.filePath}. Treating as external/unresolved.`
        );
        // Optional: Create an external dependency node? For now, just skip.
        return;
      }

      outputChannel.appendLine(
        `[Graph Resolve]   Resolved import path: ${importInfo.moduleSpecifier} -> ${resolvedPath}`
      );

      // 3. Find the target component definition in the resolved file
      let targetFileNodeData = indexerService
        .getIndexedData()
        .get(resolvedPath);
      if (!targetFileNodeData) {
        outputChannel.appendLine(
          `[Graph Resolve]   Target file for import ${resolvedPath} not indexed, parsing.`
        );
        // Use try-catch as parsing might fail
        try {
          const parsedFileNode = indexerService.parseFile(resolvedPath);
          if (!parsedFileNode) {
            outputChannel.appendLine(
              `[Graph Resolve]   Failed to parse target file: ${resolvedPath}`
            );
            return; // Cannot proceed if target file parsing fails
          }
          targetFileNodeData = parsedFileNode; // Assign the successfully parsed node
          // IMPORTANT: If parsing happens here, we also need to add the File Node (as parent)
          // to the graph if it's not already there.
          // Use processFileNode which handles adding the node if needed
          outputChannel.appendLine(
            `[Graph Resolve]     Adding potentially new file node for ${resolvedPath} at depth ${
              renderingComponentDepth + 1
            }`
          );
          processFileNode(targetFileNodeData, renderingComponentDepth + 1); // Add file node at next depth
        } catch (error: any) {
          outputChannel.appendLine(
            `[Graph Resolve]   Error parsing target file ${resolvedPath}: ${error.message}`
          );
          return;
        }
      } else {
        // Ensure the file node exists in the graph if found in index but not processed yet
        const targetFileGraphId = getGraphNodeId("file", resolvedPath);
        if (!addedNodeIds.has(targetFileGraphId)) {
          outputChannel.appendLine(
            `[Graph Resolve]   Target file ${resolvedPath} found in index but not added to graph yet. Adding now.`
          );
          // Use processFileNode which handles adding the node if needed
          processFileNode(targetFileNodeData, renderingComponentDepth + 1);
        }
      }

      // Find the component in the target file
      const componentNameToCheck = importInfo.isDefault
        ? targetFileNodeData.components.find((c) => c.exported)?.name // Find *any* exported component for default (approximation)
        : importInfo.importedName;

      const targetComponent = componentNameToCheck
        ? targetFileNodeData.components.find(
            (c) => c.name === componentNameToCheck
          )
        : undefined;

      // --- START: Improved Logging for Component Finding ---
      if (!targetComponent) {
        outputChannel.appendLine(
          `[Graph Resolve]   Could not find exported component matching '${componentNameToCheck}' in ${resolvedPath}. Searched for ${
            importInfo.isDefault
              ? "exported default (approximated)"
              : `'${importInfo.importedName}'`
          }. Available: ${targetFileNodeData.components
            .map((c) => `${c.name}${c.exported ? "(exp)" : ""}`)
            .join(", ")}`
        );
        return;
      }
      // --- END: Improved Logging for Component Finding ---

      targetComponentId = targetComponent.id;
      targetComponentName = targetComponent.name;
      targetFilePath = resolvedPath;
      outputChannel.appendLine(
        `[Graph Resolve]   Found imported component: ${targetComponentName} (${targetComponentId}) in ${targetFilePath}`
      );
    }

    // 4. Queue or link the found component
    if (targetComponentId && targetComponentName && targetFilePath) {
      const targetComponentGraphId = getGraphNodeId(
        "component",
        targetComponentId
      );
      const nextDepth = renderingComponentDepth + 1;

      // Check if the target component is already explored or would exceed depth
      // --- START: Logging Queue Decision ---
      const skipReason = exploredComponentIds.has(targetComponentId)
        ? "already explored"
        : nextDepth > maxDepth
        ? `depth limit exceeded (${nextDepth} > ${maxDepth})`
        : undefined;

      if (!skipReason) {
        outputChannel.appendLine(
          `[Graph Resolve]   Queueing resolved component: ${targetComponentName} at depth ${nextDepth}`
        );
        // Queue the component with the rendering component as the source
        queue.push({
          type: "component",
          componentId: targetComponentId,
          componentName: targetComponentName,
          filePath: targetFilePath,
          depth: nextDepth,
          sourceComponentGraphId: renderingComponentGraphId, // Link from the rendering component
        });
      } else if (addedNodeIds.has(targetComponentGraphId)) {
        // If node exists (added directly from its file or via another render path) but wasn't queued
        // (due to depth/explored), still draw the edge from the *rendering* component.
        outputChannel.appendLine(
          `[Graph Resolve]   Adding edge to existing component node: ${targetComponentName} (rendered by ${renderingComponentData.name}). Reason for not queueing: ${skipReason}`
        );
        addEdge({
          id: `e-${renderingComponentGraphId}-renders-${targetComponentGraphId}`,
          source: renderingComponentGraphId,
          target: targetComponentGraphId,
          animated: true,
          type: "smoothstep",
          style: { stroke: "#00bbff" }, // Style component render edges
        });
      } else {
        // Should not happen often if processFileNode adds nodes correctly
        outputChannel.appendLine(
          `[Graph Resolve]   Not queueing or linking ${targetComponentName}. Reason: ${skipReason}. Target node not added yet.`
        );
      }
      // --- END: Logging Queue Decision ---
    }
  }

  function findImportInfo(
    localName: string,
    imports: ImportData[]
  ):
    | { moduleSpecifier: string; importedName: string; isDefault: boolean }
    | undefined {
    for (const imp of imports) {
      // Check default import
      if (imp.defaultImport && imp.defaultImport === localName) {
        return {
          moduleSpecifier: imp.moduleSpecifier,
          importedName: localName, // May need adjustment if default export name is different
          isDefault: true,
        };
      }

      // Check named imports
      if (imp.namedBindings) {
        for (const namedImportOrAlias of imp.namedBindings) {
          // Simple case: import { Button } from './Button' -> localName = 'Button'
          if (namedImportOrAlias === localName) {
            return {
              moduleSpecifier: imp.moduleSpecifier,
              importedName: localName, // The name used in the export statement
              isDefault: false,
            };
          }
          // Alias case: import { Button as Btn } from './Button' -> localName = 'Btn'
          // Need to parse the alias structure if indexer provides it, otherwise this is hard.
          // Assuming indexer stores aliases correctly if `namedBindings` can be objects like { propertyName, name }
          // For now, let's assume `namedBindings` is just an array of strings (local names)
        }
      }

      // Check namespace import (e.g., import * as Material from '@mui/material')
      if (imp.namespaceImport) {
        const namespace = imp.namespaceImport; // e.g., "Material"
        if (localName.startsWith(`${namespace}.`)) {
          const actualExportedName = localName.substring(namespace.length + 1);
          return {
            moduleSpecifier: imp.moduleSpecifier,
            importedName: actualExportedName, // The actual name of the export accessed via the namespace
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
        // if (resolved) {
        //   outputChannel.appendLine(`[Graph Path] Resolved relative '${moduleSpecifier}' -> '${resolved}'`);
        // } else {
        //   outputChannel.appendLine(`[Graph Path] Failed relative '${moduleSpecifier}' from '${currentFilePath}'`);
        // }
        return resolved;
      } catch (error: any) {
        outputChannel.appendLine(
          `[Graph Path] Error resolving relative import '${moduleSpecifier}' from '${currentFilePath}': ${error.message}`
        );
        return undefined;
      }
    }

    // 2. Handle non-relative paths (alias or external/node_modules)
    if (tsConfigCache && tsConfigBasePath && tsConfigCache.compilerOptions) {
      const { baseUrl, paths } = tsConfigCache.compilerOptions;
      const absoluteBaseUrl = baseUrl
        ? path.resolve(tsConfigBasePath, baseUrl)
        : tsConfigBasePath;

      if (paths) {
        // outputChannel.appendLine(`[Graph Path] Attempting alias resolution for: ${moduleSpecifier} using base: ${absoluteBaseUrl}`);
        const matchingAlias = Object.keys(paths)
          .sort((a, b) => b.length - a.length)
          .find((alias) =>
            alias.endsWith("/*")
              ? moduleSpecifier.startsWith(alias.slice(0, -2))
              : moduleSpecifier === alias
          );

        if (matchingAlias) {
          const aliasTargets = paths[matchingAlias];
          if (!aliasTargets || aliasTargets.length === 0) {
            outputChannel.appendLine(
              `[Graph Path] Warning: No path targets found for matched alias '${matchingAlias}' in tsconfig.`
            );
          } else {
            const isStarAlias = matchingAlias.endsWith("/*");
            const aliasPattern = isStarAlias
              ? matchingAlias.slice(0, -2)
              : matchingAlias;
            const remainingPath = isStarAlias
              ? moduleSpecifier.substring(aliasPattern.length)
              : "";

            // outputChannel.appendLine(`[Graph Path] Matched alias: '${matchingAlias}'. Remaining: '${remainingPath}'`);

            for (const targetPathPattern of aliasTargets) {
              const targetBase =
                isStarAlias && targetPathPattern.endsWith("/*")
                  ? targetPathPattern.slice(0, -2)
                  : targetPathPattern;
              const potentialDir = path.resolve(absoluteBaseUrl, targetBase);
              const potentialPath = path.join(potentialDir, remainingPath);

              // outputChannel.appendLine(`[Graph Path] Trying potential alias path: ${potentialPath}`);
              const resolved = resolvePathWithExtensions(
                path.dirname(potentialPath) || ".", // Handle edge case where potentialPath might be root?
                `./${path.basename(potentialPath)}`
              );

              if (resolved) {
                // outputChannel.appendLine(`[Graph Path] Resolved alias '${moduleSpecifier}' to file: ${resolved}`);
                return resolved;
              }
              // else {
              // outputChannel.appendLine(`[Graph Path] Alias check failed for potential: ${potentialPath}`);
              // }
            }
            // outputChannel.appendLine(`[Graph Path] Could not resolve alias '${moduleSpecifier}' via '${matchingAlias}'`);
          }
        }
        // else {
        // outputChannel.appendLine(`[Graph Path] No matching tsconfig alias found for '${moduleSpecifier}'.`);
        // }
      }
      // else {
      //   outputChannel.appendLine(`[Graph Path] No paths defined in tsconfig.`);
      // }
    }
    // else {
    // outputChannel.appendLine(`[Graph Path] Skipping alias check: tsconfig missing/invalid.`);
    // }

    // 3. If not relative and not resolved by alias, assume external/node_modules
    outputChannel.appendLine(
      `[Graph Path] Treating import '${moduleSpecifier}' as external (not relative, alias failed/skipped).`
    );
    return undefined;
  }

  // --- Final Touches ---
  outputChannel.appendLine(
    `[Graph] Build complete. Nodes: ${nodes.length}, Edges: ${edges.length}`
  );
  // console.log("Graph Nodes:", JSON.stringify(nodes, null, 2)); // Detailed logging if needed
  // console.log("Graph Edges:", JSON.stringify(edges, null, 2));

  // Apply root node styling (if it exists and is a file node)
  const rootFileGraphId = getGraphNodeId("file", targetPath);
  const rootNode = nodes.find((n) => n.id === rootFileGraphId);
  if (rootNode && rootNode.data.type === "File") {
    rootNode.style = {
      ...rootNode.style,
      // Override border for root
      borderColor: "rgba(80, 150, 80, 0.9)", // Greenish border for root
      borderWidth: 2,
    };
  }

  return { nodes, edges };
}
