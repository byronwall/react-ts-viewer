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
  [NodeCategory.JSXElementDOM]: "#d4e157",
  [NodeCategory.JSXElementCustom]: "#ffc0cb",
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
  [NodeCategory.ReturnStatement]: "#66c2a5",
  [NodeCategory.Assignment]: "#ffd92f",
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
  [NodeCategory.JSXElementDOM]: "#117733",
  [NodeCategory.JSXElementCustom]: "#AA4499",
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
  [NodeCategory.ReturnStatement]: "#48D1CC",
  [NodeCategory.Assignment]: "#FFD700",
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
  [NodeCategory.JSXElementDOM]: "#d4e157",
  [NodeCategory.JSXElementCustom]: "#ef5350",
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
  [NodeCategory.ReturnStatement]: "#26c6da",
  [NodeCategory.Assignment]: "#ffca28",
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
  [NodeCategory.JSXElementDOM]: "#98df8a",
  [NodeCategory.JSXElementCustom]: "#fdbf6f",
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
  [NodeCategory.ReturnStatement]: "#66c2a5",
  [NodeCategory.Assignment]: "#ffd92f",
};

export const availablePalettes: Record<string, Record<NodeCategory, string>> = {
  Default: defaultPalette,
  "Pastel Set": pastelSet,
  "Okabe-Ito": okabeIto,
  "Neutral with Accents": neutralAccents,
};
// --- END: Color Palette Definitions ---

// Helper to get enum keys - Object.keys filters out reverse mappings for numeric enums
const getNodeCategoryKeys = () => {
  return Object.values(NodeCategory).filter(
    (value) => typeof value === "string"
  ) as string[];
};

// --- START: TreemapLegend Component ---
// This will be adapted into the Popover content
interface TreemapLegendContentProps {
  activePalette: Record<NodeCategory, string>;
}

const TreemapLegendContent: React.FC<TreemapLegendContentProps> = ({
  activePalette,
}) => {
  const legendCategories = getNodeCategoryKeys().filter(
    (key) => activePalette[key as NodeCategory]
  );

  if (legendCategories.length === 0) {
    return (
      <div style={{ padding: "10px", textAlign: "center" }}>
        No categories to display in legend.
      </div>
    );
  }

  return (
    <>
      {legendCategories.map((categoryKey) => {
        const categoryName = categoryKey as NodeCategory;
        const color = activePalette[categoryName];
        return (
          <div
            key={categoryName}
            style={{ display: "flex", alignItems: "center" }}
          >
            <span
              style={{
                width: "12px",
                height: "12px",
                backgroundColor: color,
                marginRight: "5px",
                border: "1px solid #555",
                display: "inline-block",
              }}
            ></span>
            {categoryName}
          </div>
        );
      })}
    </>
  );
};

// --- START: TreemapLegendPopover Component ---
interface TreemapLegendPopoverProps {
  activePalette: Record<NodeCategory, string>;
  isOpen: boolean;
  onClose: () => void; // Or a toggle function
  anchorElement: HTMLElement | null; // To position relative to the button
}

const TreemapLegendPopover: React.FC<TreemapLegendPopoverProps> = ({
  activePalette,
  isOpen,
  onClose, // We might not use onClose directly if the button toggles
  anchorElement,
}) => {
  if (!isOpen) return null;

  // Basic positioning logic - can be refined
  const popoverStyle: React.CSSProperties = {
    position: "absolute",
    top: anchorElement
      ? anchorElement.offsetTop + anchorElement.offsetHeight + 5
      : "60px", // Below the anchor + 5px margin
    right: "10px", // Align to the right of the header area
    backgroundColor: "#2c2c2c",
    color: "#cccccc",
    border: "1px solid #444444",
    borderRadius: "4px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    padding: "10px 15px",
    zIndex: 1000,
    minWidth: "200px",
    maxHeight: "250px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  };

  return (
    <div style={popoverStyle} className="treemap-legend-popover">
      <TreemapLegendContent activePalette={activePalette} />
    </div>
  );
};
// --- END: TreemapLegendPopover Component ---

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
  // New settings for label rendering
  minLabelHeight: number; // Minimum height of a node to display a label
  truncateLabel: boolean; // Whether to truncate labels that are too long
  labelMaxChars: number; // Absolute maximum characters for a label, respected during truncation
  avgCharPixelWidth: number; // Estimated average pixel width of a character for truncation based on node width
}

