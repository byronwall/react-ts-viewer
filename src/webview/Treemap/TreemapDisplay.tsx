import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { svgAsPngUri } from "save-svg-as-png";
import { Popover } from "@headlessui/react";
import { Code, FileImage, Gear } from "@phosphor-icons/react";
import { NodeCategory, ScopeNode } from "../../types"; // Assuming src/types.ts
import { getNodeDisplayLabel } from "../getNodeDisplayLabel";
import {
  TreemapSettings,
  treemapSettingsConfig,
  settingGroupOrder,
} from "../settingsConfig"; // Added imports
import { vscodeApi } from "../vscodeApi"; // Import the shared vscodeApi singleton
import CollapsibleSection from "../CollapsibleSection"; // Import CollapsibleSection
import SettingsControl from "../SettingsControl"; // Import SettingsControl
import { NodeDetailDrawer } from "./NodeDetailDrawer"; // Import the new drawer component
import { TreemapLegendPopover } from "./TreemapLegendPopover";
import { AnyLayoutFn, TreemapSVG } from "./TreemapSVG"; // Added AnyLayoutFn
import { layoutHierarchical } from "./layoutHierarchical";
import { pastelSet } from "./pastelSet";

interface TreemapDisplayProps {
  data: ScopeNode;
  settings: TreemapSettings;
  onSettingsChange: (settingName: keyof TreemapSettings, value: any) => void;
  isSettingsPanelOpen: boolean; // Keep for compatibility, but won't be used
  onToggleSettingsPanel: () => void; // Keep for compatibility, but won't be used
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

// Helper function to calculate the maximum depth of a tree
function calculateMaxDepth(node: ScopeNode, currentDepth: number = 0): number {
  if (!node.children || node.children.length === 0) {
    return currentDepth;
  }

  let maxChildDepth = currentDepth;
  for (const child of node.children) {
    const childDepth = calculateMaxDepth(child, currentDepth + 1);
    maxChildDepth = Math.max(maxChildDepth, childDepth);
  }

  return maxChildDepth;
}

// Exported helper function to check if a node matches the search text
export function nodeMatchesSearch(
  node: ScopeNode,
  searchText: string
): boolean {
  if (!searchText) return false;

  const lowerSearchText = searchText.toLowerCase();

  // Check label
  if (node.label && node.label.toLowerCase().includes(lowerSearchText)) {
    return true;
  }

  // Check source (if available)
  if (node.source && node.source.toLowerCase().includes(lowerSearchText)) {
    return true;
  }

  return false;
}

// Exported helper function to find all matching nodes and their paths from root
export function findMatchingNodesAndPaths(
  node: ScopeNode,
  searchText: string,
  currentPath: string[] = []
): {
  matchingNodes: Set<string>;
  pathsToMatches: Set<string>;
} {
  const result = {
    matchingNodes: new Set<string>(),
    pathsToMatches: new Set<string>(),
  };

  if (!searchText) return result;

  const newPath = [...currentPath, node.id];

  // Check if current node matches
  if (nodeMatchesSearch(node, searchText)) {
    result.matchingNodes.add(node.id);
    // Add all nodes in the path to this match
    newPath.forEach((id) => result.pathsToMatches.add(id));
  }

  // Recursively check children
  if (node.children) {
    for (const child of node.children) {
      const childResult = findMatchingNodesAndPaths(child, searchText, newPath);

      // Merge results
      childResult.matchingNodes.forEach((id) => result.matchingNodes.add(id));
      childResult.pathsToMatches.forEach((id) => result.pathsToMatches.add(id));

      // If any child has matches, add current node to paths
      if (childResult.matchingNodes.size > 0) {
        newPath.forEach((id) => result.pathsToMatches.add(id));
      }
    }
  }

  return result;
}

// Exported helper function to filter nodes based on search
export function filterNodesForSearch(
  node: ScopeNode,
  visibleNodeIds: Set<string>
): ScopeNode | null {
  if (!visibleNodeIds.has(node.id)) {
    return null;
  }

  let filteredChildren: ScopeNode[] | undefined = undefined;

  if (node.children) {
    const childResults = node.children
      .map((child) => filterNodesForSearch(child, visibleNodeIds))
      .filter((child): child is ScopeNode => child !== null);

    if (childResults.length > 0) {
      filteredChildren = childResults;
    }
  }

  return {
    ...node,
    children: filteredChildren,
  } as ScopeNode;
}

export const TreemapDisplay: React.FC<TreemapDisplayProps> = ({
  data: initialData,
  settings,
  onSettingsChange,
  fileName,
}) => {
  const [isolatedNode, setIsolatedNode] = useState<ScopeNode | null>(null);
  const [isolationPath, setIsolationPath] = useState<ScopeNode[]>([]);

  const [selectedNodeForDrawer, setSelectedNodeForDrawer] =
    useState<ScopeNode | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerWidth, setDrawerWidth] = useState<number>(300); // Initial drawer width
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const minDrawerWidth = 150; // Minimum width for the drawer
  const maxDrawerWidth = 800; // Maximum width for the drawer
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

