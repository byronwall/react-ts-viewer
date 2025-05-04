import React, { useState, useMemo } from "react";
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
  filePath?: string; // For File nodes
  referenceType?: "FileDep" | "LibDep"; // For Reference nodes
  referenceSource?: string; // Original source path for LibDep references or Library Groups
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
      }
    });
  };
  // --- END: Define Sorting Functions First ---

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
        children: [],
      };

      // --- Aggregate Hooks, Used Components, and Library Dependencies ---
      // const itemCounts = new Map<
      //   string,
      //   { type: "Hook" | "UsedComponent"; count: number; originalName: string }
      // >();
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
          // Optionally store source separately if needed later
          // referenceSource: source,
        });
      });
      // --- END: Create Hook Nodes with Source in Label ---
      // --- END: Aggregate Hooks ---

      // Process File Dependencies (as Used Components)
      const fileDepsSource = node.data.fileDependencies || [];
      // --- START: Combine File and Library Dependencies for Used Components ---
      const libraryDepsSource = node.data.libraryDependencies || [];
      const allDepsSource = [...fileDepsSource, ...libraryDepsSource]; // Combine both arrays
      // --- END: Combine File and Library Dependencies for Used Components ---

      // --- START: Aggregate Used Components with Source ---
      const usedCompCounts = new Map<string, number>();
      if (Array.isArray(allDepsSource)) {
        // Iterate over the combined list
        allDepsSource.forEach((dep: any) => {
          // Iterate over the combined list
          const compName = dep?.name;
          if (compName) {
            // const key = `Comp: ${compName}`;
            // const current = itemCounts.get(key) || { type: "UsedComponent", count: 0, originalName: compName };
            // itemCounts.set(key, { ...current, count: current.count + 1 });
            // usedCompCounts.set(
            //   compName,
            //   (usedCompCounts.get(compName) || 0) + 1
            // );
            // --- START: Aggregate Used Components with Source ---
            const source = dep?.source;
            const countKey = source ? `${compName}|${source}` : compName;
            usedCompCounts.set(
              countKey,
              (usedCompCounts.get(countKey) || 0) + 1
            );
            // --- END: Aggregate Used Components with Source ---
          }
        });
      }
      // usedCompCounts.forEach((count, compName) => {
      //   const label = `${compName}${count > 1 ? ` (x${count})` : ""}`;
      //   childrenNodes.push({
      //     id: `${node.id}-usedcomp-${compName.replace(/[^a-zA-Z0-9]/g, "_")}`,
      //     label: label,
      //     type: "UsedComponent",
      //   });
      // });
      // --- START: Create Used Component Nodes with Source in Label ---
      usedCompCounts.forEach((count, countKey) => {
        const [compName, source] = countKey.split("|");
        const countSuffix = count > 1 ? ` (x${count})` : "";
        // Clean up source path for display (remove ~/, etc.)
        const displaySource = source
          ? source.replace(/^~\//, "").replace(/\.(tsx|jsx|js|ts)$/, "") // Basic cleanup
          : undefined;
        const sourceSuffix = displaySource ? ` (@ ${displaySource})` : ""; // Use '@' as separator
        const finalLabel = `${compName}${countSuffix}${sourceSuffix}`;

        // Generate ID based on name and source for uniqueness
        const idSuffix =
          (source ? `${compName}_${source}` : compName) || "unknown_comp"; // Fallback
        const uniqueId = `${node.id}-usedcomp-${idSuffix.replace(
          /[^a-zA-Z0-9]/g,
          "_"
        )}`;

        childrenNodes.push({
          id: uniqueId,
          label: finalLabel,
          type: "UsedComponent",
          // referenceSource: source, // Store original source if needed
        });
      });
      // --- END: Create Used Component Nodes with Source in Label ---
      // --- END: Aggregate Used Components ---

      // Process Library Dependencies (Group them by source) - MOVED TO FILE LEVEL
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
  workspaceRoot?: string;
}> = ({ node, level, workspaceRoot }) => {
  // Default expansion: Files expanded, Components collapsed, Library Groups collapsed
  const initialExpanded = useMemo(() => {
    if (level === 0) return true; // Expand files
    // Keep containers expandable only if they have content (though likely unused now)
    if (node.type.includes("Container"))
      // Keep for safety, though likely unused
      return node.children && node.children.length > 0;
    // Files expanded, everything else collapsed by default
    // return node.type === "File"; // Only expand files initially
    return false; // Collapse all nested levels initially
  }, [node, level]);

  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  const hasChildren = node.children && node.children.length > 0;

  // --- DEBUGGING --- Add console log here (kept commented)
  /*
  console.log(
    `[TreeNode] Rendering node: ${node.label} (ID: ${node.id}), Type: ${node.type}, Level: ${level}, HasChildren: ${hasChildren}, IsExpanded: ${isExpanded}`
  );
  if (hasChildren) {
    console.log(`[TreeNode] Children of ${node.label}:`, node.children);
  }
  */
  // --- END DEBUGGING ---

  const handleToggle = (event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent toggling parent nodes
    // Allow toggle only for types designed to be containers/expandable
    if (
      hasChildren &&
      (node.type === "File" ||
        node.type === "Component" ||
        node.type === "LibraryReferenceGroup" || // Allow toggling Library Group
        node.type.includes("Container")) // Keep for safety
    ) {
      setIsExpanded(!isExpanded);
    }
  };

  const getIcon = () => {
    // Show expand/collapse icon for File, Component, and LibraryReferenceGroup if they have children
    const canExpand =
      hasChildren &&
      (node.type === "File" ||
        node.type === "Component" ||
        node.type === "LibraryReferenceGroup"); // Added LibraryReferenceGroup

    if (canExpand) {
      return (
        <span
          className={`tree-icon expand-collapse ${
            isExpanded ? "expanded" : "collapsed"
          }`}
        ></span>
      );
    }
    // Placeholder for alignment or specific type icon for leaf nodes (Hook, UsedComponent, LibraryImport)
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
      case "UsedComponent": // Added style for UsedComponent
        return "type-used-component";
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
      node.type === "LibraryReferenceGroup"); // Added LibraryReferenceGroup

  return (
    <li className={`tree-node ${getNodeTypeClass()}`}>
      <div
        // Add clickable class only if the node can be toggled
        className={`tree-node-label ${isToggleable ? "clickable" : ""}`}
        // Use onClick only if the node *can* be toggled
        onClick={isToggleable ? handleToggle : undefined}
        style={{
          paddingLeft: `${level * 18}px`, // Indentation handled here
        }}
      >
        {/* Consistent structure: Icon, Count (if applicable), then Label */}
        {getIcon()}

        {/* Show count for Component and LibraryReferenceGroup if they have children */}
        {(node.type === "Component" || node.type === "LibraryReferenceGroup") && // Added LibraryReferenceGroup
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

        {/* Commented out old structure
        // ... old structure ...
        */}
        {/* Show file path only for File nodes (commented out) */}
        {/* {node.type === 'File' && node.filePath && <span className="file-path"> ({node.filePath})</span>} */}
      </div>
      {hasChildren && isExpanded && (
        <ul className="tree-node-children">
          {node.children?.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              workspaceRoot={workspaceRoot}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

// --- Main TreeView Component ---
const TreeView: React.FC<TreeViewProps> = ({ nodes, edges, workspaceRoot }) => {
  // Memoize the tree structure to avoid rebuilding on every render
  const treeData = useMemo(() => {
    console.log(
      "[TreeView] Building tree structure with nodes:",
      // nodes, // Avoid logging potentially large nodes array frequently
      `(${nodes?.length || 0} nodes)`,
      "edges:",
      // edges, // Avoid logging potentially large edges array frequently
      `(${edges?.length || 0} edges)`
    );
    const builtTree = buildTree(nodes, edges);
    console.log("[TreeView] Built tree structure:", builtTree); // Log the final structure
    return builtTree;
    // Add workspaceRoot to dependency array if buildTree logic depends on it (it currently doesn't directly, but getFileParts uses it later)
  }, [nodes, edges /*, workspaceRoot */]); // Keep workspaceRoot out for now unless buildTree itself uses it

  if (!nodes || nodes.length === 0) {
    return (
      <div className="tree-view-panel empty">
        No data received yet. Run analysis.
      </div>
    );
  }

  // Check treeData *after* building it
  if (treeData.length === 0) {
    // Check if there were nodes but the tree is empty (e.g., only non-file/component nodes processed into nothing)
    const hasPotentialData = nodes.some(
      (n) => n.data?.type === "File" || n.data?.type === "Component"
    );
    if (!hasPotentialData && nodes.length > 0) {
      // If input nodes exist but none are Files or Components
      return (
        <div className="tree-view-panel empty">
          Data contains nodes, but no Files or Components to display in the
          tree.
        </div>
      );
    }
    // If there were Files/Components but tree is still empty, it's an error/unexpected case
    return (
      <div className="tree-view-panel empty">
        No hierarchical structure could be built from the provided
        File/Component data. Check console for details.
      </div>
    );
  }

  return (
    <div className="tree-view-panel">
      {/* Removed H4 title, added in App.tsx */}
      <ul className="tree-view-root" style={{ paddingLeft: 0 }}>
        {treeData.map((rootNode) => (
          <TreeNode
            key={rootNode.id}
            node={rootNode}
            level={0}
            workspaceRoot={workspaceRoot} // Pass down workspaceRoot
          />
        ))}
      </ul>
    </div>
  );
};

export default TreeView;
