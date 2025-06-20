import { NodeCategory } from "../../types";
import { TreemapSettings } from "../settingsConfig";
import { getContrastingTextColor } from "./getContrastingTextColor";
import { getDynamicNodeDisplayLabel } from "./getDynamicNodeDisplayLabel";
import { HierarchicalLayoutNode } from "./layoutHierarchical";
import { pastelSet } from "./pastelSet";
import {
  AnyLayoutNode,
  FlatContainerNode,
  hasUnrenderedChildrenHelper,
  lightenColor,
} from "./TreemapSVG";
import { FlatLeafNode } from "./LeafNode";

export const collectAllNodes = (
  layoutRoot: AnyLayoutNode,
  settings: TreemapSettings,
  matchingNodes: Set<string>,
  selectedNodeId: string | undefined,
  minFontSize: number,
  maxFontSize: number,
  layoutOptions: any
): { containers: FlatContainerNode[]; leaves: FlatLeafNode[] } => {
  const containers: FlatContainerNode[] = [];
  const leaves: FlatLeafNode[] = [];

  // Collect nodes by depth level first (breadth-first)
  const nodesByDepth: Array<Array<{ node: AnyLayoutNode; depth: number }>> = [];

  const collectByDepth = (ln: AnyLayoutNode, depth = 0) => {
    // Skip rendering if the node is too small or marked as 'none'
    if (ln.w < 2 || ln.h < 2 || ln.renderMode === "none") {
      return;
    }

    // Ensure we have an array for this depth level
    if (!nodesByDepth[depth]) {
      nodesByDepth[depth] = [];
    }

    // Add this node to its depth level
    nodesByDepth[depth].push({ node: ln, depth });

    // Recursively collect children
    if (ln.children) {
      for (const child of ln.children) {
        collectByDepth(child as AnyLayoutNode, depth + 1);
      }
    }
  };

  // First pass: collect all nodes by depth
  collectByDepth(layoutRoot);

  // Second pass: process nodes level by level, containers first within each level
  let renderOrder = 0;

  for (let depthLevel = 0; depthLevel < nodesByDepth.length; depthLevel++) {
    const nodesAtThisDepth = nodesByDepth[depthLevel];
    if (!nodesAtThisDepth) continue;

    // Separate containers and leaves at this depth
    const containersAtDepth: Array<{ node: AnyLayoutNode; depth: number }> = [];
    const leavesAtDepth: Array<{ node: AnyLayoutNode; depth: number }> = [];

    for (const { node: ln, depth } of nodesAtThisDepth) {
      const hasRenderableChildren = ln.children && ln.children.length > 0;
      const isActuallyContainer = hasRenderableChildren;

      if (ln.renderMode === "box") {
        leavesAtDepth.push({ node: ln, depth });
      } else if (isActuallyContainer) {
        containersAtDepth.push({ node: ln, depth });
      } else {
        leavesAtDepth.push({ node: ln, depth });
      }
    }

    // Process containers first at this depth level
    for (const { node: ln, depth } of containersAtDepth) {
      const currentRenderOrder = renderOrder++;

      // Common properties
      const category = ln.node.category;
      const baseColor = pastelSet[category] || pastelSet[NodeCategory.Other];
      const isSelected = selectedNodeId === ln.node.id;
      const isSearchMatch = matchingNodes.has(ln.node.id);

      // Get unrendered children info
      const unrenderedInfo = hasUnrenderedChildrenHelper(ln.node, ln);

      // Get hidden children info
      const meta = (ln.node as any).meta || {};
      const hasHiddenChildren =
        meta.hasHiddenChildren === true ||
        (ln.node as any).hasHiddenChildren === true;
      const hiddenChildrenCount =
        meta.hiddenChildrenCount || (ln.node as any).hiddenChildrenCount || 0;

      // Container node processing
      const headerHeight = Math.min(layoutOptions.headerHeight, ln.h);

      // Container border styling
      let groupBorderColor = "#6c757d";
      let groupStrokeWidth = Math.max(0.5, 1.5 - depth * 0.2);
      let groupOpacity = Math.max(0.3, 0.6 - depth * 0.1);

      if (isSelected) {
        groupBorderColor = "red";
        groupStrokeWidth = Math.max(2, 3 - depth * 0.3);
        groupOpacity = 0.8;
      } else if (isSearchMatch) {
        groupBorderColor = "#FFD700";
        groupStrokeWidth = Math.max(1, 2 - depth * 0.2);
        groupOpacity = 0.7;
      } else if (depth === 1) {
        groupBorderColor = "#6c757d";
      } else {
        groupBorderColor = "#adb5bd";
      }

      const groupFillColor = lightenColor(baseColor, 30);

      // Header styling
      const color = baseColor;
      let borderColor = "#333333";
      let strokeWidth = 0.5;

      if (unrenderedInfo.hasUnrendered) {
        borderColor = "#FF0000";
        strokeWidth = 3;
      } else if (isSelected) {
        borderColor = "#cc0000";
        strokeWidth = 2;
      } else if (isSearchMatch) {
        borderColor = "#ccaa00";
        strokeWidth = 1.5;
      }

      const opacity = Math.max(0.8, 1 - depth * 0.02);

      // Calculate font size for header
      const depthAdjustedMin = Math.max(8, minFontSize - 4 - depth * 1.5);
      const heightBasedSize = headerHeight * 0.55;
      const fontSize = Math.min(
        maxFontSize,
        Math.max(depthAdjustedMin, heightBasedSize)
      );

      const actualCharWidth = fontSize * 0.5;
      const indicatorSize = Math.min(12, headerHeight * 0.4, fontSize * 0.8);
      const totalIndicatorSpace =
        (hasHiddenChildren ? indicatorSize + 4 : 0) +
        (unrenderedInfo.hasUnrendered ? indicatorSize + 4 : 0);

      const textPaddingLeft = 4;
      const textPaddingRight = 2 + totalIndicatorSpace;
      const availableTextWidth = Math.max(
        0,
        ln.w - textPaddingLeft - textPaddingRight
      );

      const displayLabel = getDynamicNodeDisplayLabel(
        {
          data: ln.node,
          width: availableTextWidth,
          height: headerHeight,
        },
        { ...settings, avgCharPixelWidth: actualCharWidth }
      );

      const shouldShowLabel =
        settings.enableLabel && displayLabel && ln.w >= 20 && headerHeight >= 8;

      containers.push({
        id: ln.node.id,
        node: ln.node,
        x: ln.x,
        y: ln.y,
        w: ln.w,
        h: ln.h,
        headerHeight,
        depth,
        renderOrder: currentRenderOrder,
        color,
        borderColor,
        strokeWidth,
        opacity,
        groupBorderColor,
        groupStrokeWidth,
        groupOpacity,
        groupFillColor,
        isSelected,
        isSearchMatch,
        displayLabel: displayLabel || "",
        fontSize,
        textColor: getContrastingTextColor(color),
        shouldShowLabel: Boolean(shouldShowLabel),
        hasUnrenderedChildren: unrenderedInfo.hasUnrendered,
        unrenderedCount: unrenderedInfo.unrenderedCount,
        hasHiddenChildren,
        hiddenChildrenCount,
      });
    }

    // Then process leaves at this depth level
    for (const { node: ln, depth } of leavesAtDepth) {
      const currentRenderOrder = renderOrder++;

      // Common properties
      const category = ln.node.category;
      const baseColor = pastelSet[category] || pastelSet[NodeCategory.Other];
      const isSelected = selectedNodeId === ln.node.id;
      const isSearchMatch = matchingNodes.has(ln.node.id);

      // Get unrendered children info
      const unrenderedInfo = hasUnrenderedChildrenHelper(ln.node, ln);

      // Get hidden children info
      const meta = (ln.node as any).meta || {};
      const hasHiddenChildren =
        meta.hasHiddenChildren === true ||
        (ln.node as any).hasHiddenChildren === true;
      const hiddenChildrenCount =
        meta.hiddenChildrenCount || (ln.node as any).hiddenChildrenCount || 0;

      if (ln.renderMode === "box") {
        // Box mode - treat as leaf with special styling
        const isContainerBox = (ln as HierarchicalLayoutNode).isContainer;

        let borderColor = "#6c757d";
        let strokeWidth = 1;

        if (isContainerBox) {
          strokeWidth = 3;
          borderColor = "#2c3e50";
        }

        if (isSelected) {
          borderColor = "red";
          strokeWidth = isContainerBox ? 4 : 2;
        } else if (isSearchMatch) {
          borderColor = "#FFD700";
          strokeWidth = isContainerBox ? 3.5 : 1.5;
        }

        leaves.push({
          id: ln.node.id,
          node: ln.node,
          x: ln.x,
          y: ln.y,
          w: ln.w,
          h: ln.h,
          depth,
          renderOrder: currentRenderOrder,
          color: baseColor,
          borderColor,
          strokeWidth,
          opacity: isContainerBox ? 0.8 : 0.7,
          isSelected,
          isSearchMatch,
          displayLabel: "", // Box mode doesn't show text
          fontSize: 0,
          textColor: "",
          shouldShowLabel: false,
          hasUnrenderedChildren: false,
          unrenderedCount: 0,
          hasHiddenChildren: Boolean(isContainerBox),
          hiddenChildrenCount: 0,
        });
      } else {
        // Leaf node
        let borderColor = "#555555";
        let strokeWidth = Math.max(0.5, settings.borderWidth - depth * 0.1);

        if (unrenderedInfo.hasUnrendered) {
          borderColor = "#FF0000";
          strokeWidth = 4;
        } else if (isSelected) {
          borderColor = "red";
          strokeWidth = Math.max(1, settings.borderWidth + 1 - depth * 0.2);
        } else if (isSearchMatch) {
          borderColor = "#FFD700";
          strokeWidth = Math.max(0.8, settings.borderWidth + 0.5 - depth * 0.1);
        }

        const opacity = Math.max(0.6, settings.nodeOpacity - depth * 0.02);

        // Calculate font size for leaf
        const depthAdjustedMin = Math.max(
          minFontSize,
          minFontSize + 6 - depth * 1.5
        );
        const heightBasedSize = ln.h * 0.6;
        const fontSize = Math.min(
          maxFontSize,
          Math.max(depthAdjustedMin, heightBasedSize)
        );

        const actualCharWidth = fontSize * 0.5;
        const indicatorSize = Math.min(10, ln.h * 0.3, fontSize * 0.7);
        const totalIndicatorMargin =
          (hasHiddenChildren ? indicatorSize + 2 : 0) +
          (unrenderedInfo.hasUnrendered ? indicatorSize + 2 : 0);

        const textMargin = 4;
        const availableTextWidth = Math.max(
          0,
          ln.w - 2 * textMargin - totalIndicatorMargin
        );

        const displayLabel = getDynamicNodeDisplayLabel(
          { data: ln.node, width: availableTextWidth, height: ln.h },
          { ...settings, avgCharPixelWidth: actualCharWidth }
        );

        const shouldShowLabel =
          settings.enableLabel &&
          displayLabel &&
          ln.h >= Math.max(settings.minLabelHeight, fontSize + 4) &&
          ln.w >= fontSize * 2;

        leaves.push({
          id: ln.node.id,
          node: ln.node,
          x: ln.x,
          y: ln.y,
          w: ln.w,
          h: ln.h,
          depth,
          renderOrder: currentRenderOrder,
          color: baseColor,
          borderColor,
          strokeWidth,
          opacity,
          isSelected,
          isSearchMatch,
          displayLabel: displayLabel || "",
          fontSize,
          textColor: getContrastingTextColor(baseColor),
          shouldShowLabel: Boolean(shouldShowLabel),
          hasUnrenderedChildren: unrenderedInfo.hasUnrendered,
          unrenderedCount: unrenderedInfo.unrenderedCount,
          hasHiddenChildren,
          hiddenChildrenCount,
        });
      }
    }
  }

  return { containers, leaves };
};