interface TreemapDisplayProps {
  data: ScopeNode;
  settings: TreemapSettings;
  onSettingsChange: (settingName: keyof TreemapSettings, value: any) => void;
  // width: number; // Not needed if ResponsiveTreeMapCanvas is used correctly
  // height: number; // Not needed if ResponsiveTreeMapCanvas is used correctly
}

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
  const { category, label, loc, source, kind } = nodeData; // children is part of nodeData
  console.log(
    `getNodeDisplayLabel: Received node - Kind: ${kind}, Category: ${category}, Label: ${label}`
  ); // Log input
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
      // Blocks usually don't have a meaningful label themselves
      // For very small blocks, an empty string might be better if they are numerous.
      return loc && loc.start.line === loc.end.line
        ? `Block (inline)${lineRange}`
        : `Block${lineRange}`;
    case NodeCategory.ControlFlow:
      return `${label}${lineRange}`;
    case NodeCategory.Call:
      return `${label || "call"}()${lineRange}`;
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
      // Ensure 'source' is available on Omit<ScopeNode, 'children'> if used like this
      return `Literal: ${label !== "Literal" && label ? label : source ? source.substring(0, 20) : ""}${lineRange}`;
    case NodeCategory.SyntheticGroup:
      return `Group: ${label}${lineRange}`;
    case NodeCategory.JSXElementDOM:
      return `${label}${lineRange}`;
    case NodeCategory.JSXElementCustom:
      return `${label}${lineRange}`;
    case NodeCategory.ConditionalBlock: {
      return `${label}${lineRange}`;
    }
    case NodeCategory.IfClause:
    case NodeCategory.ElseClause:
    case NodeCategory.ElseIfClause:
      return `${label}${lineRange}`;
    case NodeCategory.ReturnStatement:
      return `${label}${lineRange}`;
    case NodeCategory.Assignment:
      return `${label}${lineRange}`;
    default:
      return `${category}: ${label}${lineRange}`;
  }
};

// Define a type for the parts of a Nivo node needed for labeling
interface NodePartsForLabeling {
  data: ScopeNode;
  width: number;
  height: number;
}

// Helper function to dynamically determine node label display based on size and settings
const getDynamicNodeDisplayLabel = (
  parts: NodePartsForLabeling,
  settings: TreemapSettings
): string => {
  // Check height threshold
  if (parts.height < settings.minLabelHeight) {
    return "";
  }

  // Get the base label from existing logic
  let displayLabel = getNodeDisplayLabel(parts.data); // parts.data is ScopeNode

  // Apply truncation if enabled
  if (settings.truncateLabel) {
    let maxCharsAllowed = settings.labelMaxChars;

    // Calculate max characters based on node width, if avgCharPixelWidth is valid
    if (settings.avgCharPixelWidth > 0) {
      const maxCharsByWidth = Math.floor(
        parts.width / settings.avgCharPixelWidth
      );
      // Use the more restrictive limit between width-based and absolute max chars
      maxCharsAllowed = Math.min(maxCharsAllowed, maxCharsByWidth);
    }

    if (displayLabel.length > maxCharsAllowed) {
      if (maxCharsAllowed < 3) {
        // Not enough space for "..."
        return "";
      }
      displayLabel = displayLabel.substring(0, maxCharsAllowed - 3) + "...";
    }
  }

  return displayLabel;
};

// Helper function to determine contrasting text color (black or white)
const getContrastingTextColor = (hexBackgroundColor: string): string => {
  if (!hexBackgroundColor) return "#000000"; // Default to black if no color provided

  // Remove # if present
  const hex = hexBackgroundColor.replace("#", "");

  // Convert hex to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculate luminance (per WCAG 2.0)
  // Formula: 0.2126 * R + 0.7152 * G + 0.0722 * B
  // Note: RGB values should be in sRGB linear space (0-1 range)
  // For simplicity, we'll use the 0-255 range directly, which is common for this heuristic.
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  // Use a threshold (0.5 is common) to decide text color
  return luminance > 0.5 ? "#000000" : "#ffffff"; // Dark text on light bg, White text on dark bg
};

