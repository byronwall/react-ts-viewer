import React, { useState, useEffect, useCallback } from "react";
// import { ResponsiveTreeMapCanvas, TreeMapDatum } from "@nivo/treemap"; // TreeMapDatum might not be exported
import {
  ResponsiveTreeMap,
  ComputedNode,
  ComputedNodeWithoutStyles,
} from "@nivo/treemap";
import { NodeCategory, ScopeNode } from "../types"; // Assuming src/types.ts
import { vscodeApi } from "./vscodeApi"; // Import the shared vscodeApi singleton

// Remove the standalone vscode API implementation - use the imported singleton instead
// let vscodeApiInstance: any;
// function getVsCodeApi() {
//   if (!vscodeApiInstance) {
//     // @ts-expect-error - Standard VS Code webview API acquisition
//     vscodeApiInstance = acquireVsCodeApi();
//   }
//   return vscodeApiInstance;
// }
// const vscode = getVsCodeApi();

interface TreemapSettings {
  tile: "squarify" | "binary" | "dice" | "slice" | "sliceDice";
  leavesOnly: boolean;
  innerPadding: number;
  outerPadding: number;
  enableLabel: boolean;
  labelSkipSize: number;
  nodeOpacity: number;
  borderWidth: number;
  // Tooltip settings
  enableTooltip: boolean;
  showTooltipId: boolean;
  showTooltipCategory: boolean;
  showTooltipValue: boolean;
  showTooltipLines: boolean;
  showTooltipSourceSnippet: boolean;
  tooltipSourceSnippetLength: number;
}

interface TreemapDisplayProps {
  data: ScopeNode;
  settings: TreemapSettings;
  // width: number; // Not needed if ResponsiveTreeMapCanvas is used correctly
  // height: number; // Not needed if ResponsiveTreeMapCanvas is used correctly
}

// Define a more specific type for Nivo node data if possible, or use any and cast
// interface NivoNodeExtensions { // This can be removed or kept for other Nivo specific props if needed
//   data: ScopeNode; // We are sure node.data will be our ScopeNode
//   // other Nivo specific properties if needed, like formattedValue, color etc.
// }

