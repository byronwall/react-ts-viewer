import React, { useState, useEffect, useCallback } from "react";
// import { ResponsiveTreeMapCanvas, TreeMapDatum } from "@nivo/treemap"; // TreeMapDatum might not be exported
import {
  ResponsiveTreeMap,
  ComputedNode,
  ComputedNodeWithoutStyles,
} from "@nivo/treemap";
import { NodeCategory, ScopeNode } from "../types"; // Assuming src/types.ts
import { vscodeApi } from "./vscodeApi"; // Import the shared vscodeApi singleton

// Import for save-svg-as-png if you install it
import { saveSvgAsPng, svgAsPngUri } from "save-svg-as-png";

// Import the new CodeBlock component
import { CodeBlock } from "./CodeBlock";

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

// --- START: Color Palette Definitions ---
const pastelSet: Record<NodeCategory, string> = {
  [NodeCategory.Program]: "#8dd3c7",
  [NodeCategory.Module]: "#ffffb3",
  [NodeCategory.Class]: "#bebada",
  [NodeCategory.Function]: "#fb8072",
  [NodeCategory.ArrowFunction]: "#80b1d3",
  [NodeCategory.Block]: "#fdb462",
  [NodeCategory.ControlFlow]: "#b3de69",
  [NodeCategory.Variable]: "#fccde5",
  [NodeCategory.Call]: "#d9d9d9",
  [NodeCategory.ReactComponent]: "#bc80bd",
  [NodeCategory.ReactHook]: "#ccebc5",
  [NodeCategory.JSX]: "#ffed6f",
  [NodeCategory.Import]: "#c1e7ff",
  [NodeCategory.TypeAlias]: "#ffe8b3",
  [NodeCategory.Interface]: "#f0e68c",
  [NodeCategory.Literal]: "#dcdcdc",
  [NodeCategory.SyntheticGroup]: "#e6e6fa",
  [NodeCategory.ConditionalBlock]: "#b3e2cd",
  [NodeCategory.IfClause]: "#fdcdac",
  [NodeCategory.ElseIfClause]: "#cbd5e8",
  [NodeCategory.ElseClause]: "#f4cae4",
  [NodeCategory.Other]: "#a6cee3",
};

const materialVibrant: Record<NodeCategory, string> = {
  [NodeCategory.Program]: "#2196f3", // blue
  [NodeCategory.Module]: "#03a9f4", // light-blue
  [NodeCategory.Class]: "#009688", // teal
  [NodeCategory.Function]: "#4caf50", // green
  [NodeCategory.ArrowFunction]: "#8bc34a", // light-green
  [NodeCategory.Block]: "#ffc107", // amber
  [NodeCategory.ControlFlow]: "#ff9800", // orange
  [NodeCategory.Variable]: "#ff5722", // deep-orange
  [NodeCategory.Call]: "#9c27b0", // purple
  [NodeCategory.ReactComponent]: "#673ab7", // deep-purple
  [NodeCategory.ReactHook]: "#607d8b", // blue-gray
  [NodeCategory.JSX]: "#795548", // brown
  [NodeCategory.Import]: "#00bcd4", // cyan
  [NodeCategory.TypeAlias]: "#cddc39", // lime
  [NodeCategory.Interface]: "#3f51b5", // indigo
  [NodeCategory.Literal]: "#bdbdbd", // grey
  [NodeCategory.SyntheticGroup]: "#9e9e9e", // grey (slightly darker for groups)
  [NodeCategory.ConditionalBlock]: "#4db6ac",
  [NodeCategory.IfClause]: "#ff8a65",
  [NodeCategory.ElseIfClause]: "#7986cb",
  [NodeCategory.ElseClause]: "#f06292",
  [NodeCategory.Other]: "#e91e63", // pink
};

