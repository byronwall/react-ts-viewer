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
  [NodeCategory.Function]: "#fb8072", // Coral pink
  [NodeCategory.ArrowFunction]: "#80b1d3",
  [NodeCategory.Block]: "#fdb462",
  [NodeCategory.ControlFlow]: "#b3de69",
  [NodeCategory.Variable]: "#fccde5",
  [NodeCategory.Call]: "#d9d9d9", // Dull gray, good for console
  [NodeCategory.ReactComponent]: "#bc80bd",
  [NodeCategory.ReactHook]: "#ccebc5",
  [NodeCategory.JSX]: "#ffed6f",
  [NodeCategory.JSXElementDOM]: "#d4e157",
  [NodeCategory.JSXElementCustom]: "#bde4e8", // Was #ffc0cb (pink), changed to light blue/teal
  [NodeCategory.Import]: "#c1e7ff",
  [NodeCategory.TypeAlias]: "#ffe8b3",
  [NodeCategory.Interface]: "#f0e68c",
  [NodeCategory.Literal]: "#dcdcdc",
  [NodeCategory.SyntheticGroup]: "#e6e6fa",
  [NodeCategory.ConditionalBlock]: "#b3e2cd", // Mint green (base for conditionals)
  [NodeCategory.IfClause]: "#c6f0e0", // Lighter mint
  [NodeCategory.ElseIfClause]: "#a0d8c0", // Medium mint
  [NodeCategory.ElseClause]: "#8ccbad", // Darker mint
  [NodeCategory.Other]: "#a6cee3",
  [NodeCategory.ReturnStatement]: "#66c2a5",
  [NodeCategory.Assignment]: "#ffd92f",
};

// Simplified for direct use of pastelSet
export const availablePalettes: Record<string, Record<NodeCategory, string>> = {
  "Pastel Set": pastelSet,
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
  // New settings for depth limiting
  enableDepthLimit: boolean;
  maxDepth: number;
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
  const { category, label, loc, source, kind, children, meta } = nodeData; // children is part of nodeData, meta added
  console.log(
    `getNodeDisplayLabel: Received node - Kind: ${kind}, Category: ${category}, Label: ${label}`
  );
  const lineRange =
    loc && children && children.length > 0
      ? ` [${loc.start.line}-${loc.end.line}]`
      : "";

  let baseLabel = "";

  switch (category) {
    case NodeCategory.JSX:
      baseLabel = `<${label || "JSXElement"}>${lineRange}`;
      break;
    case NodeCategory.Function:
      baseLabel = `${label || "fn"}()${lineRange}`;
      break;
    case NodeCategory.ArrowFunction:
      baseLabel =
        (label && label !== "ArrowFunction" ? `${label}() => {}` : `() => {}`) +
        lineRange;
      break;
    case NodeCategory.Variable:
      baseLabel = `[${label || "var"}]${lineRange}`;
      break;
    case NodeCategory.Class:
      baseLabel = `[${label || "class"}]${lineRange}`;
      break;
    case NodeCategory.Import:
      baseLabel = `[${label || "import"}]${lineRange}`;
      break;
    case NodeCategory.Program:
      baseLabel = `${label}${lineRange}`; // Usually the filename
      break;
    case NodeCategory.Module:
      baseLabel = `Module: ${label}${lineRange}`;
      break;
    case NodeCategory.Block:
      baseLabel =
        loc && loc.start.line === loc.end.line
          ? `Block (inline)${lineRange}`
          : `Block${lineRange}`;
      break;
    case NodeCategory.ControlFlow:
      baseLabel = `${label}${lineRange}`;
      break;
    case NodeCategory.Call:
      baseLabel = `${label || "call"}()${lineRange}`;
      break;
    case NodeCategory.ReactComponent:
      baseLabel = `<${label || "Component"} />${lineRange}`;
      break;
    case NodeCategory.ReactHook:
      baseLabel = `${label || "useHook"}()${lineRange}`;
      break;
    case NodeCategory.TypeAlias:
      baseLabel = `type ${label}${lineRange}`;
      break;
    case NodeCategory.Interface:
      baseLabel = `interface ${label}${lineRange}`;
      break;
    case NodeCategory.Literal:
      baseLabel = `Literal: ${label !== "Literal" && label ? label : source ? source.substring(0, 20) : ""}${lineRange}`;
      break;
    case NodeCategory.SyntheticGroup:
      baseLabel = `Group: ${label}${lineRange}`;
      break;
    case NodeCategory.JSXElementDOM:
      baseLabel = `${label}${lineRange}`;
      break;
    case NodeCategory.JSXElementCustom:
      baseLabel = `${label}${lineRange}`;
      break;
    case NodeCategory.ConditionalBlock: {
      baseLabel = `${label}${lineRange}`;
      break;
    }
    case NodeCategory.IfClause:
    case NodeCategory.ElseClause:
    case NodeCategory.ElseIfClause:
      baseLabel = `${label}${lineRange}`;
      break;
    case NodeCategory.ReturnStatement:
      baseLabel = `${label}${lineRange}`;
      break;
    case NodeCategory.Assignment:
      baseLabel = `${label}${lineRange}`;
      break;
    default:
      baseLabel = `${category}: ${label}${lineRange}`;
      break;
  }

  // Prepend glyph if constrained by depth
  if (meta?.isConstrainedByDepth) {
    return `▼ ${baseLabel}`;
  }
  return baseLabel;
};

// Define a type for the parts of a Nivo node needed for labeling
interface NodePartsForLabeling {
  data: ScopeNode;
  width: number;
  height: number;
  // depth: number; // Removed for nesting depth
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

