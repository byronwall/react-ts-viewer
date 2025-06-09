import { Popover } from "@headlessui/react";
import { Code, FileImage, Gear } from "@phosphor-icons/react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { svgAsPngUri } from "save-svg-as-png";
import { NodeCategory, ScopeNode } from "../../types";
import CollapsibleSection from "../CollapsibleSection";
import { getNodeDisplayLabel } from "../getNodeDisplayLabel";
import {
  settingGroupOrder,
  TreemapSettings,
  treemapSettingsConfig,
} from "../settingsConfig";
import SettingsControl from "../SettingsControl";
import { vscodeApi } from "../vscodeApi";
import { layoutHierarchical } from "./layoutHierarchical";
import { NodeDetailDrawer } from "./NodeDetailDrawer";
import { pastelSet } from "./pastelSet";
import { findNodeInTree } from "./TreemapDisplay";
import { TreemapLegendPopover } from "./TreemapLegendPopover";
import { TreemapContent } from "./TreemapSVG";
import { ViewportState } from "./ViewportTreemapSVG";

interface FileTreemapData {
  filePath: string;
  fileName: string;
  data: ScopeNode;
  isLoading: boolean;
  error?: string;
  animationState: "entering" | "entered" | "exiting";
}

interface GridTreemapDisplayProps {
  primaryData: ScopeNode;
  settings: TreemapSettings;
  onSettingsChange: (settingName: keyof TreemapSettings, value: any) => void;
  fileName: string;
  filePath: string;
}