const TreemapDisplay: React.FC<TreemapDisplayProps> = ({
  data: initialData,
  settings,
  onSettingsChange,
}) => {
  const [isolatedNode, setIsolatedNode] = useState<ScopeNode | null>(null);
  const [isolationPath, setIsolationPath] = useState<ScopeNode[]>([]);
  const [isLegendVisible, setIsLegendVisible] = useState<boolean>(false); // State for legend popover
  const [legendButtonRef, setLegendButtonRef] =
    useState<HTMLButtonElement | null>(null);

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
    node: ComputedNode<ScopeNode>, // This is Nivo's computed node, node.data is our ScopeNode
    event: React.MouseEvent
  ) => {
    const clickedNivoNodeData = node.data; // This is the ScopeNode object from the data fed to Nivo

    if (event.metaKey || event.ctrlKey) {
      // CMD/CTRL + Click: Open file
      event.preventDefault();
      if (clickedNivoNodeData.loc && clickedNivoNodeData.id) {
        const idParts = clickedNivoNodeData.id.split(":");
        const filePath = idParts[0]; // Assumes filePath is the first part, before any colons.

        if (!filePath) {
          console.error(
            "Could not determine filePath from node ID:",
            clickedNivoNodeData.id
          );
          return; // Cannot proceed if filePath is missing
        }

        vscodeApi.postMessage({
          command: "revealCode",
          filePath: filePath,
          loc: clickedNivoNodeData.loc,
        });
      }
    } else {
      // Single Click: Expand/Collapse (Zoom)
      // Find the canonical version of the node from the original full tree (`initialData`)
      // This ensures we have the complete children information for accurate zooming.
      const fullNodeFromInitialTree = findNodeInTree(
        initialData,
        clickedNivoNodeData.id
      );

      if (fullNodeFromInitialTree) {
        if (
          fullNodeFromInitialTree.children &&
          fullNodeFromInitialTree.children.length > 0
        ) {
          // If the node (from the full tree) has children, zoom into it
          setIsolatedNode(fullNodeFromInitialTree);
          setIsolationPath((prevPath) => [
            ...prevPath,
            fullNodeFromInitialTree,
          ]);
        } else {
          // It's a leaf node in the full tree, do nothing on single click
          console.log(
            "Single click on a leaf node (in original tree):",
            fullNodeFromInitialTree.label
          );
        }
      } else {
        // This scenario should ideally not occur if IDs are consistent and initialData is complete.
        console.warn(
          `Node with id "${clickedNivoNodeData.id}" not found in initialData tree. Cannot perform zoom based on full tree.`
        );
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
          position: "relative", // For positioning the popover relative to the header
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
          <button
            ref={setLegendButtonRef} // Set the ref for positioning
            onClick={() => setIsLegendVisible(!isLegendVisible)}
            style={{ padding: "5px 10px", fontSize: "0.9em" }}
            title="Toggle Legend"
          >
            {isLegendVisible ? "Hide Legend" : "Show Legend"}
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
          labelTextColor={(
            node: ComputedNodeWithoutStyles<ScopeNode> & { color: string }
          ) => getContrastingTextColor(node.color)}
          parentLabelTextColor={(
            node: ComputedNodeWithoutStyles<ScopeNode> & { color: string }
          ) => getContrastingTextColor(node.color)}
          parentLabel={(
            node: Omit<ComputedNodeWithoutStyles<ScopeNode>, "parentLabel">
          ) => {
            const displayLabel = getDynamicNodeDisplayLabel(
              {
                data: node.data as ScopeNode,
                width: node.width,
                height: node.height,
              },
              settings
            );
            console.log(
              `Treemap Rendering - Parent Label: ${displayLabel} for node ID: ${node.id}`
            ); // Log final label
            return displayLabel;
          }}
          label={(
            node: Omit<
              ComputedNodeWithoutStyles<ScopeNode>,
              "label" | "parentLabel"
            >
          ) => {
            // console.log("node", node); // Keep for debugging if needed
            const displayLabel = getDynamicNodeDisplayLabel(
              {
                data: node.data as ScopeNode,
                width: node.width,
                height: node.height,
              },
              settings
            );
            console.log(
              `Treemap Rendering - Leaf Label: ${displayLabel} for node ID: ${node.id}`
            ); // Log final label
            return displayLabel;
          }}
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
      {/* Render the Popover */}
      <TreemapLegendPopover
        activePalette={activePalette}
        isOpen={isLegendVisible}
        onClose={() => setIsLegendVisible(false)} // Button toggles, so onClose is more for potential future use (e.g. click outside)
        anchorElement={legendButtonRef}
      />
    </div>
  );
};

export default TreemapDisplay;