  // useEffect for tooltip toggle shortcut (keep this one)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "t" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        // Ensure no modifiers
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

  // New useEffect for depth limit shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if the event target is an input, select, or textarea
      const target = event.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA")
      ) {
        // If the event originates from an input field, don't process the shortcut
        return;
      }

      const keyNum = parseInt(event.key, 10);
      if (
        !isNaN(keyNum) &&
        keyNum >= 0 &&
        keyNum <= 9 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        if (keyNum === 0) {
          onSettingsChange("enableDepthLimit", false);
          // vscodeApi.postMessage({
          //   command: "showInformationMessage",
          //   text: "Treemap depth limit disabled.",
          // });
        } else {
          onSettingsChange("enableDepthLimit", true);
          onSettingsChange("maxDepth", keyNum);
          // vscodeApi.postMessage({
          //   command: "showInformationMessage",
          //   text: `Treemap depth limit set to ${keyNum}.`,
          // });
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onSettingsChange, vscodeApi]);

  const displayData = isolatedNode || initialData;

  // Helper function to recursively transform/filter nodes based on depth limit
  const transformNodeForDepthLimit = (
    originalNode: ScopeNode | null,
    currentDepth: number,
    maxDepthSetting: number,
    limitEnabled: boolean
  ): ScopeNode | null => {
    if (!originalNode) {
      return null;
    }

    if (limitEnabled && currentDepth > maxDepthSetting) {
      return null; // Prune this node and its children
    }

    // If the node itself is kept, process its children
    let newChildren: ScopeNode[] | undefined = undefined;
    let isConstrained = false; // Default to not constrained

    const hadOriginalChildren =
      originalNode.children && originalNode.children.length > 0;

    if (hadOriginalChildren) {
      if (limitEnabled) {
        // Case 1: Node is AT the maxDepth setting.
        if (currentDepth === maxDepthSetting) {
          isConstrained = true; // This node is at the limit, its direct children are pruned.
          newChildren = undefined;
        }
        // Case 2: Node is BELOW the maxDepth setting.
        else if (currentDepth < maxDepthSetting) {
          const processedChildren = originalNode
            .children! // Safe due to hadOriginalChildren
            .map((child) =>
              transformNodeForDepthLimit(
                child,
                currentDepth + 1,
                maxDepthSetting,
                limitEnabled
              )
            )
            .filter((child): child is ScopeNode => child !== null);

          if (processedChildren.length === 0) {
            // All children were pruned by deeper limits.
            isConstrained = true;
            newChildren = undefined;
          } else {
            newChildren = processedChildren;
            // isConstrained remains false as it has visible children.
          }
        }
        // Case 3: currentDepth > maxDepthSetting (This node itself should have been pruned by the entry check)
        // This path should ideally not be reached if the entry pruning `if (limitEnabled && currentDepth > maxDepthSetting) return null;` works.
        // If it is reached, it means children are pruned. Consider it constrained.
        else {
          isConstrained = true;
          newChildren = undefined;
        }
      } else {
        // limitEnabled is false
        // Process children normally without depth constraints
        newChildren = originalNode
          .children! // Safe due to hadOriginalChildren
          .map((child) =>
            transformNodeForDepthLimit(
              child,
              currentDepth + 1,
              maxDepthSetting,
              limitEnabled
            )
          ) // limitEnabled is false
          .filter((child): child is ScopeNode => child !== null);
        if (newChildren.length === 0) newChildren = undefined;
        // isConstrained remains false
      }
    } else {
      // No original children
      // isConstrained remains false
      newChildren = undefined; // Ensure consistency, though originalNode.children was empty/undefined
    }

    // Create a new node with potentially filtered children and updated meta
    // Preserve other meta properties and explicitly manage isConstrainedByDepth
    const existingMeta = originalNode.meta || {};
    const updatedMeta: Partial<
      typeof existingMeta & { isConstrainedByDepth?: boolean }
    > = { ...existingMeta };

    if (isConstrained) {
      updatedMeta.isConstrainedByDepth = true;
    } else {
      delete updatedMeta.isConstrainedByDepth; // Remove the flag if not constrained
    }

    return {
      ...originalNode,
      children: newChildren,
      // Assign meta only if it has properties or was originally defined and still has properties after potential deletion
      meta: Object.keys(updatedMeta).length > 0 ? updatedMeta : undefined,
    } as ScopeNode;
  };

  const baseDisplayData = isolatedNode || initialData;

  // Apply depth filtering if enabled
  const finalDisplayData = settings.enableDepthLimit
    ? transformNodeForDepthLimit(baseDisplayData, 0, settings.maxDepth, true)
    : baseDisplayData;

  // Basic color scale based on category - extend as needed
  // const activePalette =
  //   availablePalettes[settings.colorPalette] || defaultPalette;
  const activePalette = pastelSet; // Directly use pastelSet

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
        {finalDisplayData ? (
          <ResponsiveTreeMap
            data={finalDisplayData}
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
                  data: node.data as ScopeNode, // Use the node from our tree
                  width: node.width,
                  height: node.height,
                  // depth: foundInfo.depth, // Removed
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
              const displayLabel = getDynamicNodeDisplayLabel(
                {
                  data: node.data as ScopeNode, // Use the node from our tree
                  width: node.width,
                  height: node.height,
                  // depth: foundInfo.depth, // Removed
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
              return (
                activePalette[category] || activePalette[NodeCategory.Other]
              );
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
                            Value: {node.formattedValue} ({scopeNode.value}{" "}
                            chars)
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
        ) : (
          <div style={{ textAlign: "center", padding: "20px", color: "#ccc" }}>
            No data to display (possibly all filtered by depth limit or data is
            null).
          </div>
        )}
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
