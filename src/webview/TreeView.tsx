// --- Robust VS Code API Singleton --- START
declare const acquireVsCodeApi: () => any;
interface VsCodeApi {
  postMessage(message: any): void;
  // Add other methods you use if necessary
}

// Ensure window object is accessible and add a custom property type
declare global {
  interface Window {
    vscodeApiInstance?: VsCodeApi;
    vscodeApiAcquired?: boolean;
  }
}

console.log(
  "[TreeView Start] Script execution started. Checking window.vscodeApiAcquired:",
  window.vscodeApiAcquired
);

// Acquire API only if it hasn't been acquired anywhere in this context
if (!window.vscodeApiAcquired) {
  console.log(
    "[TreeView Start] window.vscodeApiAcquired is false. Setting flag and attempting acquisition."
  );
  window.vscodeApiAcquired = true; // Set flag immediately
  try {
    console.log("[TreeView Start] Calling acquireVsCodeApi()...");
    window.vscodeApiInstance = acquireVsCodeApi();
    console.log("[TreeView Start] acquireVsCodeApi() succeeded.");
  } catch (error) {
    console.error("[TreeView Start] Error during acquireVsCodeApi():", error);
    // If acquisition fails here, maybe another script already acquired it despite the flag?
    // Or maybe the function throws even on the first call in some race condition?
    // Fallback: Try to use instance if it was set by another script during the error?
    if (!window.vscodeApiInstance) {
      console.error(
        "[TreeView Start] API acquisition failed AND window.vscodeApiInstance is still not set!"
      );
      // Potentially throw or handle this case where API is unavailable
    }
  }
} else {
  console.log(
    "[TreeView Start] window.vscodeApiAcquired was already true. Skipping acquisition."
  );
}

// Assign the instance (now guaranteed to exist) from window to a const
const vscodeApiInstance = window.vscodeApiInstance as VsCodeApi;

// Export the acquired instance
export const vscodeApi: VsCodeApi = vscodeApiInstance ?? {
  postMessage: () => console.error("VSCode API not available!"),
};

if (!vscodeApiInstance) {
  console.error(
    "[TreeView Start] CRITICAL: window.vscodeApiInstance is null or undefined after singleton logic!"
  );
}
// --- Robust VS Code API Singleton --- END

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Node, Edge, NodeProps } from "reactflow";
import "./TreeView.css"; // Import CSS for styling

// --- TreeNodeData Interface Update ---
interface TreeNodeData {
  id: string;
  label: string;
  // New type system based on graph.md
  type:
    | "FileContainer" // Was "File"
    | "LibraryContainer" // Was "LibraryReferenceGroup"
    | "ExportedItem" // Replaces "Component", "Hook"
    | "LibraryImportItem"; // Was "LibraryImport", now a child of LibraryContainer
  // Obsolete types: "UsedComponent", "Reference", "HooksContainer", "ReferencesContainer"

  actualType?: string; // For ExportedItem, e.g., "Component", "Hook", "Function", "Variable"
  children?: TreeNodeData[];
  filePath?: string; // For FileContainer, ExportedItem
  referenceSource?: string; // For LibraryContainer (e.g., package name), LibraryImportItem
  parentNodeId?: string; // Temporary field to help build hierarchy from flat list
  // dependencyType is obsolete
}

interface TreeViewProps {
  nodes: Node[]; // Changed from ReactFlowNode[] to Node[]
  edges: Edge[];
  workspaceRoot?: string; // Added: Optional workspace root path
}

// --- Helper Functions ---