const okabeIto: Record<NodeCategory, string> = {
  [NodeCategory.Program]: "#000000", // black
  [NodeCategory.Module]: "#0072B2", // blue
  [NodeCategory.Class]: "#E69F00", // orange
  [NodeCategory.Function]: "#009E73", // green
  [NodeCategory.ArrowFunction]: "#F0E442", // yellow
  [NodeCategory.Block]: "#56B4E9", // sky-blue
  [NodeCategory.ControlFlow]: "#D55E00", // vermilion
  [NodeCategory.Variable]: "#CC79A7", // reddish-purple
  [NodeCategory.Call]: "#999999", // med-gray
  [NodeCategory.ReactComponent]: "#66A61E", // olive-green
  [NodeCategory.ReactHook]: "#C44E52", // rose-red
  [NodeCategory.JSX]: "#8172B3", // lavender
  [NodeCategory.Import]: "#0072B2", // blue (shared)
  [NodeCategory.TypeAlias]: "#F0E442", // yellow (shared)
  [NodeCategory.Interface]: "#E69F00", // orange (shared)
  [NodeCategory.Literal]: "#AAAAAA", // light-gray (new)
  [NodeCategory.SyntheticGroup]: "#D55E00", // vermilion (shared, for distinct group)
  [NodeCategory.ConditionalBlock]: "#117733",
  [NodeCategory.IfClause]: "#88CCEE",
  [NodeCategory.ElseIfClause]: "#DDCC77",
  [NodeCategory.ElseClause]: "#AA4499",
  [NodeCategory.Other]: "#5F9EA0", // cadet-blue
};

const neutralAccents: Record<NodeCategory, string> = {
  [NodeCategory.Program]: "#4e4e4e", // dark gray
  [NodeCategory.Module]: "#7a7a7a", // gray
  [NodeCategory.Class]: "#9e9e9e", // mid gray
  [NodeCategory.Function]: "#ff7043", // accent orange
  [NodeCategory.ArrowFunction]: "#ffa726", // lighter orange
  [NodeCategory.Block]: "#bdbdbd", // light gray
  [NodeCategory.ControlFlow]: "#ef5350", // red accent
  [NodeCategory.Variable]: "#26a69a", // teal accent
  [NodeCategory.Call]: "#66bb6a", // green accent
  [NodeCategory.ReactComponent]: "#42a5f5", // blue accent
  [NodeCategory.ReactHook]: "#ab47bc", // purple accent
  [NodeCategory.JSX]: "#8d6e63", // brownish accent
  [NodeCategory.Import]: "#78909c", // blue-grey
  [NodeCategory.TypeAlias]: "#ffee58", // yellow accent
  [NodeCategory.Interface]: "#5c6bc0", // indigo accent
  [NodeCategory.Literal]: "#e0e0e0", // lighter gray
  [NodeCategory.SyntheticGroup]: "#757575", // darker mid-gray for group
  [NodeCategory.ConditionalBlock]: "#7cb342",
  [NodeCategory.IfClause]: "#d4e157",
  [NodeCategory.ElseIfClause]: "#4dd0e1",
  [NodeCategory.ElseClause]: "#ba68c8",
  [NodeCategory.Other]: "#cfd8dc", // very light gray
};

const defaultPalette: Record<NodeCategory, string> = {
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
  [NodeCategory.Import]: "#add8e6", // lightblue
  [NodeCategory.TypeAlias]: "#ffffe0", // lightyellow
  [NodeCategory.Interface]: "#e0ffff", // lightcyan
  [NodeCategory.Literal]: "#d3d3d3", // lightgrey
  [NodeCategory.SyntheticGroup]: "#dda0dd", // plum
  [NodeCategory.ConditionalBlock]: "#6baed6",
  [NodeCategory.IfClause]: "#fd8d3c",
  [NodeCategory.ElseIfClause]: "#74c476",
  [NodeCategory.ElseClause]: "#9e9ac8",
  [NodeCategory.Other]: "#7f7f7f",
};

