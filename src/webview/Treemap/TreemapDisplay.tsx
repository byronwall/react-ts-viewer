import {
  ComputedNode,
  ComputedNodeWithoutStyles,
  ResponsiveTreeMap,
} from "@nivo/treemap";
import React, { useCallback, useEffect, useState } from "react";
import { svgAsPngUri } from "save-svg-as-png";
import { NodeCategory, ScopeNode } from "../../types"; // Assuming src/types.ts
import { CodeBlock } from "../CodeBlock";
import { vscodeApi } from "../vscodeApi"; // Import the shared vscodeApi singleton
import { TreemapSettings } from "../settingsConfig"; // Corrected import path
import { TreemapLegendPopover } from "./TreemapLegendPopover";
import { getContrastingTextColor } from "./getContrastingTextColor";
import { getDynamicNodeDisplayLabel } from "./getDynamicNodeDisplayLabel";
import { pastelSet } from "./pastelSet";

interface TreemapDisplayProps {
  data: ScopeNode;
  settings: TreemapSettings;
  onSettingsChange: (settingName: keyof TreemapSettings, value: any) => void;
  isSettingsPanelOpen: boolean;
  onToggleSettingsPanel: () => void;
  fileName: string;
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

export const TreemapDisplay: React.FC<TreemapDisplayProps> = ({
  data: initialData,
  settings,
  onSettingsChange,
  isSettingsPanelOpen,
  onToggleSettingsPanel,
  fileName,
}) => {
  const [isolatedNode, setIsolatedNode] = useState<ScopeNode | null>(null);
  const [isolationPath, setIsolationPath] = useState<ScopeNode[]>([]);
  const [isLegendVisible, setIsLegendVisible] = useState<boolean>(false); // State for legend popover
  const [legendButtonRef, setLegendButtonRef] =
    useState<HTMLButtonElement | null>(null);

  const handleExportToJson = useCallback(async () => {
    const jsonString = JSON.stringify(initialData, null, 2);
    try {
      await navigator.clipboard.writeText(jsonString);
      vscodeApi.postMessage({
        command: "showInformationMessage",
        text: "JSON data copied to clipboard!",
      });
    } catch (err) {
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
        }
      } else {
        // This scenario should ideally not occur if IDs are consistent and initialData is complete.
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

    // Visibility checks for Synthetic Groups FIRST
    if (originalNode.category === NodeCategory.SyntheticGroup) {
      if (!settings.showImports && originalNode.label === "Imports") {
        return null;
      }
      // Assuming "Type Definitions" is the label for the group.
      // If it's "Type defs" or similar, this string needs to match exactly.
      if (!settings.showTypes && originalNode.label === "Type defs") {
        return null;
      }
    }

    // THEN depth limit checks
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
    : transformNodeForDepthLimit(baseDisplayData, 0, 0, false); // Apply visibility filters even if depth limit is off

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
        className="treemap-internal-header" // Added class for clarity
      >
        <h3 style={{ margin: 0, fontSize: "1em", fontWeight: "normal" }}>
          {/* Title removed from here, will be handled by App.tsx's main header */}
          Treemap:{" "}
          <span style={{ color: "#ddd", fontStyle: "italic" }}>{fileName}</span>
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {(isolatedNode || isolationPath.length > 0) && (
            <>
              {isolatedNode && (
                <button
                  onClick={resetIsolation}
                  className="treemap-action-button"
                  title="Reset treemap zoom level (Cmd/Ctrl+Shift+ArrowUp to go up)"
                >
                  Reset Zoom
                </button>
              )}
              {isolationPath.length > 0 && (
                <button
                  onClick={goUpOneLevel}
                  className="treemap-action-button"
                  title="Go up one level in the treemap hierarchy (Cmd/Ctrl+Shift+ArrowUp)"
                >
                  Up One Level
                </button>
              )}
            </>
          )}
          <button
            onClick={handleExportToJson}
            className="treemap-action-button"
            title="Export tree data as JSON"
          >
            Export JSON
          </button>
          <button
            onClick={handleExportToPng}
            className="treemap-action-button"
            title="Export treemap as PNG"
          >
            Export PNG
          </button>
          <button
            ref={setLegendButtonRef}
            onClick={() => setIsLegendVisible(!isLegendVisible)}
            className="treemap-action-button"
            title="Toggle Legend"
          >
            {isLegendVisible ? "Hide Legend" : "Show Legend"}
          </button>
          <button
            onClick={onToggleSettingsPanel}
            title={isSettingsPanelOpen ? "Hide Settings" : "Show Settings"}
            style={{
              padding: "6px",
              backgroundColor: isSettingsPanelOpen ? "#0056b3" : "#007bff",
              color: "white",
              border: isSettingsPanelOpen
                ? "2px solid #ffc107"
                : "2px solid transparent",
              borderRadius: "50%",
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background-color 0.2s, border-color 0.2s",
            }}
            className="settings-cog-button-treemap"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.68,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.04,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
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
                  data: node.data as ScopeNode,
                  width: node.width,
                  height: node.height,
                },
                settings
              );
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
                  data: node.data as ScopeNode,
                  width: node.width,
                  height: node.height,
                },
                settings
              );
              return displayLabel;
            }}
            colors={(nodeWithData: ComputedNodeWithoutStyles<ScopeNode>) => {
              const category = nodeWithData.data.category;
              return pastelSet[category] || pastelSet[NodeCategory.Other];
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
                    const codeBlockLang =
                      fileName.endsWith(".md") || fileName.endsWith(".mdx")
                        ? "markdown"
                        : "tsx";
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
                                  maxHeight: "200px",
                                  overflowY: "auto",
                                  background: "#f0f0f0",
                                  padding: "5px",
                                  marginTop: "3px",
                                }}
                              >
                                <CodeBlock
                                  raw={scopeNode.source.trim()}
                                  lang={codeBlockLang}
                                />
                              </div>
                            </>
                          )}
                      </div>
                    );
                  }
                : () => null
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
      <TreemapLegendPopover
        activePalette={pastelSet}
        isOpen={isLegendVisible}
        onClose={() => setIsLegendVisible(false)}
        anchorElement={legendButtonRef}
      />
    </div>
  );
};