// Helper function to find a node by ID in the ScopeNode tree
function findNodeInTree(node: ScopeNode, id: string): ScopeNode | null {
  if (node.id === id) {
    return node;
  }
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeInTree(child, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

const TreemapDisplay: React.FC<TreemapDisplayProps> = ({
  data: initialData,
  settings,
}) => {
  const [isolatedNode, setIsolatedNode] = useState<ScopeNode | null>(null);
  const [isolationPath, setIsolationPath] = useState<ScopeNode[]>([]);

  const handleNodeClick = (
    node: ComputedNode<ScopeNode>,
    event: React.MouseEvent
  ) => {
    const clickedNodeId = node.data.id; // Get ID from Nivo's node data

    // Use event.metaKey for Command key on macOS, event.ctrlKey for Control key on Windows/Linux
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault(); // Prevent default browser behavior for CMD/CTRL+click
      const fullNode = findNodeInTree(initialData, clickedNodeId);
      if (fullNode) {
        setIsolatedNode(fullNode);
        setIsolationPath((prevPath) => [...prevPath, fullNode]);
      } else {
        // Fallback or error: Node not found in initialData, though this should ideally not happen.
        // This could happen if node.data.id is not an ID that exists in initialData.
        // For safety, we could log an error or handle it gracefully.
        // As a fallback, use node.data directly, knowing it might lack children.
        console.warn(
          `Node with id "${clickedNodeId}" not found in initialData tree.`
        );
        setIsolatedNode(node.data as ScopeNode); // Potentially problematic
        setIsolationPath((prevPath) => [...prevPath, node.data as ScopeNode]); // Potentially problematic
      }
    } else {
      // Original click behavior: reveal code
      // We can use node.data here as it should contain loc and id for revealCode.
      const scopeNodeForReveal = node.data;
      if (scopeNodeForReveal.loc && scopeNodeForReveal.id) {
        const idParts = scopeNodeForReveal.id.split(":");
        const filePath =
          idParts.length > 1 ? idParts.slice(0, -1).join(":") : idParts[0];
        vscodeApi.postMessage({
          command: "revealCode",
          filePath: filePath,
          loc: scopeNodeForReveal.loc,
        });
      }
    }
  };

  const resetIsolation = useCallback(() => {
    setIsolatedNode(null);
    setIsolationPath([]);
  }, []);

  const goUpOneLevel = useCallback(() => {
    setIsolationPath((prevPath) => {
      if (prevPath.length === 0) {
        return []; // Return current path to avoid re-render if already empty or new empty path
      }
      const newPath = prevPath.slice(0, -1);
      if (newPath.length === 0) {
        setIsolatedNode(null);
      } else {
        // If newPath is not empty, its last element is a valid ScopeNode.
        // isolationPath is typed as ScopeNode[], so newPath is also ScopeNode[].
        // Accessing the last element of a non-empty ScopeNode[] will yield a ScopeNode.
        const potentialParentNode = newPath[newPath.length - 1];
        if (potentialParentNode !== undefined) {
          setIsolatedNode(potentialParentNode);
        } else {
          // This case should ideally not be reached if newPath is non-empty
          // and contains only ScopeNodes. Setting to null for type safety.
          setIsolatedNode(null);
        }
      }
      return newPath;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Use event.metaKey for Command key on macOS, event.ctrlKey for Control key on Windows/Linux
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key === "ArrowUp"
      ) {
        event.preventDefault();
        goUpOneLevel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [goUpOneLevel]);

  const displayData = isolatedNode || initialData;

  // Basic color scale based on category - extend as needed
  const categoryColors: Record<NodeCategory, string> = {
    [NodeCategory.Program]: "#1f77b4",
    [NodeCategory.Module]: "#aec7e8",
    [NodeCategory.Class]: "#ff7f0e",
    [NodeCategory.Function]: "#ffbb78",
    [NodeCategory.ArrowFunction]: "#2ca02c",
    [NodeCategory.Block]: "#98df8a",
    [NodeCategory.ControlFlow]: "#d62728",
    [NodeCategory.Variable]: "#ff9896",
    [NodeCategory.Call]: "#9467bd",
    [NodeCategory.ReactComponent]: "#c5b0d5",
    [NodeCategory.ReactHook]: "#8c564b",
    [NodeCategory.JSX]: "#c49c94",
    [NodeCategory.Other]: "#7f7f7f",
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {(isolatedNode || isolationPath.length > 0) && (
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            zIndex: 10,
            display: "flex",
            gap: "5px",
          }}
        >
          {isolatedNode && <button onClick={resetIsolation}>Reset Zoom</button>}
          {isolationPath.length > 0 && (
            <button onClick={goUpOneLevel}>Up One Level</button>
          )}
        </div>
      )}
      <ResponsiveTreeMap
        data={displayData}
        identity="id"
        value="value"
        valueFormat=".02s"
        margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
        labelTextColor={{
          from: "color",
          modifiers: [["darker", 2]],
        }}
        parentLabel={(
          node: Omit<ComputedNodeWithoutStyles<ScopeNode>, "parentLabel">
        ) =>
          `${node.data.category} [${node.data.loc.start.line}-${node.data.loc.end.line}]`
        }
        colors={(nodeWithData: ComputedNodeWithoutStyles<ScopeNode>) => {
          const category = nodeWithData.data.category;
          return categoryColors[category] || categoryColors[NodeCategory.Other];
        }}
        borderColor={{
          from: "color",
          modifiers: [["darker", 0.8]],
        }}
        onClick={(node, event) =>
          handleNodeClick(node, event as React.MouseEvent)
        }
        tooltip={
          settings.enableTooltip
            ? ({ node }: { node: ComputedNode<ScopeNode> }) => {
                const scopeNode = node.data;
                const snippetLength = Math.max(
                  0,
                  settings.tooltipSourceSnippetLength
                );
                return (
                  <div
                    style={{
                      padding: "8px 12px",
                      background: "white",
                      color: "#333",
                      border: "1px solid #ccc",
                      borderRadius: "3px",
                      fontSize: "12px",
                      maxWidth: "400px",
                      boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
                    }}
                  >
                    {settings.showTooltipId && (
                      <>
                        <strong>{scopeNode.id.split(":").pop()}</strong>
                        {settings.showTooltipCategory &&
                          ` (${scopeNode.category})`}
                        <br />
                      </>
                    )}
                    {!settings.showTooltipId &&
                      settings.showTooltipCategory && (
                        <>
                          <strong>{scopeNode.category}</strong>
                          <br />
                        </>
                      )}
                    {settings.showTooltipValue && (
                      <>
                        Value: {node.formattedValue} ({scopeNode.value} chars)
                        <br />
                      </>
                    )}
                    {settings.showTooltipLines && (
                      <>
                        Lines: {scopeNode.loc.start.line} -{" "}
                        {scopeNode.loc.end.line}
                        <br />
                      </>
                    )}
                    {settings.showTooltipSourceSnippet && scopeNode.source && (
                      <>
                        <div
                          style={{
                            marginTop: "5px",
                            paddingTop: "5px",
                            borderTop: "1px solid #eee",
                          }}
                        >
                          Source snippet (first {snippetLength} chars):
                        </div>
                        <pre
                          style={{
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                            maxHeight: "100px",
                            overflowY: "auto",
                            background: "#f0f0f0",
                            padding: "5px",
                            marginTop: "3px",
                          }}
                        >
                          {scopeNode.source.substring(0, snippetLength)}
                          {scopeNode.source.length > snippetLength ? "..." : ""}
                        </pre>
                      </>
                    )}
                  </div>
                );
              }
            : (node) => null
        }
        isInteractive={true}
        animate={false}
        tile={settings.tile}
        leavesOnly={settings.leavesOnly}
        innerPadding={settings.innerPadding}
        outerPadding={settings.outerPadding}
        enableLabel={settings.enableLabel}
        labelSkipSize={settings.labelSkipSize}
        nodeOpacity={settings.nodeOpacity}
        borderWidth={settings.borderWidth}
      />
    </div>
  );
};

export default TreemapDisplay;
