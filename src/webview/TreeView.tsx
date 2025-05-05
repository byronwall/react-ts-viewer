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
import { Node, Edge } from "reactflow";
import "./TreeView.css"; // Import CSS for styling

// Interface for the structured tree data
interface TreeNodeData {
  id: string;
  label: string;
  type:
    | "File"
    | "Component"
    | "Hook"
    | "UsedComponent"
    | "Reference"
    | "HooksContainer"
    | "ReferencesContainer"
    | "LibraryReferenceGroup"
    | "LibraryImport";
  children?: TreeNodeData[];
  filePath?: string; // For File nodes, AND NOW for Component, Hook, UsedComponent
  referenceType?: "FileDep" | "LibDep"; // For Reference nodes
  referenceSource?: string; // Original source path for LibDep references or Library Groups
  dependencyType?: "internal" | "external"; // Added for UsedComponent
}

interface TreeViewProps {
  nodes: Node[];
  edges: Edge[];
  workspaceRoot?: string; // Added: Optional workspace root path
}

// --- Helper Functions ---

// Function to build the hierarchical structure
const buildTree = (nodes: Node[], edges: Edge[]): TreeNodeData[] => {
  const fileMap = new Map<string, TreeNodeData>();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const componentNodeMap = new Map<string, TreeNodeData>();
  // --- START: Add Map for File-Level Library Dependencies ---
  const fileLibraryDeps = new Map<string, Map<string, Set<string>>>(); // Map<filePath, Map<source, Set<importName>>>
  // --- END: Add Map for File-Level Library Dependencies ---

  // --- START: Define Sorting Functions First ---
  // Internal sorter for component children (Hooks -> Used -> LibGroups)
  const sortChildrenInternal = (children: TreeNodeData[]) => {
    children.sort((a, b) => {
      const typeOrder: { [key in TreeNodeData["type"]]?: number } = {
        Hook: 0,
        UsedComponent: 1,
        LibraryReferenceGroup: 2,
        LibraryImport: 3,
        Component: 90,
        Reference: 91,
        HooksContainer: 92,
        ReferencesContainer: 93,
        File: 99,
      };
      const orderA = typeOrder[a.type] ?? 99;
      const orderB = typeOrder[b.type] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.label.localeCompare(b.label);
    });
    children.forEach((child) => {
      if (child.type === "LibraryReferenceGroup" && child.children) {
        sortChildrenInternal(child.children);
      }
    });
  };

  // Sorter for top-level (File nodes) and their direct children (Components & LibGroups)
  const sortTopLevelAndComponents = (nodesToSort: TreeNodeData[]) => {
    nodesToSort.sort((a, b) => {
      if (a.type === "File" && b.type !== "File") return -1;
      if (a.type !== "File" && b.type === "File") return 1;
      if (a.type === "File" && b.type === "File") {
        return (a.filePath || "").localeCompare(b.filePath || "");
      }
      // --- START: Update Sorting for File Children ---
      const typeOrder: { [key in TreeNodeData["type"]]?: number } = {
        Component: 0,
        LibraryReferenceGroup: 1,
        // Add other potential direct file children types here if needed
        Hook: 90, // Keep other types lower priority
        UsedComponent: 91,
        LibraryImport: 92,
        Reference: 93,
        HooksContainer: 94,
        ReferencesContainer: 95,
        File: 99,
      };
      const orderA = typeOrder[a.type] ?? 99;
      const orderB = typeOrder[b.type] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      // --- END: Update Sorting for File Children ---

      // Sort Components alphabetically by label
      if (a.type === "Component" && b.type === "Component") {
        return a.label.localeCompare(b.label);
      }
      // Sort Library Groups alphabetically by source (label)
      if (
        a.type === "LibraryReferenceGroup" &&
        b.type === "LibraryReferenceGroup"
      ) {
        return a.label.localeCompare(b.label); // Label is the source name
      }
      // Fallback sort by label for any other types
      return a.label.localeCompare(b.label);
    });
    nodesToSort.forEach((node) => {
      if (node.children) {
        if (node.type === "File") {
          // Sort children of File nodes (Components, LibraryGroups)
          sortTopLevelAndComponents(node.children);
        } else if (node.type === "Component") {
          // Sort children of Component nodes (Hooks, UsedComponents)
          // Library groups are no longer here
          sortChildrenInternal(node.children);
        } else if (node.type === "LibraryReferenceGroup") {
          // Sort children of Library Group nodes (LibraryImports)
          sortChildrenInternal(node.children); // Use internal sorter for imports
        }
        // No need to sort Component children here, done during creation
        // --- START: Add sorting for children of potentially added containers ---
        // else if (node.type === "HooksContainer" || node.type === "ReferencesContainer") {
        //   sortChildrenInternal(node.children);
        // }
        // --- END: Add sorting for children of potentially added containers ---
      }
    });
  };
  // --- END: Define Sorting Functions First ---

  // --- Helper to check if a path is internal ---
  const isInternalPath = (path: string | undefined): boolean => {
    if (!path) return false;
    // Simple check: starts with ./ ../ / or @/
    return (
      path.startsWith(".") || path.startsWith("/") || path.startsWith("@/")
    );
    // TODO: Potentially make this more robust using tsconfig aliases or workspace root
  };

  // Pass 1: Create File nodes and Component nodes with aggregated children
  nodes.forEach((node) => {
    // --- DEBUGGING --- (Removing logs)
    // console.log(`[buildTree Pass 1 Loop] Processing node ID: ${node.id}, Type: ${node.type}, Data:`, node.data);
    const filePath = node.data?.filePath;
    // console.log(`  >> Extracted filePath: ${filePath}`);
    // --- END DEBUGGING ---

    // Create File nodes if they don't exist
    if (filePath && !fileMap.has(filePath)) {
      const fileNodeFromList = nodes.find(
        // Find the actual File node from the input `nodes` list
        // Using `filePath` as a key is risky if multiple nodes share it
        // Let's find the node with matching filePath AND correct data.type
        (n) => n.data?.filePath === filePath && n.data?.type === "File"
      );
      // Use the found file node's data if available, otherwise fallback
      const fileLabel =
        fileNodeFromList?.data?.label || filePath.split("/").pop() || filePath;
      const fileNodeData: TreeNodeData = {
        id: `file-${filePath}`,
        label: fileLabel,
        type: "File",
        filePath: filePath,
        children: [], // Initialize children
      };

      // --- START: Remove Aggregated Library Dependencies from File Level ---
      // Removed code block that added LibRefs directly to File node children
      // Library dependencies will be added after processing all components
      // --- END: Remove Aggregated Library Dependencies from File Level ---

      fileMap.set(filePath, fileNodeData);
    }

    // Process Component nodes
    if (node.data?.type === "Component" && filePath) {
      const componentData: TreeNodeData = {
        id: node.id,
        label: node.data.label || node.id,
        type: "Component",
        filePath: filePath, // Add filePath for component
        children: [],
      };
      // Add logging for component creation
      console.log(
        `[buildTree] Created Component node: ${componentData.label}, filePath: ${componentData.filePath}`
      );

      // --- Aggregate Hooks, Used Components, and Library Dependencies ---
      const childrenNodes: TreeNodeData[] = []; // To hold Hooks, UsedComponents, and Library Groups

      // Process Hooks
      const hooksSource = node.data.hooksUsed || [];
      // --- START: Aggregate Hooks with Source ---
      const hookCounts = new Map<string, number>();
      if (Array.isArray(hooksSource)) {
        hooksSource.forEach((hook: any) => {
          const hookName = typeof hook === "string" ? hook : hook?.hookName;
          if (hookName && hookName !== "unknown hook") {
            // Generate a key that includes the source if available, otherwise just the name
            // We'll store the source separately for label generation
            // hookCounts.set(hookName, (hookCounts.get(hookName) || 0) + 1);
            // --- START: Aggregate Hooks with Source ---
            const source = typeof hook === "object" ? hook?.source : undefined;
            // Use a combined key for counting to handle hooks with the same name but different sources (if possible)
            const countKey = source ? `${hookName}|${source}` : hookName;
            hookCounts.set(countKey, (hookCounts.get(countKey) || 0) + 1);
            // --- END: Aggregate Hooks with Source ---
          }
        });
      }
      // hookCounts.forEach((count, hookName) => {
      //   const label = `Hook: ${hookName}${count > 1 ? ` (x${count})` : ""}`;
      //   childrenNodes.push({
      //     id: `${node.id}-hook-${hookName.replace(/[^a-zA-Z0-9]/g, "_")}`,
      //     label: label,
      //     type: "Hook",
      //   });
      // });
      // --- START: Create Hook Nodes with Source in Label ---
      hookCounts.forEach((count, countKey) => {
        const [hookName, source] = countKey.split("|"); // Source will be undefined if not present in key
        const baseLabel = `Hook: ${hookName}`;
        const countSuffix = count > 1 ? ` (x${count})` : "";
        // Append source only if it exists
        const sourceSuffix = source ? ` (${source})` : "";
        const finalLabel = `${baseLabel}${countSuffix}${sourceSuffix}`;

        // Generate ID based on name and source for uniqueness
        const idSuffix =
          (source ? `${hookName}_${source}` : hookName) || "unknown_hook"; // Fallback
        const uniqueId = `${node.id}-hook-${idSuffix.replace(
          /[^a-zA-Z0-9]/g,
          "_"
        )}`;

        childrenNodes.push({
          id: uniqueId,
          label: finalLabel,
          type: "Hook",
          filePath: filePath, // Add parent component's filePath
          // Optionally store source separately if needed later
          // referenceSource: source,
        });
        // Add logging for hook creation
        console.log(
          `[buildTree] Created Hook node: ${finalLabel}, filePath: ${filePath}`
        );
      });
      // --- END: Create Hook Nodes with Source in Label ---
      // --- END: Aggregate Hooks ---

      // --- START: Separate Processing for File and Library Dependencies ---
      const fileDepsSource = node.data.fileDependencies || [];
      const libraryDepsSource = node.data.libraryDependencies || [];

      // --- Process File Dependencies (Internal Used Components) ---
      const internalCompCounts = new Map<
        string,
        { count: number; source?: string }
      >();
      if (Array.isArray(fileDepsSource)) {
        fileDepsSource.forEach((dep: any) => {
          const compName = dep?.name;
          const source = dep?.source;
          if (compName && isInternalPath(source)) {
            // Check if internal
            const countKey = source ? `${compName}|${source}` : compName;
            const current = internalCompCounts.get(countKey) || {
              count: 0,
              source,
            };
            internalCompCounts.set(countKey, {
              ...current,
              count: current.count + 1,
            });
          }
          // We could potentially handle non-internal fileDeps here too if needed
        });
      }
      internalCompCounts.forEach((data, countKey) => {
        const [compName] = countKey.split("|");
        const { count, source } = data;
        const countSuffix = count > 1 ? ` (x${count})` : "";
        const displaySource = source
          ? source.replace(/^~\//, "").replace(/\.(tsx|jsx|js|ts)$/, "")
          : undefined;
        const sourceSuffix = displaySource ? ` (@ ${displaySource})` : "";
        const finalLabel = `${compName}${countSuffix}${sourceSuffix}`;
        const idSuffix =
          (source ? `${compName}_${source}` : compName) || "unknown_comp";
        const uniqueId = `${node.id}-usedcomp-int-${idSuffix.replace(
          /[^a-zA-Z0-9]/g,
          "_"
        )}`;

        childrenNodes.push({
          id: uniqueId,
          label: finalLabel,
          type: "UsedComponent",
          dependencyType: "internal", // Mark as internal
          referenceSource: source, // Store original source if needed
          filePath: filePath, // Add parent component's filePath
        });
        // Add logging for internal used component creation
        console.log(
          `[buildTree] Created Internal UsedComponent node: ${finalLabel}, filePath: ${filePath}`
        );
      });

      // --- Process Library Dependencies (External Used Components) ---
      // Also include any file deps that were NOT internal
      const externalCompCounts = new Map<
        string,
        { count: number; source?: string }
      >();
      // Process remaining file deps
      if (Array.isArray(fileDepsSource)) {
        fileDepsSource.forEach((dep: any) => {
          const compName = dep?.name;
          const source = dep?.source;
          if (compName && !isInternalPath(source)) {
            // Check if NOT internal
            const countKey = source ? `${compName}|${source}` : compName;
            const current = externalCompCounts.get(countKey) || {
              count: 0,
              source,
            };
            externalCompCounts.set(countKey, {
              ...current,
              count: current.count + 1,
            });
          }
        });
      }
      // Process library deps
      if (Array.isArray(libraryDepsSource)) {
        libraryDepsSource.forEach((dep: any) => {
          const compName = dep?.name;
          const source = dep?.source;
          if (compName) {
            // Assume all library deps are external
            const countKey = source ? `${compName}|${source}` : compName;
            const current = externalCompCounts.get(countKey) || {
              count: 0,
              source,
            };
            externalCompCounts.set(countKey, {
              ...current,
              count: current.count + 1,
            });
          }
        });
      }
      externalCompCounts.forEach((data, countKey) => {
        const [compName] = countKey.split("|");
        const { count, source } = data;
        const countSuffix = count > 1 ? ` (x${count})` : "";
        // Display source differently? Maybe just the package name?
        const displaySource = source // Simpler display for external
          ? source.split("/")[0] // Often just the package name
          : undefined;
        const sourceSuffix = displaySource ? ` (@ ${displaySource})` : ""; // Keep '@' for now
        const finalLabel = `${compName}${countSuffix}${sourceSuffix}`;
        const idSuffix =
          (source ? `${compName}_${source}` : compName) || "unknown_comp";
        const uniqueId = `${node.id}-usedcomp-ext-${idSuffix.replace(
          /[^a-zA-Z0-9]/g,
          "_"
        )}`;

        childrenNodes.push({
          id: uniqueId,
          label: finalLabel,
          type: "UsedComponent",
          dependencyType: "external", // Mark as external
          referenceSource: source, // Store original source if needed
          filePath: filePath, // Add parent component's filePath
        });
        // Add logging for external used component creation
        console.log(
          `[buildTree] Created External UsedComponent node: ${finalLabel}, filePath: ${filePath}`
        );
      });
      // --- END: Separate Processing ---

      // --- Process Library Dependencies (Group them by source) - MOVED TO FILE LEVEL ---
      // --- START: Restore population of fileLibraryDeps from Component data ---
      const libDepsSource = node.data.libraryDependencies || [];
      if (Array.isArray(libDepsSource)) {
        // Ensure the map exists for this file path
        if (!fileLibraryDeps.has(filePath)) {
          fileLibraryDeps.set(filePath, new Map<string, Set<string>>());
        }
        const currentFileLibDeps = fileLibraryDeps.get(filePath)!;

        libDepsSource.forEach((dep: any) => {
          const source = dep?.source;
          const importName = dep?.name;
          // Ensure source and importName are valid strings before proceeding
          if (
            typeof source === "string" &&
            source.length > 0 &&
            typeof importName === "string" &&
            importName.length > 0
          ) {
            // Add the import to the set for this source in the file-level map
            if (!currentFileLibDeps.has(source)) {
              currentFileLibDeps.set(source, new Set<string>());
            }
            currentFileLibDeps.get(source)?.add(importName);
          } else {
            // Optional logging for invalid deps
            // console.warn(`[buildTree] Skipping library dependency due to missing source or name:`, dep);
          }
        });
      }
      // --- END: Restore population of fileLibraryDeps from Component data ---

      // Create TreeNodeData for aggregated children (Old logic removed)
      // const childrenNodes: TreeNodeData[] = [];
      // itemCounts.forEach((details, key) => { ... }); // Removed this aggregation method

      // --- End Aggregation ---

      if (childrenNodes.length > 0) {
        // Now sortChildrenInternal is defined before this call
        sortChildrenInternal(childrenNodes);
        componentData.children?.push(...childrenNodes);
        console.log(
          `[buildTree Aggregated] Added ${childrenNodes.length} aggregated nodes to children of ${componentData.id}`
        );
      }

      componentNodeMap.set(node.id, componentData);

      // Add this component to its parent file node
      const parentFileNode = fileMap.get(filePath);
      // --- DEBUGGING --- (Removed previous block)
      if (parentFileNode) {
        parentFileNode.children?.push(componentData);
      } else {
        // console.warn(`[buildTree Pass 1] Could not find parent file node in map for ${node.id} using filePath: ${filePath}`);
      }
      // --- END DEBUGGING ---
    }
  });

  // Pass 2: Add References using edges, using the componentNodeMap built in Pass 1
  // --- START: Keep Pass 2 commented out as edges are not used for this tree structure ---
  /*
  edges.forEach((edge) => {
    const sourceComponentNode = componentNodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    if (sourceComponentNode && targetNode) {
      const isFileDep =
        targetNode.type === "FileNode" || targetNode.data?.type === "FileDep";
      const isLibDep =
        targetNode.type === "DependencyNode" ||
        targetNode.data?.type === "LibDep";

      if (isFileDep || isLibDep) {
        let referencesContainer = sourceComponentNode.children?.find(
          (c) => c.type === "ReferencesContainer"
        );
        if (!referencesContainer) {
          referencesContainer = {
            id: `${sourceComponentNode.id}-refs-container`,
            label: "References",
            type: "ReferencesContainer",
            children: [],
          };
          sourceComponentNode.children?.push(referencesContainer);
        }

        referencesContainer.children?.push({
          id: edge.id,
          label: targetNode.data.label || targetNode.id,
          type: "Reference",
          referenceType: isFileDep ? "FileDep" : "LibDep",
        });
      }
    }
  });
  */
  // --- END: Keep Pass 2 commented out ---

  // Pass 3: Sort children recursively
  // --- START: Refactor Sorting Logic --- (Definitions moved above)

  // Sorter for top-level (File nodes) and their direct children (Components) - Definition moved above
  // const sortTopLevelAndComponents = ...

  const treeResult = Array.from(fileMap.values());
  // Sort files alphabetically, then sort components within files
  // Now sortTopLevelAndComponents is defined before this call
  sortTopLevelAndComponents(treeResult);

  // --- END: Refactor Sorting Logic ---

  // --- START: Add Pass to Create and Add File-Level Library Groups ---
  fileLibraryDeps.forEach((groupedLibImports, filePath) => {
    const fileNode = fileMap.get(filePath);
    if (!fileNode) return; // Should not happen if logic is correct

    groupedLibImports.forEach((importNames, source) => {
      const sortedImports = Array.from(importNames)
        .filter((name) => name.length > 0)
        .sort();

      if (sortedImports.length > 0) {
        const libraryGroupNode: TreeNodeData = {
          // Use filePath in ID to ensure uniqueness across files
          id: `file-${filePath}-libgroup-${source.replace(/\W/g, "")}`,
          label: source,
          type: "LibraryReferenceGroup",
          referenceSource: source,
          children: sortedImports.map((importName) => ({
            id: `file-${filePath}-lib-${source.replace(
              /\W/g,
              ""
            )}-import-${importName.replace(/\W/g, "")}`,
            label: importName,
            type: "LibraryImport",
          })),
        };
        // Add the library group to the File node's children
        fileNode.children = fileNode.children || []; // Ensure children array exists
        fileNode.children.push(libraryGroupNode);
      }
    });
  });
  // --- END: Add Pass to Create and Add File-Level Library Groups ---

  return treeResult;
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
        (node.type === "File" ||
          node.type === "Component" ||
          node.type === "LibraryReferenceGroup" || // Allow toggling Library Group
          node.type.includes("Container")); // Keep for safety

      if (canToggle) {
        onToggle(node.id);
      }
    },
    [node.id, node.type, hasChildren, onToggle]
  );

  const getIcon = () => {
    const canExpand =
      hasChildren &&
      (node.type === "File" ||
        node.type === "Component" ||
        node.type === "LibraryReferenceGroup");

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
    switch (node.type) {
      case "File":
        return "type-file";
      case "Component":
        return "type-component";
      case "Hook":
        return "type-hook";
      case "UsedComponent":
        // Add specific class based on dependencyType
        if (node.dependencyType === "internal") {
          return "type-used-component type-internal-dep";
        } else if (node.dependencyType === "external") {
          return "type-used-component type-external-dep";
        }
        return "type-used-component"; // Fallback
      case "LibraryReferenceGroup": // Style for the library group
        return "type-library-group";
      case "LibraryImport": // Style for the individual import
        return "type-library-import";
      case "Reference":
        // Add specific class for library dependencies shown at file level (if used elsewhere)
        return `type-reference type-${node.referenceType?.toLowerCase()}`;
      case "HooksContainer": // Keep existing style
      case "ReferencesContainer": // Keep existing style
        return "type-container";
      default:
        return "";
    }
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
    node.type === "File"
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
    (node.type === "File" ||
      node.type === "Component" ||
      node.type === "LibraryReferenceGroup");

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

        {/* Show count for Component and LibraryReferenceGroup if they have children */}
        {(node.type === "Component" || node.type === "LibraryReferenceGroup") &&
          hasChildren && (
            <span className="child-count">({node.children?.length || 0})</span>
          )}

        {/* Structure for File nodes */}
        {node.type === "File" && (
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

        {/* Structure for Non-File nodes (Moved after Icon/Count) */}
        {node.type !== "File" && (
          <>
            <span
              className="label-text"
              // Use fullPath (which might be referenceSource) for title
              title={fullPath}
            >
              {/* Add space if count exists for better alignment */}
              {(node.type === "Component" ||
                node.type === "LibraryReferenceGroup") &&
              hasChildren
                ? " "
                : ""}
              {node.label}
            </span>
            {/* Child count moved to the front */}
          </>
        )}

        {/* Find References Button uses the new internal handler */}
        {(node.type === "Component" ||
          node.type === "Hook" ||
          node.type === "UsedComponent") &&
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
    const canExpand =
      hasChildren &&
      (node.type === "File" ||
        node.type === "Component" ||
        node.type === "LibraryReferenceGroup");
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
  type: TreeNodeData["type"]
): string => {
  if (!label) return ""; // Handle cases where label might be undefined/empty

  if (type === "Hook") {
    // Matches "Hook: ActualHookName" potentially followed by spaces, counts, sources etc.
    const match = label.match(/^Hook:\s*([\w\d_]+)/);
    // Null coalesce: use captured group or fallback to removing prefix
    return match?.[1] ?? label.replace(/^Hook:\s*/, "");
  } else if (type === "UsedComponent" || type === "Component") {
    // Matches the first sequence of word characters (letters, numbers, underscore) at the start.
    // This should capture the component name before counts or source annotations like "(x2)" or "(@ path)"
    const match = label.match(/^([\w\d_]+)/);
    // Null coalesce: use captured group or fallback to original label
    return match?.[1] ?? label;
  }
  // For other types, assume the label is the name
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

  // Effect to set initial expansion state (only top-level files)
  useEffect(() => {
    const initialExpansion: Record<string, boolean> = {};
    treeData.forEach((node) => {
      if (node.type === "File") {
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
    console.log("[TreeView] Double Clicked:", node); // Log node data
    if (
      node.type === "File" ||
      node.type === "Component" ||
      node.type === "Hook" // Hooks can be double-clicked to open file
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
    if (
      node.type === "Component" ||
      node.type === "Hook" ||
      node.type === "UsedComponent"
    ) {
      if (node.filePath) {
        const symbolName = extractSymbolName(node.label, node.type);
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
    console.log("[TreeView] No tree data could be built.");
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