// Function to build the hierarchical structure
const buildTree = (nodes: Node[], edges: Edge[]): TreeNodeData[] => {
  console.log(
    "[TreeView buildTree] Starting with raw graph nodes:",
    nodes.length,
    "nodes,",
    edges.length,
    "edges."
    // nodes.map((n) => ({ // Reduced verbosity
    //   id: n.id,
    //   type: n.type,
    //   data: n.data,
    //   parentNode: n.parentNode,
    // }))
  );
  if (!nodes || nodes.length === 0) {
    console.warn("[TreeView buildTree] No raw nodes provided to buildTree.");
    return [];
  }

  const treeNodeMap = new Map<string, TreeNodeData>();
  const rootTreeNodes: TreeNodeData[] = [];

  // Pass 1: Transform React Flow nodes to initial TreeNodeData items
  console.log(
    "[TreeView buildTree] Pass 1: Transforming raw nodes. Node count:",
    nodes.length
  );
  nodes.forEach((rawNode) => {
    let treeNodeType: TreeNodeData["type"] | undefined;
    let actualType: string | undefined;
    let decisionType: string | undefined;

    // Priority 1: Use data.type if it's a non-empty string
    if (
      typeof rawNode.data?.type === "string" &&
      rawNode.data.type.length > 0
    ) {
      decisionType = rawNode.data.type; // e.g., "File", "Component", "HookUsage"
      // Add a log if rawNode.type (ReactFlow type) was unusual or different
      if (
        rawNode.type &&
        rawNode.type !== "group" &&
        rawNode.type !== decisionType &&
        rawNode.type !== "undefined"
      ) {
        console.log(
          `[TreeView buildTree] Using data.type "${decisionType}" for node ${rawNode.id}. (rawNode.type was "${rawNode.type}")`
        );
      } else if (rawNode.type === "undefined") {
        console.log(
          `[TreeView buildTree] Using data.type "${decisionType}" for node ${rawNode.id}. (rawNode.type was the string 'undefined')`
        );
      }
    }
    // Priority 2: Fallback to rawNode.type if data.type is missing, and rawNode.type is meaningful
    else if (
      typeof rawNode.type === "string" &&
      rawNode.type.length > 0 &&
      rawNode.type !== "group" &&
      rawNode.type !== "undefined"
    ) {
      decisionType = rawNode.type; // This might be a direct semantic type or a ReactFlow node type
      console.log(
        `[TreeView buildTree] Using rawNode.type "${decisionType}" as decisionType for node ${rawNode.id} (data.type was missing or invalid).`
      );
    }
    // Special handling if rawNode.type is "group" and data.type was missing (should ideally not happen if "group" implies data.type)
    else if (rawNode.type === "group") {
      console.warn(
        `[TreeView buildTree] Node ${rawNode.id} is type "group" but rawNode.data.type is missing/invalid. Cannot determine decisionType.`
      );
      return; // Skip
    }
    // If no valid type could be determined
    else {
      console.warn(
        `[TreeView buildTree] Could not determine a valid decisionType for node ${rawNode.id}. rawNode.type: "${rawNode.type}", rawNode.data.type: "${rawNode.data?.type}". Skipping node.`
      );
      return; // Skip this node
    }

    // New switch logic based on the determined decisionType
    switch (decisionType) {
      case "File":
        treeNodeType = "FileContainer";
        break;
      case "LibraryReferenceGroup":
        treeNodeType = "LibraryContainer";
        break;
      case "Component":
      case "Hook":
      case "Function":
      case "Variable":
        treeNodeType = "ExportedItem";
        actualType = decisionType;
        break;
      case "HookUsage": // Handling for HookUsage
        treeNodeType = "ExportedItem"; // Display as an item, parent should be a Component
        actualType = "HookUsage"; // actualType distinguishes it
        // The label for HookUsage nodes is often the hook's name from rawNode.data.label or rawNode.data.hookName
        break;
      case "LibraryImport":
        treeNodeType = "LibraryImportItem";
        actualType = rawNode.data?.label || decisionType;
        break;
      // Fallback cases for direct ReactFlow node types if decisionType ended up being one of these
      // (e.g. if rawNode.data.type was missing but rawNode.type was a ReactFlow type)
      case "FileContainerNode":
        treeNodeType = "FileContainer";
        console.warn(
          `[TreeView buildTree] Node ${rawNode.id} resolved to ReactFlow type "FileContainerNode" as decisionType.`
        );
        break;
      case "LibraryContainerNode":
        treeNodeType = "LibraryContainer";
        console.warn(
          `[TreeView buildTree] Node ${rawNode.id} resolved to ReactFlow type "LibraryContainerNode" as decisionType.`
        );
        break;
      case "ExportedItemNode":
        treeNodeType = "ExportedItem";
        actualType = rawNode.data?.actualType;
        console.warn(
          `[TreeView buildTree] Node ${rawNode.id} resolved to ReactFlow type "ExportedItemNode" as decisionType.`
        );
        break;
      case "LibraryImportNode":
        treeNodeType = "LibraryImportItem";
        actualType = rawNode.data?.actualType;
        console.warn(
          `[TreeView buildTree] Node ${rawNode.id} resolved to ReactFlow type "LibraryImportNode" as decisionType.`
        );
        break;
      default:
        console.warn(
          `[TreeView buildTree] Encountered unhandled DECISION type: "${decisionType}" for node ID ${rawNode.id}. (Derived from rawNode.type: "${rawNode.type}", rawNode.data.type: "${rawNode.data?.type}"). Data:`,
          rawNode.data
        );
        return; // Skip this node
    }

    if (!treeNodeType) {
      // This case should ideally not be reached if the default in switch returns
      console.warn(
        `[TreeView buildTree] treeNodeType is undefined for node ID ${rawNode.id} after switch. DecisionType: ${decisionType}`
      );
      return;
    }

    const treeNode: TreeNodeData = {
      id: rawNode.id,
      label: rawNode.data?.label || rawNode.id,
      type: treeNodeType,
      actualType: actualType,
      filePath: rawNode.data?.filePath,
      referenceSource: rawNode.data?.referenceSource,
      parentNodeId: rawNode.parentNode, // This is crucial
      children: [],
    };
    treeNodeMap.set(treeNode.id, treeNode);
    // console.log(`[TreeView buildTree] Created initial TreeNodeData: id=${treeNode.id}, type=${treeNode.type}, actualType=${treeNode.actualType}, parentNodeId=${treeNode.parentNodeId}`);
  });
  console.log(
    "[TreeView buildTree] Pass 1 complete. treeNodeMap size:",
    treeNodeMap.size
  );
  // Log a sample of created tree nodes if map is not empty
  if (treeNodeMap.size > 0) {
    console.log(
      "[TreeView buildTree] Sample transformed node (first one):",
      treeNodeMap.values().next().value
    );
  }

  // Pass 2: Build hierarchy using parentNodeId
  console.log(
    "[TreeView buildTree] Pass 2: Building hierarchy. Processing nodes in treeNodeMap:",
    treeNodeMap.size
  );
  treeNodeMap.forEach((treeNode) => {
    if (treeNode.parentNodeId && treeNodeMap.has(treeNode.parentNodeId)) {
      const parentTreeNode = treeNodeMap.get(treeNode.parentNodeId);
      parentTreeNode?.children?.push(treeNode);
      // console.log(`[TreeView buildTree] Attached ${treeNode.id} to parent ${treeNode.parentNodeId}`);
    } else {
      rootTreeNodes.push(treeNode);
      if (treeNode.parentNodeId) {
        console.warn(
          `[TreeView buildTree] Node ${treeNode.id} (type ${treeNode.type}, label: ${treeNode.label}) has parentNodeId ${treeNode.parentNodeId} but parent was NOT FOUND in treeNodeMap. Adding as root.`
        );
      } else {
        // console.log(`[TreeView buildTree] Node ${treeNode.id} (type ${treeNode.type}) has no parentNodeId. Adding as root.`);
      }
    }
  });
  console.log(
    "[TreeView buildTree] Pass 2 complete. Root node count:",
    rootTreeNodes.length
  );
  // Log a summary of root nodes
  if (rootTreeNodes.length > 0) {
    console.log(
      "[TreeView buildTree] Summary of root nodes:",
      rootTreeNodes.map((n) => ({
        id: n.id,
        type: n.type,
        label: n.label,
        childrenCount: n.children?.length || 0,
      }))
    );
  }

  // Sorting logic (to be refined)
  const sortTreeNodes = (nodesToSort: TreeNodeData[]) => {
    // Define desired order for top-level and within FileContainers
    const typeOrder: { [key in TreeNodeData["type"]]?: number } = {
      FileContainer: 0,
      ExportedItem: 1, // actualType will differentiate further if needed
      LibraryContainer: 2,
      LibraryImportItem: 3,
    };

    nodesToSort.sort((a, b) => {
      const orderA = typeOrder[a.type] ?? 99;
      const orderB = typeOrder[b.type] ?? 99;

      if (orderA !== orderB) return orderA - orderB;

      // Specific sorting for ExportedItems by actualType if they are at the same level
      if (a.type === "ExportedItem" && b.type === "ExportedItem") {
        const actualTypeOrder: { [key: string]: number } = {
          Component: 0,
          Hook: 1,
          Function: 2,
          Variable: 3,
        };
        const actualOrderA = actualTypeOrder[a.actualType || ""] ?? 99;
        const actualOrderB = actualTypeOrder[b.actualType || ""] ?? 99;
        if (actualOrderA !== actualOrderB) return actualOrderA - actualOrderB;
      }

      return a.label.localeCompare(b.label); // Fallback to label sorting
    });

    nodesToSort.forEach((node) => {
      if (node.children && node.children.length > 0) {
        sortTreeNodes(node.children); // Recursive sort
      }
    });
  };

  sortTreeNodes(rootTreeNodes); // Apply sorting
  console.log(
    "[TreeView buildTree] Final hierarchical tree nodes (after sorting) count:",
    rootTreeNodes.length
    // rootTreeNodes.map((r) => ({ // Reduced verbosity
    //   id: r.id,
    //   label: r.label,
    //   type: r.type,
    //   childrenCount: r.children?.length,
    // }))
  );
  if (rootTreeNodes.length === 0 && nodes.length > 0) {
    console.warn(
      "[TreeView buildTree] buildTree resulted in an empty tree, but received input nodes. Check transformation and hierarchy logic."
    );
  }

  // The old complex multi-pass logic is replaced.
  // Library imports: If LibraryContainerNode in rawAnalysisData already has children that are
  // meant to be LibraryImportItems, they should be transformed in Pass 1 if they have a distinct node type.
  // If they are just data within LibraryContainerNode.data.imports, then the LibraryContainerNode
  // itself would need to create these TreeNodeData children.
  // For now, this simplistic buildTree assumes LibraryImportItems would be separate nodes with a parentNode link.

  return rootTreeNodes;
};