export const availablePalettes: Record<string, Record<NodeCategory, string>> = {
  Default: defaultPalette,
  "Pastel Set": pastelSet,
  "Material Vibrant": materialVibrant,
  "Okabe-Ito": okabeIto,
  "Neutral with Accents": neutralAccents,
};
// --- END: Color Palette Definitions ---

interface TreemapSettings {
  tile: "squarify" | "binary" | "dice" | "slice" | "sliceDice";
  leavesOnly: boolean;
  innerPadding: number;
  outerPadding: number;
  enableLabel: boolean;
  labelSkipSize: number;
  nodeOpacity: number;
  borderWidth: number;
  colorPalette: string; // Key for availablePalettes
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
  onSettingsChange: (settingName: keyof TreemapSettings, value: any) => void;
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

// Helper function to generate display labels based on node category and PRD notes
const getNodeDisplayLabel = (nodeData: ScopeNode): string => {
  const { category, label, loc } = nodeData;
  const lineRange = loc ? ` [${loc.start.line}-${loc.end.line}]` : "";

  switch (category) {
    case NodeCategory.JSX:
      return `<${label || "JSXElement"}>${lineRange}`;
    case NodeCategory.Function:
      return `${label || "fn"}()${lineRange}`;
    case NodeCategory.ArrowFunction:
      // If label is generic like "ArrowFunction" or empty, use default, else use specific label
      return (
        (label && label !== "ArrowFunction" ? `${label}() => {}` : `() => {}`) +
        lineRange
      );
    case NodeCategory.Variable:
      return `[${label || "var"}]${lineRange}`;
    case NodeCategory.Class:
      return `[${label || "class"}]${lineRange}`;
    case NodeCategory.Import:
      return `[${label || "import"}]${lineRange}`;
    // For exports, we don't have a specific category.
    // The label of the Variable, Function, or Class node would be the export name.
    // We can't easily add an "Export: " prefix here without more info (e.g., nodeData.meta.isExported)
    // So, we rely on the specific category's formatting.
    case NodeCategory.Program:
      return `${label}${lineRange}`; // Usually the filename
    case NodeCategory.Module:
      return `Module: ${label}${lineRange}`;
    case NodeCategory.Block:
      return `Block${lineRange}`; // Blocks usually don't have a meaningful label themselves
    case NodeCategory.ControlFlow:
      return `Control: ${label || category}${lineRange}`;
    case NodeCategory.Call:
      return `Call: ${label || "call"}()${lineRange}`;
    case NodeCategory.ReactComponent:
      return `<${label || "Component"} />${lineRange}`;
    case NodeCategory.ReactHook:
      return `${label || "useHook"}()${lineRange}`;
    case NodeCategory.TypeAlias:
      return `type ${label}${lineRange}`;
    case NodeCategory.Interface:
      return `interface ${label}${lineRange}`;
    case NodeCategory.Literal:
      // For literals, the 'source' might be more descriptive if 'label' is generic
      return `Literal: ${label !== "Literal" ? label : nodeData.source.substring(0, 20)}${lineRange}`;
    case NodeCategory.SyntheticGroup:
      return `Group: ${label}${lineRange}`;
    default:
      return `${category}: ${label}${lineRange}`;
  }
};

const TreemapDisplay: React.FC<TreemapDisplayProps> = ({
  data: initialData,
  settings,
  onSettingsChange,
}) => {
  const [isolatedNode, setIsolatedNode] = useState<ScopeNode | null>(null);
  const [isolationPath, setIsolationPath] = useState<ScopeNode[]>([]);

  // Helper function to extract filename
  const getFileName = (data: ScopeNode) => {
    if (data.category === NodeCategory.Program && data.label) {
      return data.label;
    }
    const idString = data.id || "";
    const idParts = idString.split(":");
    const pathCandidate = idParts[0];

    if (pathCandidate) {
      if (pathCandidate.includes("/")) {
        return pathCandidate.split("/").pop() || pathCandidate;
      }
      return pathCandidate;
    }
    return idString || "Untitled";
  };

  const fileName = getFileName(initialData);

  const handleExportToJson = useCallback(async () => {
    const jsonString = JSON.stringify(initialData, null, 2);
    try {
      await navigator.clipboard.writeText(jsonString);
      vscodeApi.postMessage({
        command: "showInformationMessage",
        text: "JSON data copied to clipboard!",
      });
    } catch (err) {
      console.error("Failed to copy JSON to clipboard:", err);
      vscodeApi.postMessage({
        command: "showErrorMessage",
        text: "Failed to copy JSON to clipboard. See dev console (Webview) for details.",
      });
    }
  }, [initialData, vscodeApi]);

  const handleExportToPng = useCallback(async () => {
    const svgElement = document.querySelector(".nivo-treemap-container svg");
    if (svgElement) {
      try {
        const dataUri = await svgAsPngUri(svgElement as SVGSVGElement, {
          scale: 2,
          backgroundColor: "#ffffff",
        });
        if (!dataUri) {
          throw new Error("Failed to generate PNG data URI.");
        }

        const response = await fetch(dataUri);
        const blob = await response.blob();

        if (!(blob instanceof Blob)) {
          throw new Error("Fetched data is not a Blob.");
        }
        if (blob.type !== "image/png") {
          console.warn(
            `Expected Blob type 'image/png' but got '${blob.type}'. Attempting to copy anyway.`
          );
          // Optionally, you could try to re-create the blob with the correct type if you are sure of the format
          // const newBlob = new Blob([blob], {type: 'image/png'});
          // await navigator.clipboard.write([new ClipboardItem({ 'image/png': newBlob })]);
        }

        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob }),
        ]);

        vscodeApi.postMessage({
          command: "showInformationMessage",
          text: "PNG image copied to clipboard!",
        });
      } catch (err: any) {
        console.error("Failed to copy PNG to clipboard:", err);
        let errorMessage =
          "Failed to copy PNG to clipboard. See dev console (Webview) for details.";
        if (err.name === "NotAllowedError") {
          errorMessage =
            "Clipboard write access denied. The webview might not have focus or permissions.";
        } else if (err.message) {
          errorMessage = `Failed to copy PNG: ${err.message}`;
        }
        vscodeApi.postMessage({
          command: "showErrorMessage",
          text: errorMessage,
        });
      }
    } else {
      console.error("SVG element not found for PNG export.");
      vscodeApi.postMessage({
        command: "showErrorMessage",
        text: "Could not find SVG element to export for PNG.",
      });
    }
  }, [vscodeApi]); // Removed fileName as it's not used

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

  // New useEffect for tooltip toggle shortcut
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "t") {
        event.preventDefault();
        onSettingsChange("enableTooltip", !settings.enableTooltip);
        vscodeApi.postMessage({
          command: "showInformationMessage",
          text: `Tooltip ${!settings.enableTooltip ? "enabled" : "disabled"}`,
        });
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [settings.enableTooltip, onSettingsChange, vscodeApi]);

  const displayData = isolatedNode || initialData;

  // Basic color scale based on category - extend as needed
  // const categoryColors: Record<NodeCategory, string> = {
  //   [NodeCategory.Program]: "#1f77b4",
  //   [NodeCategory.Module]: "#aec7e8",
  //   [NodeCategory.Class]: "#ff7f0e",
  //   [NodeCategory.Function]: "#ffbb78",
  //   [NodeCategory.ArrowFunction]: "#2ca02c",
  //   [NodeCategory.Block]: "#98df8a",
  //   [NodeCategory.ControlFlow]: "#d62728",
  //   [NodeCategory.Variable]: "#ff9896",
  //   [NodeCategory.Call]: "#9467bd",
  //   [NodeCategory.ReactComponent]: "#c5b0d5",
  //   [NodeCategory.ReactHook]: "#8c564b",
  //   [NodeCategory.JSX]: "#c49c94",
  //   [NodeCategory.Other]: "#7f7f7f",
  // };

  const activePalette =
    availablePalettes[settings.colorPalette] || defaultPalette;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
      }}
    >
      <div
        style={{
          padding: "8px 10px",
          backgroundColor: "#252526", // VS Code dark theme background
          color: "#cccccc", // Light text
          borderBottom: "1px solid #333333",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <h3 style={{ margin: 0, fontSize: "1em", fontWeight: "normal" }}>
          Treemap: {fileName}
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {(isolatedNode || isolationPath.length > 0) && (
            <>
              {isolatedNode && (
                <button
                  onClick={resetIsolation}
                  style={{ padding: "5px 10px", fontSize: "0.9em" }}
                  title="Reset treemap zoom level (Cmd/Ctrl+Shift+ArrowUp to go up)"
                >
                  Reset Zoom
                </button>
              )}
              {isolationPath.length > 0 && (
                <button
                  onClick={goUpOneLevel}
                  style={{ padding: "5px 10px", fontSize: "0.9em" }}
                  title="Go up one level in the treemap hierarchy (Cmd/Ctrl+Shift+ArrowUp)"
                >
                  Up One Level
                </button>
              )}
            </>
          )}
          <button
            onClick={handleExportToJson}
            style={{ padding: "5px 10px", fontSize: "0.9em" }}
            title="Export tree data as JSON"
          >
            Export JSON
          </button>
          <button
            onClick={handleExportToPng}
            style={{ padding: "5px 10px", fontSize: "0.9em" }}
            title="Export treemap as PNG (implementation placeholder)"
          >
            Export PNG
          </button>
        </div>
      </div>
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          flexGrow: 1,
          overflow: "hidden",
        }}
        className="nivo-treemap-container"
      >
        <ResponsiveTreeMap
          data={displayData}
          orientLabel={false}
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
          ) => getNodeDisplayLabel(node.data as ScopeNode)}
          label={(
            node: Omit<
              ComputedNodeWithoutStyles<ScopeNode>,
              "label" | "parentLabel"
            >
          ) => getNodeDisplayLabel(node.data as ScopeNode)}
          colors={(nodeWithData: ComputedNodeWithoutStyles<ScopeNode>) => {
            const category = nodeWithData.data.category;
            // return categoryColors[category] || categoryColors[NodeCategory.Other];
            return activePalette[category] || activePalette[NodeCategory.Other];
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
                      {(scopeNode.meta?.collapsed ||
                        scopeNode.meta?.syntheticGroup) && (
                        <div
                          style={{
                            marginTop: "5px",
                            paddingTop: "5px",
                            borderTop: "1px solid #eee",
                            color: "#555",
                          }}
                        >
                          {scopeNode.meta?.collapsed && (
                            <div style={{ fontStyle: "italic" }}>
                              Collapsed{" "}
                              {scopeNode.meta.originalCategory ||
                                scopeNode.category}
                              {scopeNode.meta.collapsed === "arrowFunction" &&
                                scopeNode.meta.call && (
                                  <> (calls: {scopeNode.meta.call})</>
                                )}
                            </div>
                          )}
                          {scopeNode.meta?.syntheticGroup && (
                            <div style={{ fontWeight: "bold" }}>
                              Group containing {scopeNode.meta.contains} nodes
                            </div>
                          )}
                        </div>
                      )}
                      {settings.showTooltipSourceSnippet &&
                        scopeNode.source && (
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
                            <div
                              style={{
                                maxHeight: "200px", // Example max height for the block
                                overflowY: "auto",
                                background: "#f0f0f0", // Background for the container
                                padding: "5px",
                                marginTop: "3px",
                              }}
                            >
                              <CodeBlock
                                raw={scopeNode.source.trim()}
                                lang="tsx"
                              />
                            </div>
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
    </div>
  );
};

export default TreemapDisplay;