  // Tooltip state
  const [tooltip, setTooltip] = useState<{
    node: ScopeNode;
    x: number;
    y: number;
  } | null>(null);

  // Update container dimensions when the container size changes
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
  }, [isDrawerOpen, drawerWidth]);

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
    const svgElement = document.querySelector(".custom-treemap-container svg");
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
  }, [vscodeApi]);

  // New handler for Jump to Source
  const handleJumpToSource = useCallback(
    (nodeToJump: ScopeNode) => {
      if (nodeToJump.loc && nodeToJump.id) {
        const idParts = nodeToJump.id.split(":");
        const filePath = idParts[0]; // Assumes filePath is the first part

        if (!filePath) {
          console.warn(
            "Cannot jump to source: filePath is missing in node id",
            nodeToJump
          );
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
        console.warn("Cannot jump to source: loc or id missing", nodeToJump);
        vscodeApi.postMessage({
          command: "showInformationMessage",
          text: "Source location not available for this node.",
        });
      }
    },
    [vscodeApi]
  );

  // New handler for Drill In
  const handleDrillIntoNode = useCallback(
    (nodeToDrill: ScopeNode) => {
      // We need the full node from the initial tree to get children information
      const fullNodeFromInitialTree = findNodeInTree(
        initialData,
        nodeToDrill.id
      );

      if (!fullNodeFromInitialTree) {
        console.warn(
          "Cannot drill in: Node not found in initial tree",
          nodeToDrill
        );
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
        setIsolatedNode(fullNodeFromInitialTree);
        setIsolationPath((prevPath) => [...prevPath, fullNodeFromInitialTree]);
        setIsDrawerOpen(false); // Close drawer when isolating/drilling
        setSelectedNodeForDrawer(null);
      } else {
        // It's a leaf node or has no drillable children
        vscodeApi.postMessage({
          command: "showInformationMessage",
          text: "This node has no further children to drill into.",
        });
      }
    },
    [
      initialData,
      setIsolatedNode,
      setIsolationPath,
      setIsDrawerOpen,
      setSelectedNodeForDrawer,
    ]
  );

  const handleNodeClick = (
    node: ScopeNode, // Now directly a ScopeNode instead of Nivo's computed node
    event: React.MouseEvent
  ) => {
    const clickedNodeData = node; // This is already the ScopeNode object
    const fullNodeFromInitialTree = findNodeInTree(
      initialData,
      clickedNodeData.id
    );

    if (!fullNodeFromInitialTree) {
      // This scenario should ideally not occur if IDs are consistent and initialData is complete.
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      // CMD/CTRL + Click: Open file
      event.preventDefault();
      handleJumpToSource(fullNodeFromInitialTree); // Use the new handler
    } else if (event.altKey) {
      // ALT + Click: Isolate node (Zoom)
      event.preventDefault();
      handleDrillIntoNode(fullNodeFromInitialTree); // Use the new handler
    } else {
      // Single Click (no modifiers): Open/Close NodeDetailDrawer
      event.preventDefault();
      if (
        selectedNodeForDrawer?.id === fullNodeFromInitialTree.id &&
        isDrawerOpen
      ) {
        setIsDrawerOpen(false);
        // Optionally, keep selectedNodeForDrawer so if it's re-opened fast it's there,
        // or set to null: setSelectedNodeForDrawer(null);
      } else {
        setSelectedNodeForDrawer(fullNodeFromInitialTree);
        setIsDrawerOpen(true);
      }
    }
  };

  const resetIsolation = useCallback(() => {
    setIsolatedNode(null);
    setIsolationPath([]);
    setIsDrawerOpen(false); // Close drawer when resetting isolation
    setSelectedNodeForDrawer(null);
  }, []);

  const goUpOneLevel = useCallback(() => {
    setIsolationPath((prevPath) => {
      if (prevPath.length === 0) {
        return [];
      }
      const newPath = prevPath.slice(0, -1);

      if (newPath.length === 0) {
        setIsolatedNode(null);
        setIsDrawerOpen(false); // Close drawer when going to root
        setSelectedNodeForDrawer(null);
      } else {
        const potentialParentNode = newPath[newPath.length - 1];
        if (potentialParentNode) {
          // Check if potentialParentNode is defined
          setIsolatedNode(potentialParentNode);
          // Close drawer if the new isolated node is different from the node in the drawer.
          if (potentialParentNode.id !== selectedNodeForDrawer?.id) {
            setIsDrawerOpen(false);
            setSelectedNodeForDrawer(null);
          }
        } else {
          setIsolatedNode(null); // Should not happen if newPath is not empty
          setIsDrawerOpen(false);
          setSelectedNodeForDrawer(null);
        }
      }
      return newPath;
    });
  }, [isolatedNode, selectedNodeForDrawer?.id]); // Adjusted dependencies

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

  // New useEffect for comma/period depth limit shortcuts
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

      // Comma key: decrease depth limit
      if (
        event.key === "," &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        if (!settings.enableDepthLimit) {
          // If depth limit is disabled, enable it with max depth - 1
          const maxDepth = calculateMaxDepth(initialData);
          const newDepth = Math.max(1, maxDepth - 1);
          onSettingsChange("enableDepthLimit", true);
          onSettingsChange("maxDepth", newDepth);
        } else {
          // Decrease current depth limit, minimum 1
          const newDepth = Math.max(1, settings.maxDepth - 1);
          onSettingsChange("maxDepth", newDepth);
        }
      }

      // Period key: increase depth limit
      if (
        event.key === "." &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        const maxDepth = calculateMaxDepth(initialData);

        if (!settings.enableDepthLimit) {
          // If depth limit is disabled (show all), do nothing - stop here
          return;
        } else if (settings.maxDepth >= maxDepth) {
          // If at or above max depth, disable depth limit (show all)
          onSettingsChange("enableDepthLimit", false);
        } else {
          // Increase current depth limit
          const newDepth = Math.min(maxDepth, settings.maxDepth + 1);
          onSettingsChange("maxDepth", newDepth);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    onSettingsChange,
    settings.enableDepthLimit,
    settings.maxDepth,
    initialData,
  ]);

  // Search functionality effects
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

      // Focus search with '/' key
      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }

      // Cancel search with Escape key
      if (event.key === "Escape") {
        event.preventDefault();
        setSearchText("");
        setMatchingNodes(new Set());
        searchInputRef.current?.blur();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Update matching nodes when search text changes
  useEffect(() => {
    if (!searchText.trim()) {
      setMatchingNodes(new Set());
      return;
    }

    const baseData = isolatedNode || initialData;
    const result = findMatchingNodesAndPaths(baseData, searchText.trim());
    setMatchingNodes(result.matchingNodes);
  }, [searchText, isolatedNode, initialData]);

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
  const depthFilteredData = settings.enableDepthLimit
    ? transformNodeForDepthLimit(baseDisplayData, 0, settings.maxDepth, true)
    : transformNodeForDepthLimit(baseDisplayData, 0, 0, false); // Apply visibility filters even if depth limit is off

  // Apply search filtering if active
  let finalDisplayData = depthFilteredData;
  if (searchText.trim() && depthFilteredData) {
    const searchResult = findMatchingNodesAndPaths(
      depthFilteredData,
      searchText.trim()
    );
    if (searchResult.pathsToMatches.size > 0) {
      finalDisplayData = filterNodesForSearch(
        depthFilteredData,
        searchResult.pathsToMatches
      );
    } else {
      // No matches found, show empty state
      finalDisplayData = null;
    }
  }

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing) {
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth > minDrawerWidth && newWidth < maxDrawerWidth) {
          setDrawerWidth(newWidth);
        } else if (newWidth <= minDrawerWidth) {
          setDrawerWidth(minDrawerWidth);
        } else {
          setDrawerWidth(maxDrawerWidth);
        }
      }
    },
    [isResizing, minDrawerWidth, maxDrawerWidth]
  );

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);

    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

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

  // Determine which layout function and options to use based on settings
  const currentLayoutFn: AnyLayoutFn = layoutHierarchical;

  // Calculate max depth for breadcrumbs
  const maxDepth = calculateMaxDepth(baseDisplayData || initialData);

  // Generate breadcrumb buttons
  const renderDepthBreadcrumbs = () => {
    const buttons = [];

    // Add buttons from 1 to maxDepth (skip 0 as it's confusing)
    for (let depth = 1; depth <= maxDepth; depth++) {
      const isActive = settings.enableDepthLimit && settings.maxDepth === depth;

      buttons.push(
        <button
          key={depth}
          onClick={() => {
            onSettingsChange("enableDepthLimit", true);
            onSettingsChange("maxDepth", depth);
          }}
          className={`depth-breadcrumb ${isActive ? "active" : ""}`}
          title={`Depth limit: ${depth}`}
        >
          {depth}
        </button>
      );
    }

    // Add unlimited option (*)
    const isUnlimitedActive = !settings.enableDepthLimit;
    buttons.push(
      <button
        key="unlimited"
        onClick={() => onSettingsChange("enableDepthLimit", false)}
        className={`depth-breadcrumb ${isUnlimitedActive ? "active" : ""}`}
        title="No depth limit (show all levels)"
      >
        *
      </button>
    );

    return buttons;
  };

  // New function to render settings in popover
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
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h3
              style={{
                margin: 0,
                fontSize: "1.2em",
                fontWeight: "500",
                color: "#ffffff",
              }}
            >
              {fileName}
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <input
                ref={searchInputRef}
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search nodes... (press / to focus)"
                className="treemap-search-input"
              />
              {searchText.trim() && (
                <button
                  onClick={() => {
                    setSearchText("");
                    setMatchingNodes(new Set());
                  }}
                  className="treemap-search-cancel"
                  title="Clear search (Esc)"
                >
                  ✕
                </button>
              )}
            </div>
            {searchText.trim() && (
              <span className="treemap-search-status">
                {matchingNodes.size} matches
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {(isolatedNode || isolationPath.length > 0) && (
              <>
                {isolatedNode && (
                  <button
                    onClick={resetIsolation}
                    className="treemap-header-button"
                    title="Reset treemap zoom level (Cmd/Ctrl+Shift+ArrowUp to go up)"
                  >
                    Reset Zoom
                  </button>
                )}
                {isolationPath.length > 0 && (
                  <button
                    onClick={goUpOneLevel}
                    className="treemap-header-button"
                    title="Go up one level in the treemap hierarchy (Cmd/Ctrl+Shift+ArrowUp)"
                  >
                    Up One Level
                  </button>
                )}
              </>
            )}
            <button
              onClick={handleExportToJson}
              className="treemap-export-button"
              title="Export tree data as JSON"
            >
              <Code size={14} />
              JSON
            </button>
            <button
              onClick={handleExportToPng}
              className="treemap-export-button"
              title="Export treemap as PNG"
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
                      top: rect.bottom + 4, // Position below button with small gap
                      right: window.innerWidth - rect.right, // Right align with button
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
                            <h4>Treemap Settings</h4>
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

        {/* Depth Breadcrumbs Row - Outside Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "3px",
            padding: "8px 10px",
            backgroundColor: "#2d2d30",
            borderBottom: "1px solid #333333",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: "11px", color: "#999", marginRight: "6px" }}>
            Depth:
          </span>
          {renderDepthBreadcrumbs()}
          <span style={{ fontSize: "10px", color: "#777", marginLeft: "6px" }}>
            Use , and . keys to navigate
          </span>
        </div>

        <div
          ref={treemapContainerRef}
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            flexGrow: 1,
            overflow: "hidden",
          }}
          className="custom-treemap-container"
        >
          {finalDisplayData ? (
            <TreemapSVG
              root={finalDisplayData}
              width={containerDimensions.width}
              height={containerDimensions.height}
              layout={currentLayoutFn} // Pass the selected layout function
              settings={settings}
              matchingNodes={matchingNodes}
              selectedNodeId={selectedNodeForDrawer?.id}
              onNodeClick={handleNodeClick}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              padding={settings.outerPadding}
              minFontSize={settings.selectedLayout === "hierarchical" ? 7 : 12}
              maxFontSize={settings.selectedLayout === "hierarchical" ? 11 : 16}
            />
          ) : (
            <div
              style={{ textAlign: "center", padding: "20px", color: "#ccc" }}
            >
              {searchText.trim()
                ? `No nodes found matching "${searchText}". Try a different search term or press Escape to clear the search.`
                : "No data to display (possibly all filtered by depth limit or data is null)."}
            </div>
          )}
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
              {/* Show hidden children information in tooltip */}
              {tooltip.node.meta?.hasHiddenChildren && (
                <>
                  {"\n"}
                  <span style={{ color: "#ffa500", fontWeight: "bold" }}>
                    ⚠ {tooltip.node.meta.hiddenChildrenCount} hidden children
                  </span>
                  {tooltip.node.meta.hiddenReason && (
                    <>
                      {"\n"}
                      <span style={{ color: "#ccc", fontSize: "10px" }}>
                        Reason:{" "}
                        {tooltip.node.meta.hiddenReason.replace(/_/g, " ")}
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {isDrawerOpen && selectedNodeForDrawer && (
        <>
          <div
            ref={resizeHandleRef}
            onMouseDown={startResizing}
            style={{
              width: "5px",
              cursor: "ew-resize",
              backgroundColor: "#333333", // Darker handle for visibility
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10, // Ensure handle is on top
            }}
            title="Resize drawer"
          >
            {/* Optional: Add an icon or visual indicator for the handle */}
            {/* <div style={{ width: '2px', height: '20px', backgroundColor: '#666' }} /> */}
          </div>
          <NodeDetailDrawer
            node={selectedNodeForDrawer}
            isOpen={isDrawerOpen}
            onClose={() => setIsDrawerOpen(false)}
            fileName={fileName}
            settings={settings}
            onJumpToSource={handleJumpToSource} // Pass the handler
            onDrillIntoNode={handleDrillIntoNode} // Pass the handler
            width={drawerWidth} // Pass the width to the drawer
          />
        </>
      )}
    </div>
  );
};