// --- TreeNode Component (Recursive) ---
const TreeNode: React.FC<{
  node: TreeNodeData;
  level: number;
  expandedNodes: Record<string, boolean>;
  onToggle: (nodeId: string) => void;
  // Add props for the new handlers passed from TreeView
  onNodeDoubleClick: (node: TreeNodeData) => void;
  onNodeFindReferencesClick: (node: TreeNodeData) => void;
  workspaceRoot?: string;
}> = ({
  node,
  level,
  expandedNodes,
  onToggle,
  onNodeDoubleClick,
  onNodeFindReferencesClick,
  workspaceRoot,
}) => {
  const isCurrentNodeExpanded = expandedNodes[node.id] ?? false;
  const hasChildren = node.children && node.children.length > 0;

  // Remove the direct VSCode API handlers from TreeNode
  // const handleDoubleClick = useCallback(() => { ... });
  // const handleFindReferencesClick = useCallback((event) => { ... });

  // --- Internal Handlers to call props ---
  const handleInternalDoubleClick = useCallback(() => {
    onNodeDoubleClick(node);
  }, [node, onNodeDoubleClick]);

  const handleInternalFindReferencesClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation(); // Still need to stop propagation here
      onNodeFindReferencesClick(node);
    },
    [node, onNodeFindReferencesClick]
  );

  const handleToggle = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation(); // Prevent toggling parent nodes
      const canToggle =
        hasChildren &&
        (node.type === "FileContainer" ||
          node.type === "LibraryContainer" ||
          (node.type === "ExportedItem" &&
            node.children &&
            node.children.length > 0)); // ExportedItem only if it has children
      // LibraryImportItem is not typically expandable by itself

      if (canToggle) {
        onToggle(node.id);
      }
    },
    [node.id, node.type, hasChildren, onToggle]
  );

  const getIcon = () => {
    const canExpand =
      hasChildren &&
      (node.type === "FileContainer" ||
        node.type === "LibraryContainer" ||
        (node.type === "ExportedItem" &&
          node.children &&
          node.children.length > 0));

    if (canExpand) {
      return (
        <span
          className={`tree-icon expand-collapse ${
            isCurrentNodeExpanded ? "expanded" : "collapsed"
          }`}
        ></span>
      );
    }
    return <span className="tree-icon type-indicator"></span>;
  };

  const getNodeTypeClass = () => {
    let baseClass = "";
    let actualTypeClass = "";

    switch (node.type) {
      case "FileContainer":
        baseClass = "type-file-container"; // Was type-file
        break;
      case "LibraryContainer":
        baseClass = "type-library-container"; // Was type-library-group
        break;
      case "ExportedItem":
        baseClass = "type-exported-item";
        if (node.actualType) {
          actualTypeClass = `actual-type-${node.actualType.toLowerCase()}`;
        }
        // Examples: actual-type-component, actual-type-hook
        break;
      case "LibraryImportItem":
        baseClass = "type-library-import-item"; // Was type-library-import
        break;
      default:
        baseClass = "";
    }
    return `${baseClass} ${actualTypeClass}`.trim();
  };

  // --- Helper to extract file name and relative directory path ---
  const getFileParts = (
    filePath: string | undefined,
    rootPath: string | undefined
  ): { fileName: string; dirPath: string; fullPath: string } => {
    const fullPath = filePath || ""; // Store original full path
    if (!filePath) return { fileName: node.label, dirPath: "", fullPath }; // Fallback

    let displayPath = filePath; // Path used for splitting filename/dirname

    // Normalize rootPath: remove trailing slash if exists, ensure it's not empty
    const normalizedRoot = rootPath?.replace(/\/$/, "");

    // Calculate relative path for display if rootPath is valid and filePath starts with it
    if (normalizedRoot && filePath.startsWith(normalizedRoot)) {
      // Get part after root, ensure leading slash is removed
      let relative = filePath.substring(normalizedRoot.length);
      if (relative.startsWith("/")) {
        relative = relative.substring(1);
      }
      displayPath = relative; // Use the relative path for splitting
    }
    // If rootPath wasn't provided or didn't match, displayPath remains the full filePath

    const parts = displayPath.split("/");
    const fileName = parts.pop() || displayPath; // Take last part or full path if no '/'
    // Construct dirPath from the remaining parts of displayPath
    const dirPath = parts.length > 0 ? parts.join("/") + "/" : ""; // Join remaining parts for dir

    // Return the calculated parts, using fullPath for the title
    return { fileName, dirPath, fullPath };
  };

  const { fileName, dirPath, fullPath } =
    node.type === "FileContainer"
      ? getFileParts(node.filePath, workspaceRoot)
      : {
          fileName: node.label, // Use label for non-files
          dirPath: "",
          // Use referenceSource for hover title on LibGroup/Reference, fallback to label/filePath
          fullPath: node.referenceSource || node.filePath || node.label,
        };
  // --- End Helper ---

  // Determine if the node is clickable for toggling expansion
  const isToggleable =
    hasChildren &&
    (node.type === "FileContainer" ||
      node.type === "LibraryContainer" ||
      (node.type === "ExportedItem" &&
        node.children &&
        node.children.length > 0));
  // LibraryImportItem not usually toggleable

  return (
    <li
      className={`tree-node ${getNodeTypeClass()}`}
      // Use the new internal handler
      onDoubleClick={handleInternalDoubleClick}
    >
      <div
        className={`tree-node-label ${isToggleable ? "clickable" : ""}`}
        onClick={isToggleable ? handleToggle : undefined}
        style={{ paddingLeft: `${level * 18}px` }}
      >
        {getIcon()}

        {/* Show count for parent-like nodes if they have children */}
        {(node.type === "FileContainer" ||
          node.type === "LibraryContainer" ||
          node.type === "ExportedItem") &&
          hasChildren && (
            <span className="child-count">({node.children?.length || 0})</span>
          )}

        {/* Structure for FileContainer nodes */}
        {node.type === "FileContainer" && (
          <>
            {/* File Name (Moved after Icon/Count) */}
            <span
              className="label-text file-name"
              title={fullPath /* Show full path on hover */}
            >
              {fileName}
            </span>
            {/* Directory Path (aligned right) */}
            <span
              className="label-text dir-path"
              title={fullPath /* Show full path on hover */}
            >
              {dirPath}
            </span>
          </>
        )}

        {/* Structure for Non-FileContainer nodes (Moved after Icon/Count) */}
        {node.type !== "FileContainer" && (
          <>
            <span className="label-text" title={fullPath}>
              {/* Add space if count exists for better alignment */}
              {(node.type === "LibraryContainer" ||
                node.type === "ExportedItem") &&
              hasChildren
                ? " "
                : ""}
              {node.label}
              {/* Optionally display actualType for ExportedItem if not clear from label */}
              {node.type === "ExportedItem" && node.actualType && (
                <span className="actual-type-indicator">
                  {" "}
                  ({node.actualType})
                </span>
              )}
            </span>
          </>
        )}

        {/* Find References Button uses the new internal handler */}
        {/* Primarily for ExportedItem, potentially LibraryImportItem if it makes sense */}
        {(node.type === "ExportedItem" || node.type === "LibraryImportItem") &&
          node.filePath && (
            <button
              className="find-references-button"
              title={`Find All References to ${node.label}`}
              onClick={handleInternalFindReferencesClick}
              style={{
                marginLeft: "auto",
                padding: "0 3px",
                cursor: "pointer",
                background: "none",
                border: "none",
                color: "inherit",
                fontSize: "1.2em",
              }}
            >
              &nbsp;⊙ {/* Example icon */}
            </button>
          )}
      </div>
      {hasChildren && isCurrentNodeExpanded && (
        <ul className="tree-node-children">
          {node.children?.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              // Pass the handlers down recursively
              onNodeDoubleClick={onNodeDoubleClick}
              onNodeFindReferencesClick={onNodeFindReferencesClick}
              workspaceRoot={workspaceRoot}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

// --- Helper function to get all expandable node IDs ---
const getAllExpandableNodeIds = (nodes: TreeNodeData[]): string[] => {
  let ids: string[] = [];
  nodes.forEach((node) => {
    const hasChildren = node.children && node.children.length > 0;
    // Define which types are considered expandable if they have children
    const canExpand =
      hasChildren &&
      (node.type === "FileContainer" ||
        node.type === "LibraryContainer" ||
        node.type === "ExportedItem"); // ExportedItem can be expandable if it has children (e.g. nested items in future)
    // LibraryImportItem typically not expandable
    if (canExpand) {
      ids.push(node.id);
      if (node.children) {
        ids = ids.concat(getAllExpandableNodeIds(node.children));
      }
    }
    // Also collect children even if parent is not expandable (e.g., Containers if they existed)
    else if (node.children) {
      ids = ids.concat(getAllExpandableNodeIds(node.children));
    }
  });
  return ids;
};

// --- START: Helper function to extract base symbol name ---
const extractSymbolName = (
  label: string,
  type: TreeNodeData["type"],
  actualType?: string
): string => {
  if (!label) return "";

  if (type === "ExportedItem") {
    // Handle different actualTypes within ExportedItem
    if (actualType === "Hook") {
      const match = label.match(/^Hook:\s*([\w\d_]+)/);
      return match?.[1] ?? label.replace(/^Hook:\s*/, "");
    } else if (actualType === "Component") {
      const match = label.match(/^([\w\d_]+)/);
      return match?.[1] ?? label;
    } else {
      // Default for other ExportedItem actualTypes (e.g., Function, Variable)
      // Assumes label is the name, or might need more specific parsing if prefixed
      return label;
    }
  }

  // For other types (FileContainer, LibraryContainer, LibraryImportItem), assume the label is the name
  return label;
};
// --- END: Helper function to extract base symbol name ---

// --- Main TreeView Component ---
const TreeView: React.FC<TreeViewProps> = ({ nodes, edges, workspaceRoot }) => {
  const treeData = useMemo(() => {
    console.log(
      "[TreeView] Building tree structure with nodes:",
      `(${nodes?.length || 0} nodes)`,
      "edges:",
      `(${edges?.length || 0} edges)`
    );
    const builtTree = buildTree(nodes, edges);
    console.log("[TreeView] Built tree structure:", builtTree); // Log the final structure
    return builtTree;
  }, [nodes, edges]);

  // --- State for Expansion ---
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>(
    {}
  );

  // Effect to set initial expansion state (only top-level FileContainers)
  useEffect(() => {
    const initialExpansion: Record<string, boolean> = {};
    treeData.forEach((node) => {
      if (node.type === "FileContainer") {
        // Expand only top-level files initially
        const hasChildren = node.children && node.children.length > 0;
        if (hasChildren) {
          // Only mark as expandable if it has children
          initialExpansion[node.id] = true;
        }
      }
      // Recursively check children? No, keep initial expansion shallow for performance.
    });
    setExpandedNodes(initialExpansion);
  }, [treeData]); // Re-run when treeData changes

  // --- Handlers for Expansion ---
  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  }, []);

  const expandAll = useCallback(() => {
    const allIds = getAllExpandableNodeIds(treeData);
    const nextState: Record<string, boolean> = {};
    allIds.forEach((id) => {
      nextState[id] = true;
    });
    setExpandedNodes(nextState);
  }, [treeData]);

  const collapseAll = useCallback(
    () => {
      // We can just set to empty object, as default is collapsed
      setExpandedNodes({});
      // Alternatively, explicitly set all known expandable nodes to false:
      // const allIds = getAllExpandableNodeIds(treeData);
      // const nextState: Record<string, boolean> = {};
      // allIds.forEach(id => { nextState[id] = false; });
      // setExpandedNodes(nextState);
    },
    [
      /*treeData*/
    ]
  ); // treeData dependency removed for empty object approach

  // --- VS Code Interaction Handlers --- (Use global vscodeApi)
  const handleNodeDoubleClick = useCallback((node: TreeNodeData) => {
    console.log("[TreeView] Double Clicked:", node);
    if (
      node.type === "FileContainer" ||
      (node.type === "ExportedItem" && node.filePath) || // ExportedItem only if it has a filePath
      (node.type === "LibraryImportItem" && node.filePath) // LibraryImportItem if it has a filePath (e.g. points to a definition)
    ) {
      if (node.filePath) {
        console.log(`[TreeView] Posting openFile: filePath=${node.filePath}`); // Log details
        const verifiedFilePath = node.filePath as string; // Cast to string since we checked
        vscodeApi?.postMessage({
          command: "openFile",
          payload: { filePath: verifiedFilePath },
        });
      } else {
        console.warn(
          "[TreeView] Double Click: Missing filePath for node:",
          node
        ); // Log warning
      }
    } else {
      console.log(
        `[TreeView] Double Click: Node type "${node.type}" is not configured for opening file.`
      );
    }
  }, []);

  const handleNodeFindReferencesClick = useCallback((node: TreeNodeData) => {
    console.log("[TreeView] Find References Clicked:", node); // Log node data
    if (node.type === "ExportedItem") {
      if (node.filePath) {
        const symbolName = extractSymbolName(
          node.label,
          node.type,
          node.actualType
        );
        if (!symbolName) {
          console.warn(
            "[TreeView] Find References: Could not extract symbol name from label:",
            node.label
          );
          return; // Don't proceed if symbol name is empty
        }
        console.log(
          `[TreeView] Posting findReferences: filePath=${node.filePath}, symbolName=${symbolName}`
        ); // Log details
        const verifiedFilePath = node.filePath as string; // Cast to string since we checked
        vscodeApi?.postMessage({
          command: "findReferences",
          payload: { filePath: verifiedFilePath, symbolName: symbolName }, // Use extracted name
        });
      } else {
        console.warn(
          "[TreeView] Find References: Missing filePath for node:",
          node
        ); // Log warning
      }
    } else {
      console.log(
        `[TreeView] Find References: Node type "${node.type}" is not configured for finding references.`
      );
    }
  }, []);

  if (!nodes || nodes.length === 0) {
    return <div className="tree-view-panel empty">No data to display.</div>;
  }

  if (!treeData || treeData.length === 0) {
    console.log(
      "[TreeView] No tree data could be built. Check buildTree function logs."
    ); // Enhanced log
    return (
      <div className="tree-view-panel empty">Could not build tree view.</div>
    );
  }

  return (
    <div className="tree-view-panel">
      {/* Add Collapse/Expand Buttons */}
      <div
        className="tree-view-controls"
        style={{
          padding: "4px 5px",
          borderBottom: "1px solid var(--vscode-editorGroupHeader-tabsBorder)",
          marginBottom: "4px",
        }}
      >
        <button onClick={expandAll} style={{ marginRight: "5px" }}>
          Expand All
        </button>
        <button onClick={collapseAll}>Collapse All</button>
      </div>

      <ul className="tree-view-root">
        {treeData.map((rootNode) => (
          <TreeNode
            key={rootNode.id}
            node={rootNode}
            level={0}
            expandedNodes={expandedNodes}
            onToggle={toggleNode}
            onNodeDoubleClick={handleNodeDoubleClick}
            onNodeFindReferencesClick={handleNodeFindReferencesClick}
            workspaceRoot={workspaceRoot}
          />
        ))}
      </ul>
    </div>
  );
};

export default TreeView;