export const GridTreemapDisplay: React.FC<GridTreemapDisplayProps> = ({
  primaryData,
  settings,
  onSettingsChange,
  fileName,
  filePath,
}) => {
  const [treemaps, setTreemaps] = useState<FileTreemapData[]>([]);
  const [expectedTotalFiles, setExpectedTotalFiles] = useState<number>(1); // Track expected total for consistent grid sizing
  const [isolatedNodeIndex, setIsolatedNodeIndex] = useState<number | null>(
    null
  );
  const [isolatedNode, setIsolatedNode] = useState<ScopeNode | null>(null);
  const [isolationPath, setIsolationPath] = useState<ScopeNode[]>([]);

  const [selectedNodeForDrawer, setSelectedNodeForDrawer] =
    useState<ScopeNode | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerWidth, setDrawerWidth] = useState<number>(300);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const minDrawerWidth = 150;
  const maxDrawerWidth = 800;
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const treemapContainerRef = useRef<HTMLDivElement>(null);
  const [containerDimensions, setContainerDimensions] = useState({
    width: 800,
    height: 600,
  });

  // Search state
  const [searchText, setSearchText] = useState<string>("");
  const [matchingNodes, setMatchingNodes] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Viewport reset function ref
  const resetViewportRef = useRef<(() => void) | undefined>();

  // Tooltip state
  const [tooltip, setTooltip] = useState<{
    node: ScopeNode;
    x: number;
    y: number;
  } | null>(null);

  // Viewport state for pan and zoom
  const [viewport, setViewport] = useState<ViewportState>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });

  // Interaction state
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Constants for zoom behavior - more responsive for large content
  const MIN_SCALE = 0.05;
  const MAX_SCALE = 20;
  const ZOOM_FACTOR = 0.1; // Increased for faster zooming

  // Initialize with primary data (only if treemaps is empty)
  useEffect(() => {
    setTreemaps((prev) => {
      // Only initialize if empty or if the primary file path changed
      if (prev.length === 0 || prev[0]?.filePath !== filePath) {
        return [
          {
            filePath,
            fileName,
            data: primaryData,
            isLoading: false,
            animationState: "entered",
          },
        ];
      }
      // Update primary data if it changed but keep additional treemaps
      return prev.map((treemap, index) =>
        index === 0 ? { ...treemap, data: primaryData } : treemap
      );
    });
  }, [primaryData, fileName, filePath]);

  // Request additional files from the same folder
  useEffect(() => {
    const requestAdditionalFiles = async () => {
      if (!filePath) return;

      // Extract folder path
      const folderPath = filePath.substring(0, filePath.lastIndexOf("/"));

      vscodeApi.postMessage({
        command: "getAdditionalFiles",
        folderPath,
        currentFilePath: filePath,
        maxFiles: 5,
      });
    };

    // Delay to allow primary treemap to load first
    const timer = setTimeout(requestAdditionalFiles, 1000);
    return () => clearTimeout(timer);
  }, [filePath]);

  // Handle messages from VS Code
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      if (message.command === "additionalFilesResponse") {
        const { files } = message;

        // Set expected total files upfront for consistent grid sizing
        setExpectedTotalFiles(1 + files.length); // 1 primary + additional files

        // Add each file as a loading treemap with staggered timing
        files.forEach(
          (file: { filePath: string; fileName: string }, index: number) => {
            setTimeout(() => {
              setTreemaps((prev) => [
                ...prev,
                {
                  filePath: file.filePath,
                  fileName: file.fileName,
                  data: null as any, // Will be loaded
                  isLoading: true,
                  animationState: "entering",
                },
              ]);

              // Request the scope tree for this file
              vscodeApi.postMessage({
                command: "getScopeTree",
                filePath: file.filePath,
                options: {
                  flattenTree: settings.enableNodeFlattening,
                  flattenBlocks: settings.flattenBlocks,
                  flattenArrowFunctions: settings.flattenArrowFunctions,
                  createSyntheticGroups: settings.createSyntheticGroups,
                  includeImports: settings.showImports,
                  includeTypes: settings.showTypes,
                  includeLiterals: settings.showLiterals,
                  includeComments: settings.showComments,
                },
              });
            }, index * 500); // Stagger by 500ms
          }
        );
      }

      if (message.command === "showScopeTree") {
        const { data, filePath: responseFilePath } = message;

        setTreemaps((prev) =>
          prev.map((treemap) => {
            if (treemap.filePath === responseFilePath) {
              return {
                ...treemap,
                data,
                isLoading: false,
                animationState: "entered",
              };
            }
            return treemap;
          })
        );
      }

      if (message.command === "showScopeTreeError") {
        const { error, filePath: responseFilePath } = message;

        setTreemaps((prev) =>
          prev.map((treemap) => {
            if (treemap.filePath === responseFilePath) {
              return {
                ...treemap,
                error,
                isLoading: false,
                animationState: "entered",
              };
            }
            return treemap;
          })
        );
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [settings]);

  // Calculate grid dimensions
  const calculateGridDimensions = (count: number) => {
    if (count === 1) return { cols: 1, rows: 1 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 3, rows: 2 };
    return { cols: 3, rows: 3 };
  };

  const validTreemaps = treemaps.filter((t) => t.data && !t.error);
  console.log(
    `📊 Grid state: total=${treemaps.length}, valid=${validTreemaps.length}, expected=${expectedTotalFiles}`
  );

  // Fixed dimensions for each treemap - 1200x800 regardless of screen size
  const TREEMAP_WIDTH = 1200;
  const TREEMAP_HEIGHT = 800;

  // Use tracked expected total for consistent grid sizing
  const { cols, rows } = calculateGridDimensions(expectedTotalFiles);
  const totalWidth = cols * TREEMAP_WIDTH;
  const totalHeight = rows * TREEMAP_HEIGHT;

  // Update container dimensions (no longer dependent on drawer state)
  useEffect(() => {
    const updateDimensions = () => {
      if (treemapContainerRef.current) {
        const rect = treemapContainerRef.current.getBoundingClientRect();
        setContainerDimensions({
          width: Math.max(100, rect.width),
          height: Math.max(100, rect.height),
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);

    return () => {
      window.removeEventListener("resize", updateDimensions);
    };
  }, []); // Removed drawer dependencies

  const handleExportToJson = useCallback(async () => {
    const exportData = {
      files: validTreemaps.map((t) => ({
        fileName: t.fileName,
        filePath: t.filePath,
        data: t.data,
      })),
    };
    const jsonString = JSON.stringify(exportData, null, 2);
    try {
      await navigator.clipboard.writeText(jsonString);
      vscodeApi.postMessage({
        command: "showInformationMessage",
        text: "Grid treemap data copied to clipboard!",
      });
    } catch (err) {
      vscodeApi.postMessage({
        command: "showErrorMessage",
        text: "Failed to copy JSON to clipboard.",
      });
    }
  }, [validTreemaps]);

  const handleExportToPng = useCallback(async () => {
    const svgElement = document.querySelector(".grid-treemap-container svg");
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

        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob }),
        ]);

        vscodeApi.postMessage({
          command: "showInformationMessage",
          text: "Grid treemap PNG copied to clipboard!",
        });
      } catch (err: any) {
        vscodeApi.postMessage({
          command: "showErrorMessage",
          text: "Failed to copy PNG to clipboard.",
        });
      }
    }
  }, []);

  const handleJumpToSource = useCallback((nodeToJump: ScopeNode) => {
    if (nodeToJump.loc && nodeToJump.id) {
      const idParts = nodeToJump.id.split(":");
      const filePath = idParts[0];

      if (!filePath) {
        vscodeApi.postMessage({
          command: "showErrorMessage",
          text: "Cannot jump to source: File path information is missing for this node.",
        });
        return;
      }

      vscodeApi.postMessage({
        command: "revealCode",
        filePath: filePath,
        loc: nodeToJump.loc,
      });
    } else {
      vscodeApi.postMessage({
        command: "showInformationMessage",
        text: "Source location not available for this node.",
      });
    }
  }, []);

  const handleDrillIntoNode = useCallback(
    (nodeToDrill: ScopeNode, treemapIndex: number) => {
      const treemap = validTreemaps[treemapIndex];
      if (!treemap) return;

      const fullNodeFromInitialTree = findNodeInTree(
        treemap.data,
        nodeToDrill.id
      );

      if (!fullNodeFromInitialTree) {
        vscodeApi.postMessage({
          command: "showErrorMessage",
          text: "Cannot drill into node: Node data inconsistency.",
        });
        return;
      }

      if (
        fullNodeFromInitialTree.children &&
        fullNodeFromInitialTree.children.length > 0
      ) {
        setIsolatedNodeIndex(treemapIndex);
        setIsolatedNode(fullNodeFromInitialTree);
        setIsolationPath([fullNodeFromInitialTree]);
        setIsDrawerOpen(false);
        setSelectedNodeForDrawer(null);
      } else {
        vscodeApi.postMessage({
          command: "showInformationMessage",
          text: "This node has no further children to drill into.",
        });
      }
    },
    [validTreemaps]
  );

  const handleNodeClick = (
    node: ScopeNode,
    event: React.MouseEvent,
    treemapIndex: number
  ) => {
    const treemap = validTreemaps[treemapIndex];
    if (!treemap) return;

    const fullNodeFromInitialTree = findNodeInTree(treemap.data, node.id);
    if (!fullNodeFromInitialTree) return;

    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      handleJumpToSource(fullNodeFromInitialTree);
    } else if (event.altKey) {
      event.preventDefault();
      handleDrillIntoNode(fullNodeFromInitialTree, treemapIndex);
    } else {
      event.preventDefault();
      if (
        selectedNodeForDrawer?.id === fullNodeFromInitialTree.id &&
        isDrawerOpen
      ) {
        setIsDrawerOpen(false);
      } else {
        setSelectedNodeForDrawer(fullNodeFromInitialTree);
        setIsDrawerOpen(true);
      }
    }
  };

  const resetIsolation = useCallback(() => {
    setIsolatedNodeIndex(null);
    setIsolatedNode(null);
    setIsolationPath([]);
    setIsDrawerOpen(false);
    setSelectedNodeForDrawer(null);
  }, []);

  const handleMouseEnter = useCallback(
    (node: ScopeNode, event: React.MouseEvent) => {
      if (settings.enableTooltip) {
        const rect = treemapContainerRef.current?.getBoundingClientRect();
        if (rect) {
          setTooltip({
            node,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          });
        }
      }
    },
    [settings.enableTooltip]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  // Get mouse position relative to SVG
  const getSVGMousePosition = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return { x: 0, y: 0 };

      const rect = svgRef.current.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    },
    []
  );

  // Handle zoom with mouse wheel
  const handleWheel = useCallback(
    (event: React.WheelEvent<SVGSVGElement>) => {
      event.preventDefault();

      const mousePos = getSVGMousePosition(event);
      const delta = -event.deltaY;
      const zoomIntensity = delta > 0 ? 1 + ZOOM_FACTOR : 1 - ZOOM_FACTOR;

      setViewport((prev) => {
        const newScale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, prev.scale * zoomIntensity)
        );

        // Calculate zoom center in world coordinates
        const worldX = (mousePos.x - prev.translateX) / prev.scale;
        const worldY = (mousePos.y - prev.translateY) / prev.scale;

        // Calculate new translation to keep zoom centered on mouse
        const newTranslateX = mousePos.x - worldX * newScale;
        const newTranslateY = mousePos.y - worldY * newScale;

        return {
          scale: newScale,
          translateX: newTranslateX,
          translateY: newTranslateY,
        };
      });
    },
    [getSVGMousePosition]
  );

  // Handle pan start
  const handleMouseDown = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      // Only start panning on left mouse button
      if (event.button !== 0) return;

      event.preventDefault();
      setIsPanning(true);
      const mousePos = getSVGMousePosition(event);
      setLastPanPoint(mousePos);
    },
    [getSVGMousePosition]
  );

  // Handle pan move
  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!isPanning) return;

      event.preventDefault();
      const mousePos = getSVGMousePosition(event);
      const deltaX = mousePos.x - lastPanPoint.x;
      const deltaY = mousePos.y - lastPanPoint.y;

      setViewport((prev) => ({
        ...prev,
        translateX: prev.translateX + deltaX,
        translateY: prev.translateY + deltaY,
      }));

      setLastPanPoint(mousePos);
    },
    [isPanning, lastPanPoint, getSVGMousePosition]
  );

  // Handle pan end
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Handle mouse leave to stop panning
  const handleMouseLeaveGrid = useCallback(() => {
    setIsPanning(false);
    handleMouseLeave();
  }, [handleMouseLeave]);

  // Reset viewport to default
  const resetViewport = useCallback(() => {
    setViewport({
      scale: 1,
      translateX: 0,
      translateY: 0,
    });
  }, []);

  // Expose reset function via ref
  useEffect(() => {
    if (resetViewportRef) {
      resetViewportRef.current = resetViewport;
    }
  }, [resetViewport]);

  // Transform node for depth limit (reusing logic from TreemapDisplay)
  const transformNodeForDepthLimit = (
    originalNode: ScopeNode | null,
    currentDepth: number,
    maxDepthSetting: number,
    limitEnabled: boolean
  ): ScopeNode | null => {
    if (!originalNode) return null;

    if (originalNode.category === NodeCategory.SyntheticGroup) {
      if (!settings.showImports && originalNode.label === "Imports") {
        return null;
      }
      if (!settings.showTypes && originalNode.label === "Type defs") {
        return null;
      }
    }

    if (limitEnabled && currentDepth > maxDepthSetting) {
      return null;
    }

    let newChildren: ScopeNode[] | undefined = undefined;
    let isConstrained = false;

    const hadOriginalChildren =
      originalNode.children && originalNode.children.length > 0;

    if (hadOriginalChildren) {
      if (limitEnabled) {
        if (currentDepth === maxDepthSetting) {
          isConstrained = true;
          newChildren = undefined;
        } else if (currentDepth < maxDepthSetting) {
          const processedChildren = originalNode
            .children!.map((child) =>
              transformNodeForDepthLimit(
                child,
                currentDepth + 1,
                maxDepthSetting,
                limitEnabled
              )
            )
            .filter((child): child is ScopeNode => child !== null);

          if (processedChildren.length === 0) {
            isConstrained = true;
            newChildren = undefined;
          } else {
            newChildren = processedChildren;
          }
        } else {
          isConstrained = true;
          newChildren = undefined;
        }
      } else {
        newChildren = originalNode
          .children!.map((child) =>
            transformNodeForDepthLimit(
              child,
              currentDepth + 1,
              maxDepthSetting,
              limitEnabled
            )
          )
          .filter((child): child is ScopeNode => child !== null);
        if (newChildren.length === 0) newChildren = undefined;
      }
    } else {
      newChildren = undefined;
    }

    const existingMeta = originalNode.meta || {};
    const updatedMeta: any = { ...existingMeta };

    if (isConstrained) {
      updatedMeta.isConstrainedByDepth = true;
    } else {
      delete updatedMeta.isConstrainedByDepth;
    }

    return {
      ...originalNode,
      children: newChildren,
      meta: Object.keys(updatedMeta).length > 0 ? updatedMeta : undefined,
    } as ScopeNode;
  };

  // Render settings content
  const renderSettingsContent = () => {
    return settingGroupOrder.map((groupName) => {
      const settingsInGroup = treemapSettingsConfig.filter(
        (s) => s.group === groupName
      );
      if (settingsInGroup.length === 0) return null;

      const defaultOpenGroup =
        groupName === "Treemap Display" ||
        groupName === "Node Visibility" ||
        groupName === "Node Structure";

      return (
        <CollapsibleSection
          title={groupName}
          key={groupName}
          defaultOpen={defaultOpenGroup}
        >
          {settingsInGroup.map((config) => (
            <SettingsControl
              key={config.id}
              config={config}
              currentSettings={settings}
              onChange={onSettingsChange}
            />
          ))}
        </CollapsibleSection>
      );
    });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        width: "100%",
        height: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          height: "100%",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "8px 10px",
            backgroundColor: "#252526",
            color: "#cccccc",
            borderBottom: "1px solid #333333",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
            position: "relative",
          }}
          className="treemap-internal-header"
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h3
              style={{
                margin: 0,
                fontSize: "1.2em",
                fontWeight: "500",
                color: "#ffffff",
              }}
            >
              {fileName} + {validTreemaps.length - 1} more
            </h3>
            {isolatedNodeIndex !== null && (
              <span style={{ fontSize: "0.9em", color: "#999" }}>
                (Isolated: {validTreemaps[isolatedNodeIndex]?.fileName})
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {isolatedNode && (
              <button
                onClick={resetIsolation}
                className="treemap-header-button"
                title="Reset treemap zoom level"
              >
                Reset Zoom
              </button>
            )}
            <button
              onClick={() => resetViewportRef.current?.()}
              className="treemap-export-button"
              title="Reset view to fit entire grid"
            >
              🔄 Reset View
            </button>
            <button
              onClick={handleExportToJson}
              className="treemap-export-button"
              title="Export grid data as JSON"
            >
              <Code size={14} />
              JSON
            </button>
            <button
              onClick={handleExportToPng}
              className="treemap-export-button"
              title="Export grid as PNG"
            >
              <FileImage size={14} />
              PNG
            </button>
            <TreemapLegendPopover activePalette={pastelSet} />

            {/* Settings Popover */}
            <Popover>
              {({ open }) => {
                const [buttonRef, setButtonRef] =
                  useState<HTMLButtonElement | null>(null);
                const [panelPosition, setPanelPosition] = useState({
                  top: 0,
                  right: 0,
                });

                useEffect(() => {
                  if (open && buttonRef) {
                    const rect = buttonRef.getBoundingClientRect();
                    setPanelPosition({
                      top: rect.bottom + 4,
                      right: window.innerWidth - rect.right,
                    });
                  }
                }, [open, buttonRef]);

                return (
                  <>
                    <Popover.Button
                      ref={setButtonRef}
                      className={`treemap-settings-button ${open ? "active" : ""}`}
                      title="Settings"
                    >
                      <Gear size={16} />
                    </Popover.Button>

                    {open &&
                      createPortal(
                        <Popover.Panel
                          static
                          className="treemap-popover-base treemap-settings-popover"
                          style={{
                            position: "fixed",
                            top: panelPosition.top,
                            right: panelPosition.right,
                            zIndex: 9999,
                          }}
                        >
                          <div style={{ marginBottom: "15px" }}>
                            <h4>Grid Treemap Settings</h4>
                            {renderSettingsContent()}
                          </div>
                        </Popover.Panel>,
                        document.body
                      )}
                  </>
                );
              }}
            </Popover>
          </div>
        </div>

        {/* Grid Container */}
        <div
          ref={treemapContainerRef}
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            flexGrow: 1,
            overflow: "hidden",
          }}
          className="grid-treemap-container"
        >
          {/* Viewport info for debugging */}
          {settings.showDebugFreeRectangles && (
            <div
              style={{
                position: "absolute",
                top: 50,
                right: 10,
                zIndex: 1000,
                padding: "8px",
                backgroundColor: "rgba(0, 0, 0, 0.8)",
                color: "white",
                borderRadius: "4px",
                fontSize: "10px",
                fontFamily: "monospace",
                whiteSpace: "pre",
              }}
            >
              {`Grid Mode: Active
Scale: ${viewport.scale.toFixed(2)}
Pan: ${viewport.translateX.toFixed(0)}, ${viewport.translateY.toFixed(0)}
Mode: ${isPanning ? "PANNING" : "IDLE"}
Files: ${validTreemaps.length}
Grid: ${cols}x${rows}
Treemap Size: ${TREEMAP_WIDTH}x${TREEMAP_HEIGHT}
Total Size: ${totalWidth}x${totalHeight}
Container: ${containerDimensions.width}x${containerDimensions.height}
Isolated: ${isolatedNodeIndex}`}
            </div>
          )}
          {validTreemaps.length > 0 ? (
            <svg
              ref={svgRef}
              width={containerDimensions.width}
              height={containerDimensions.height}
              viewBox={`0 0 ${totalWidth} ${totalHeight}`}
              style={{
                background: "#1e1e1e",
                cursor: isPanning ? "grabbing" : "grab",
                userSelect: "none",
                display: "block",
              }}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeaveGrid}
            >
              {/* Apply viewport transform to the entire grid */}
              <g
                transform={`translate(${viewport.translateX}, ${viewport.translateY}) scale(${viewport.scale})`}
              >
                {/* Render grid of treemaps */}
                {treemaps.map((treemap, originalIndex) => {
                  // Debug logging for each treemap
                  console.log(`🔍 Treemap ${originalIndex} state:`, {
                    fileName: treemap.fileName,
                    hasData: !!treemap.data,
                    isLoading: treemap.isLoading,
                    error: treemap.error,
                    animationState: treemap.animationState,
                  });

                  // Skip if treemap doesn't have data or has error
                  if (!treemap.data || treemap.error) {
                    console.log(
                      `❌ Skipping treemap ${originalIndex}: no data or error`
                    );
                    return null;
                  }

                  if (
                    isolatedNodeIndex !== null &&
                    originalIndex !== isolatedNodeIndex
                  ) {
                    return null; // Hide other treemaps when one is isolated
                  }

                  // Position in grid
                  const col = originalIndex % cols;
                  const row = Math.floor(originalIndex / cols);
                  const x = col * TREEMAP_WIDTH;
                  const y = row * TREEMAP_HEIGHT;

                  // Debug logging
                  console.log(
                    `Treemap ${originalIndex}: col=${col}, row=${row}, x=${x}, y=${y}, width=${TREEMAP_WIDTH}, height=${TREEMAP_HEIGHT}`
                  );

                  // Use isolated node if available, otherwise use filtered data
                  let displayData = treemap.data;
                  if (isolatedNodeIndex === originalIndex && isolatedNode) {
                    displayData = isolatedNode;
                  }

                  // Apply depth filtering
                  const depthFilteredData = settings.enableDepthLimit
                    ? transformNodeForDepthLimit(
                        displayData,
                        0,
                        settings.maxDepth,
                        true
                      )
                    : transformNodeForDepthLimit(displayData, 0, 0, false);

                  if (!depthFilteredData) return null;

                  const adjustedWidth =
                    isolatedNodeIndex === originalIndex
                      ? totalWidth
                      : TREEMAP_WIDTH - 4;
                  const adjustedHeight =
                    isolatedNodeIndex === originalIndex
                      ? totalHeight
                      : TREEMAP_HEIGHT - 4;
                  const adjustedX =
                    isolatedNodeIndex === originalIndex ? 0 : x + 2;
                  const adjustedY =
                    isolatedNodeIndex === originalIndex ? 0 : y + 2;

                  return (
                    <g
                      key={`treemap-${originalIndex}-${treemap.filePath}`}
                      transform={`translate(${adjustedX}, ${adjustedY})`}
                      style={{
                        opacity: treemap.animationState === "entering" ? 0 : 1,
                        transition: "opacity 0.5s ease-in-out",
                      }}
                    >
                      {/* Background for each treemap */}
                      <rect
                        width={adjustedWidth}
                        height={adjustedHeight}
                        fill="#2d2d30"
                        stroke="#ff6b6b"
                        strokeWidth={3}
                        rx={4}
                      />
                      {/* Debug info for positioning */}
                      <text
                        x={10}
                        y={30}
                        fill="#ff6b6b"
                        fontSize="12"
                        fontFamily="monospace"
                      >
                        {`${originalIndex}: (${adjustedX}, ${adjustedY})`}
                      </text>

                      {/* File label */}
                      {isolatedNodeIndex !== originalIndex && (
                        <text
                          x={adjustedWidth / 2}
                          y={16}
                          textAnchor="middle"
                          fill="#ccc"
                          fontSize="10"
                          fontFamily="monospace"
                        >
                          {treemap.fileName}
                        </text>
                      )}

                      {/* Treemap content */}
                      <g
                        transform={`translate(${isolatedNodeIndex === originalIndex ? 0 : 4}, ${isolatedNodeIndex === originalIndex ? 0 : 20})`}
                      >
                        <TreemapContent
                          root={depthFilteredData}
                          width={
                            isolatedNodeIndex === originalIndex
                              ? adjustedWidth
                              : adjustedWidth - 8
                          }
                          height={
                            isolatedNodeIndex === originalIndex
                              ? adjustedHeight
                              : adjustedHeight - 24
                          }
                          layout={layoutHierarchical}
                          settings={settings}
                          matchingNodes={new Set()}
                          selectedNodeId={selectedNodeForDrawer?.id}
                          onNodeClick={(node, event) =>
                            handleNodeClick(node, event, originalIndex)
                          }
                          onMouseEnter={handleMouseEnter}
                          onMouseLeave={handleMouseLeave}
                          padding={settings.outerPadding}
                          minFontSize={7}
                          maxFontSize={11}
                        />
                      </g>
                    </g>
                  );
                })}

                {/* Loading indicators */}
                {treemaps
                  .filter((t) => t.isLoading)
                  .map((treemap, loadingIndex) => {
                    const totalIndex = treemaps.findIndex(
                      (t) => t.filePath === treemap.filePath
                    );
                    const col = totalIndex % cols;
                    const row = Math.floor(totalIndex / cols);
                    const x = col * TREEMAP_WIDTH + TREEMAP_WIDTH / 2;
                    const y = row * TREEMAP_HEIGHT + TREEMAP_HEIGHT / 2;

                    return (
                      <g key={`loading-${treemap.filePath}`}>
                        <circle
                          cx={x}
                          cy={y}
                          r="20"
                          fill="none"
                          stroke="#666"
                          strokeWidth="2"
                          strokeDasharray="10 5"
                          style={{
                            animation: "spin 1s linear infinite",
                          }}
                        />
                        <text
                          x={x}
                          y={y + 40}
                          textAnchor="middle"
                          fill="#999"
                          fontSize="10"
                          fontFamily="monospace"
                        >
                          Loading {treemap.fileName}...
                        </text>
                      </g>
                    );
                  })}
              </g>
            </svg>
          ) : (
            <div
              style={{ textAlign: "center", padding: "20px", color: "#ccc" }}
            >
              No treemap data available
            </div>
          )}

          {/* Tooltip */}
          {tooltip && (
            <div
              style={{
                position: "absolute",
                left: tooltip.x + 10,
                top: tooltip.y - 10,
                padding: "5px 8px",
                background: "#333",
                color: "#f0f0f0",
                border: "1px solid #555",
                borderRadius: "2px",
                fontSize: "11px",
                maxWidth: "300px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                pointerEvents: "none",
                zIndex: 1000,
              }}
            >
              {getNodeDisplayLabel(tooltip.node) ||
                tooltip.node.id.split(":").pop() ||
                "Node"}
            </div>
          )}
        </div>
      </div>

      {/* Drawer */}
      {isDrawerOpen && selectedNodeForDrawer && (
        <>
          <div
            ref={resizeHandleRef}
            style={{
              width: "5px",
              cursor: "ew-resize",
              backgroundColor: "#333333",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10,
            }}
            title="Resize drawer"
          />
          <NodeDetailDrawer
            node={selectedNodeForDrawer}
            isOpen={isDrawerOpen}
            onClose={() => setIsDrawerOpen(false)}
            fileName={
              selectedNodeForDrawer.id.split(":")[0]?.split("/").pop() ||
              "Unknown"
            }
            settings={settings}
            onJumpToSource={handleJumpToSource}
            onDrillIntoNode={(node) => {
              const treemapIndex = validTreemaps.findIndex(
                (t) => t.data && findNodeInTree(t.data, node.id)
              );
              if (treemapIndex !== -1) {
                handleDrillIntoNode(node, treemapIndex);
              }
            }}
            width={drawerWidth}
          />
        </>
      )}

      {/* CSS for animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
