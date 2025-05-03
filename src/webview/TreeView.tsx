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
    | "ReferencesContainer"; // Added 'UsedComponent'
  children?: TreeNodeData[];
  filePath?: string; // For File nodes
  referenceType?: "FileDep" | "LibDep"; // For Reference nodes
}

interface TreeViewProps {
  nodes: Node[];
  edges: Edge[];
}

// --- Helper Functions ---

// Function to build the hierarchical structure
const buildTree = (nodes: Node[], edges: Edge[]): TreeNodeData[] => {
  const fileMap = new Map<string, TreeNodeData>(); // Map filePath to File TreeNodeData
  const nodeMap = new Map(nodes.map((n) => [n.id, n])); // Faster node lookup
  const componentNodeMap = new Map<string, TreeNodeData>(); // Map component node ID to TreeNodeData

  // Pass 1: Create all File nodes first and map component nodes
  nodes.forEach((node) => {
    // --- DEBUGGING --- (Removing logs)
    // console.log(`[buildTree Pass 1 Loop] Processing node ID: ${node.id}, Type: ${node.type}, Data:`, node.data);
    const filePath = node.data?.filePath;
    // console.log(`  >> Extracted filePath: ${filePath}`);
    // --- END DEBUGGING ---

    // Create File nodes if they don't exist
    if (filePath && !fileMap.has(filePath)) {
      const fileNodeFromList = nodes.find(
        (n) => n.id === filePath && n.type === "FileNode"
      );
      fileMap.set(filePath, {
        id: `file-${filePath}`,
        label:
          fileNodeFromList?.data?.label ||
          filePath.split("/").pop() ||
          filePath,
        type: "File",
        filePath: filePath,
        children: [], // Initialize children
      });
    }

    // If it's a component node (check data.type), create its TreeNodeData and store it
    if (node.data?.type === "Component" && filePath) {
      const componentData: TreeNodeData = {
        id: node.id,
        label: node.data.label || node.id,
        type: "Component",
        children: [],
      };

      // --- Aggregate Hooks and Used Components ---
      const itemCounts = new Map<
        string,
        { type: "Hook" | "UsedComponent"; count: number; originalName: string }
      >();

      // Process Hooks
      const hooksSource = node.data.hooksUsed || [];
      if (Array.isArray(hooksSource)) {
        hooksSource.forEach((hook: any) => {
          const hookName = typeof hook === "string" ? hook : hook?.hookName;
          if (hookName && hookName !== "unknown hook") {
            const key = `Hook: ${hookName}`;
            const current = itemCounts.get(key) || {
              type: "Hook",
              count: 0,
              originalName: hookName,
            };
            itemCounts.set(key, { ...current, count: current.count + 1 });
          }
        });
      }

      // Process File Dependencies (as Used Components)
      const fileDepsSource = node.data.fileDependencies || [];
      if (Array.isArray(fileDepsSource)) {
        fileDepsSource.forEach((dep: any) => {
          const compName = dep?.name;
          if (compName) {
            const key = `Comp: ${compName}`;
            const current = itemCounts.get(key) || {
              type: "UsedComponent",
              count: 0,
              originalName: compName,
            };
            itemCounts.set(key, { ...current, count: current.count + 1 });
          }
        });
      }

      // Process Library Dependencies (filter for potential components)
      const libDepsSource = node.data.libraryDependencies || [];
      if (Array.isArray(libDepsSource)) {
        libDepsSource.forEach((dep: any) => {
          const compName = dep?.name;
          const sourcePath = dep?.source;
          // Heuristic: Include if source starts with ~/, ./, ../ or is a common UI lib pattern
          const isLikelyComponent =
            compName &&
            sourcePath &&
            /^[A-Z]/.test(compName) &&
            (sourcePath.startsWith("~/components") ||
              sourcePath.startsWith(".") ||
              /^(react|@radix-ui)/.test(sourcePath));

          if (isLikelyComponent) {
            const key = `Comp: ${compName}`;
            const current = itemCounts.get(key) || {
              type: "UsedComponent",
              count: 0,
              originalName: compName,
            };
            itemCounts.set(key, { ...current, count: current.count + 1 });
          }
        });
      }

      // Create TreeNodeData for aggregated children
      const childrenNodes: TreeNodeData[] = [];
      itemCounts.forEach((details, key) => {
        const label = `${details.type === "Hook" ? "Hook: " : ""}${
          details.originalName
        }${details.count > 1 ? ` (x${details.count})` : ""}`;
        childrenNodes.push({
          id: `${
            node.id
          }-${details.type.toLowerCase()}-${details.originalName.replace(
            /[^a-zA-Z0-9]/g,
            "_"
          )}`,
          label: label,
          type: details.type, // 'Hook' or 'UsedComponent'
        });
      });

      // --- End Aggregation ---

      if (childrenNodes.length > 0) {
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

  // Pass 3: Sort children recursively
  const sortChildren = (children: TreeNodeData[]) => {
    children.sort((a, b) => {
      // Group types: Containers -> Components -> Hooks/UsedComponents -> References
      const typeOrder = {
        ReferencesContainer: 4,
        Reference: 3,
        Hook: 2,
        UsedComponent: 2, // Same level as Hook
        Component: 1,
        File: 0, // Should not happen inside component normally
        HooksContainer: 4, // Treat like ReferencesContainer if it exists
      };
      const orderA = typeOrder[a.type] ?? 99;
      const orderB = typeOrder[b.type] ?? 99;

      if (orderA !== orderB) return orderA - orderB;

      // Within Hooks/UsedComponents, sort alphabetically
      return a.label.localeCompare(b.label);
    });
    children.forEach((child) => {
      if (child.children) sortChildren(child.children);
    });
  };

  const treeResult = Array.from(fileMap.values());
  // Sort files alphabetically by path, then sort children recursively
  treeResult.sort((a, b) => (a.filePath || "").localeCompare(b.filePath || ""));
  treeResult.forEach((fileNode) => {
    if (fileNode.children) {
      // Sort components within the file first
      fileNode.children.sort((a, b) => a.label.localeCompare(b.label));
      // Then sort the children of each component
      fileNode.children.forEach((compNode) => {
        if (compNode.children) sortChildren(compNode.children);
      });
    }
  });

  return treeResult;
};

// --- TreeNode Component (Recursive) ---
const TreeNode: React.FC<{ node: TreeNodeData; level: number }> = ({
  node,
  level,
}) => {
  // Default expansion: Files expanded, Components collapsed, Containers determined by content
  const initialExpanded = useMemo(() => {
    if (level === 0) return true; // Expand files
    // Expand containers only if they are not empty
    if (node.type.includes("Container"))
      return node.children && node.children.length > 0;
    return false; // Collapse components by default
  }, [node, level]);

  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  const hasChildren = node.children && node.children.length > 0;

  // --- DEBUGGING --- Add console log here
  console.log(
    `[TreeNode] Rendering node: ${node.label} (ID: ${node.id}), Type: ${node.type}, Level: ${level}, HasChildren: ${hasChildren}, IsExpanded: ${isExpanded}`
  );
  if (hasChildren) {
    console.log(`[TreeNode] Children of ${node.label}:`, node.children);
  }
  // --- END DEBUGGING ---

  const handleToggle = (event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent toggling parent nodes
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  const getIcon = () => {
    // Only show expand/collapse icon if there are children (e.g., for Files, Components, Containers)
    if (
      !hasChildren ||
      node.type === "Hook" ||
      node.type === "UsedComponent" ||
      node.type === "Reference"
    ) {
      return <span className="tree-icon type-indicator"></span>; // Placeholder for alignment or specific type icon later
    }
    return (
      <span
        className={`tree-icon expand-collapse ${
          isExpanded ? "expanded" : "collapsed"
        }`}
      ></span>
    );
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
      case "Reference":
        return `type-reference type-${node.referenceType?.toLowerCase()}`;
      case "HooksContainer":
      case "ReferencesContainer":
        return "type-container";
      default:
        return "";
    }
  };

  return (
    <li className={`tree-node ${getNodeTypeClass()}`}>
      <div
        className="tree-node-label"
        // Use onClick only if the node *can* be toggled (has children and isn't a leaf like Hook/UsedComponent/Reference)
        onClick={
          hasChildren &&
          node.type !== "Hook" &&
          node.type !== "UsedComponent" &&
          node.type !== "Reference"
            ? handleToggle
            : undefined
        }
        style={{
          paddingLeft: `${level * 18}px`,
          cursor:
            hasChildren &&
            node.type !== "Hook" &&
            node.type !== "UsedComponent" &&
            node.type !== "Reference"
              ? "pointer"
              : "default",
        }} // Indentation & cursor
      >
        {getIcon()}
        <span className="label-text">{node.label}</span>
        {/* Show child count if children exist */}
        {hasChildren && (
          <span className="child-count"> ({node.children?.length || 0})</span>
        )}
        {/* Show file path only for File nodes */}
        {/* {node.type === 'File' && node.filePath && <span className="file-path"> ({node.filePath})</span>} */}
      </div>
      {hasChildren && isExpanded && (
        <ul className="tree-node-children">
          {node.children?.map((child) => (
            <TreeNode key={child.id} node={child} level={level + 1} />
          ))}
        </ul>
      )}
    </li>
  );
};

// --- Main TreeView Component ---
const TreeView: React.FC<TreeViewProps> = ({ nodes, edges }) => {
  // Memoize the tree structure to avoid rebuilding on every render
  const treeData = useMemo(() => {
    console.log(
      "[TreeView] Building tree structure with nodes:",
      nodes,
      "edges:",
      edges
    );
    const builtTree = buildTree(nodes, edges);
    console.log("[TreeView] Built tree structure:", builtTree);
    return builtTree;
  }, [nodes, edges]);

  if (!nodes || nodes.length === 0) {
    return (
      <div className="tree-view-panel empty">
        No data received yet. Run analysis.
      </div>
    );
  }

  if (treeData.length === 0) {
    return (
      <div className="tree-view-panel empty">
        No hierarchical structure could be built from the data. Check console
        for details.
      </div>
    );
  }

  return (
    <div className="tree-view-panel">
      {/* Removed H4 title, added in App.tsx */}
      <ul className="tree-view-root">
        {treeData.map((rootNode) => (
          <TreeNode key={rootNode.id} node={rootNode} level={0} />
        ))}
      </ul>
    </div>
  );
};

export default TreeView;
