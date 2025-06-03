import type { ScopeNode } from "../../types";

export interface GeminiLayoutNode {
  node: ScopeNode;
  x: number;
  y: number;
  w: number;
  h: number;
  children?: GeminiLayoutNode[];
  renderMode: "text" | "box" | "none"; // Based on layout2.md (text, small box, or not rendered)
  isContainer: boolean;
  // Add other properties as needed, e.g., for L-shapes or specific rendering info
}

export interface GeminiLayoutOptions {
  minTextWidth?: number; // Default: 80 (layout2.md)
  minTextHeight?: number; // Default: 40 (layout2.md)
  minBoxSize?: number; // Default: 20 (layout2.md)
  padding?: number; // Default: 5
  headerHeight?: number; // Default: 20 (for containers with text renderMode)
  valueAccessor?: (n: ScopeNode) => number; // For proportional sizing
}

export type GeminiLayoutFn = (
  root: ScopeNode,
  w: number,
  h: number,
  opts?: GeminiLayoutOptions
) => GeminiLayoutNode;

// --- Helper Functions ---

const determineNodeRenderMode = (
  node: ScopeNode,
  availableWidth: number,
  availableHeight: number,
  opts: Required<Omit<GeminiLayoutOptions, "valueAccessor">> // valueAccessor is optional here
): "text" | "box" | "none" => {
  const { minTextWidth, minTextHeight, minBoxSize, headerHeight } = opts;
  const isContainer = node.children && node.children.length > 0;

  // Check for 'none' first
  // Ensure minBoxSize is positive to avoid infinite loops or invalid states
  const safeMinBoxSize = Math.max(1, minBoxSize);
  if (availableWidth < safeMinBoxSize || availableHeight < safeMinBoxSize) {
    return "none";
  }
  // If it's a container, it needs space for a header if it's to render text
  const effectiveMinHeightForText = isContainer
    ? Math.max(minTextHeight, headerHeight + safeMinBoxSize)
    : minTextHeight;

  if (
    availableWidth >= minTextWidth &&
    availableHeight >= effectiveMinHeightForText
  ) {
    return "text";
  }
  // If it can't be text, check if it can be a box
  if (availableWidth >= safeMinBoxSize && availableHeight >= safeMinBoxSize) {
    return "box";
  }
  return "none";
};

// SizedNode interface is no longer needed
// const binPackNodes function is no longer needed here, logic incorporated into main layout

// --- Main Layout Function ---
export const geminiLayout: GeminiLayoutFn = (root, w, h, opts = {}) => {
  console.log("[GEMINI LAYOUT CALLED] geminiLayout called with:", {
    root,
    w,
    h,
    opts,
  }); // Ensured log is prominent
  const defaultOpts: Required<GeminiLayoutOptions> = {
    minTextWidth: 80,
    minTextHeight: 40,
    minBoxSize: 20,
    padding: 5,
    headerHeight: 25, // Slightly more for header
    valueAccessor: (n) => n.value || 1, // Default value accessor
  };
  const currentOpts = { ...defaultOpts, ...opts };

  const layoutQueue: {
    node: ScopeNode;
    x: number;
    y: number;
    w: number;
    h: number;
    depth: number;
    parentLayoutNode: GeminiLayoutNode | null;
  }[] = [];

  const rootRenderMode = determineNodeRenderMode(root, w, h, currentOpts);
  if (rootRenderMode === "none") {
    return {
      node: root,
      x: 0,
      y: 0,
      w,
      h,
      renderMode: "none",
      isContainer: false,
    };
  }

  const rootLayoutNode: GeminiLayoutNode = {
    node: root,
    x: 0,
    y: 0,
    w: w,
    h: h,
    renderMode: rootRenderMode,
    isContainer: !!(root.children && root.children.length > 0),
    children: [],
  };

  if (rootLayoutNode.isContainer) {
    layoutQueue.push({
      node: root,
      x: 0,
      y: 0,
      w: w,
      h: h,
      depth: 0,
      parentLayoutNode: rootLayoutNode, // The rootLayoutNode itself acts as parent for its direct children's layout space
    });
  }

  // This will store the final flat list of all laid-out nodes to reconstruct the tree later
  // For now, we'll modify rootLayoutNode and its children directly.

  let head = 0;
  while (head < layoutQueue.length) {
    const currentTask = layoutQueue[head++];
    if (!currentTask) continue;

    const {
      node: parentScopeNode,
      x: parentX, // Absolute X of the current parent container being processed
      y: parentY, // Absolute Y of the current parent container being processed
      w: parentW, // Allocated width for the current parent container
      h: parentH, // Allocated height for the current parent container
      depth,
      parentLayoutNode, // This is the layout node for parentScopeNode
    } = currentTask;

    console.log(
      `[GeminiLayout] Processing parent: ${parentScopeNode.label}, W: ${parentW}, H: ${parentH}, Depth: ${depth}`,
      { parentScopeNode, currentOpts }
    );

    if (
      !parentScopeNode.children ||
      parentScopeNode.children.length === 0 ||
      !parentLayoutNode
    ) {
      continue;
    }

    const isParentTextRender =
      determineNodeRenderMode(
        parentScopeNode,
        parentW, // Use allocated W/H of parent
        parentH,
        currentOpts
      ) === "text";

    const actualHeaderHeight = isParentTextRender
      ? currentOpts.headerHeight
      : 0;

    // Define the area available for children, *within* the parent container
    const childrenAreaXOffset = currentOpts.padding; // X offset from parent's X
    const childrenAreaYOffset = actualHeaderHeight + currentOpts.padding; // Y offset from parent's Y

    const childrenAvailableWidth = parentW - 2 * currentOpts.padding;
    const childrenAvailableHeight =
      parentH - actualHeaderHeight - 2 * currentOpts.padding;

    console.log(
      `[GeminiLayout] Children area for ${parentScopeNode.label}: availableW=${childrenAvailableWidth}, availableH=${childrenAvailableHeight}, headerH=${actualHeaderHeight}, padding=${currentOpts.padding}`
    );

    // Ensure safeMinBoxSize is positive
    const safeMinBoxSize = Math.max(1, currentOpts.minBoxSize);

    if (
      childrenAvailableWidth < safeMinBoxSize ||
      childrenAvailableHeight < safeMinBoxSize
    ) {
      // Not enough space to render any children
      // console.log(`No space for children of ${parentScopeNode.label}: W ${childrenAvailableWidth}, H ${childrenAvailableHeight}`);
      parentLayoutNode.children = []; // Ensure children array is empty
      continue;
    }

    // --- New Children Layout Logic ---
    const childrenToLayout = parentScopeNode.children;
    const laidOutChildren: GeminiLayoutNode[] = [];

    if (childrenToLayout.length > 0) {
      let currentChildRelativeX = 0;
      let currentChildRelativeY = 0;
      let currentRowTallestNodeHeight = 0;

      console.log(
        `[GeminiLayout] Children area for ${parentScopeNode.label}: availableW=${childrenAvailableWidth}, availableH=${childrenAvailableHeight}, headerH=${actualHeaderHeight}, padding=${currentOpts.padding}`
      );

      if (
        childrenAvailableWidth >= safeMinBoxSize &&
        childrenAvailableHeight >= safeMinBoxSize
      ) {
        const totalChildrenValue = childrenToLayout.reduce(
          (sum, child) => sum + currentOpts.valueAccessor(child),
          0
        );

        for (const childNode of childrenToLayout) {
          let initialAllocatedW;
          const childValue = currentOpts.valueAccessor(childNode);
          if (totalChildrenValue > 0) {
            initialAllocatedW =
              (childValue / totalChildrenValue) * childrenAvailableWidth;
          } else {
            initialAllocatedW =
              childrenAvailableWidth / childrenToLayout.length;
          }
          initialAllocatedW = Math.max(safeMinBoxSize, initialAllocatedW);
          // initialAllocatedW can be wider than childrenAvailableWidth if it's the only child, will be capped later by finalW

          let targetX = currentChildRelativeX;
          let targetY = currentChildRelativeY;
          let targetRowTallestSoFar = currentRowTallestNodeHeight; // Tallest in current row *before* this child

          // Check for wrapping based on initialAllocatedW (capped at available width for the check itself)
          if (
            targetX > 0 &&
            targetX + Math.min(initialAllocatedW, childrenAvailableWidth) >
              childrenAvailableWidth + 0.001
          ) {
            targetX = 0;
            targetY += targetRowTallestSoFar + currentOpts.padding;
            targetRowTallestSoFar = 0; // Reset for new row height calculation
          }

          const heightAvailableForThisRow = childrenAvailableHeight - targetY;

          if (heightAvailableForThisRow < safeMinBoxSize) {
            console.warn(
              `[GeminiLayout] Not enough vertical space for new row (for ${childNode.label} in ${parentScopeNode.label}). Row Y: ${targetY}, Available H for row: ${heightAvailableForThisRow}. Skipping remaining children.`
            );
            break;
          }

          let finalW = Math.min(initialAllocatedW, childrenAvailableWidth); // Cap width to container's available width
          finalW = Math.max(safeMinBoxSize, finalW); // Ensure min width

          let childRenderMode = determineNodeRenderMode(
            childNode,
            finalW,
            heightAvailableForThisRow,
            currentOpts
          );

          if (childRenderMode === "none") {
            if (finalW > safeMinBoxSize) {
              const modeAtMinBox = determineNodeRenderMode(
                childNode,
                safeMinBoxSize,
                heightAvailableForThisRow,
                currentOpts
              );
              if (modeAtMinBox !== "none") {
                finalW = safeMinBoxSize;
                childRenderMode = modeAtMinBox;
              } else {
                console.log(
                  `[GeminiLayout] Child ${childNode.label} is 'none' even at minBoxSize width (W:${safeMinBoxSize}, AvailHForRow:${heightAvailableForThisRow}). Skipping.`
                );
                continue;
              }
            } else {
              console.log(
                `[GeminiLayout] Child ${childNode.label} is 'none' (W:${finalW}, AvailHForRow:${heightAvailableForThisRow}). Skipping.`
              );
              continue;
            }
          }

          let finalH;
          const isChildContainer = !!(
            childNode.children && childNode.children.length > 0
          );

          if (isChildContainer) {
            if (childRenderMode === "text") {
              finalH = heightAvailableForThisRow; // Text-header container takes full available height in its row
            } else {
              // "box" mode for container header
              finalH = Math.min(
                heightAvailableForThisRow,
                finalW,
                currentOpts.minBoxSize * 2
              ); // Squarish
              finalH = Math.max(finalH, currentOpts.minBoxSize);
            }
          } else {
            // Leaf
            if (childRenderMode === "text") {
              finalH = Math.min(
                heightAvailableForThisRow,
                currentOpts.minTextHeight
              );
            } else {
              // "box" mode for leaf
              finalH = Math.min(
                heightAvailableForThisRow,
                currentOpts.minBoxSize
              );
            }
          }
          finalH = Math.max(safeMinBoxSize, finalH);
          finalH = Math.min(finalH, heightAvailableForThisRow); // Re-clamp to ensure it doesn't exceed row's capacity

          if (
            finalW < safeMinBoxSize ||
            finalH < safeMinBoxSize ||
            targetY + finalH > childrenAvailableHeight + 0.001
          ) {
            console.warn(
              `[GeminiLayout] Child ${childNode.label} (W:${finalW}, H:${finalH}) overflows vertically (Y:${targetY}, ChildH:${finalH}, AvailTotalH:${childrenAvailableHeight}) or is too small in ${parentScopeNode.label}. Skipping remaining children.`
            );
            break;
          }

          laidOutChildren.push({
            node: childNode,
            x: targetX,
            y: targetY,
            w: finalW,
            h: finalH,
            renderMode: childRenderMode,
            isContainer: isChildContainer,
            children: [],
          });

          // Update state for the *next* child's placement decision
          currentChildRelativeX = targetX + finalW + currentOpts.padding;
          currentChildRelativeY = targetY; // Y position of the current row, doesn't change until a wrap FOR THE NEXT child
          currentRowTallestNodeHeight = Math.max(targetRowTallestSoFar, finalH); // Tallest in current row *including* this child

          // If this child filled the current row, next child starts on a new row
          if (currentChildRelativeX >= childrenAvailableWidth - 0.001) {
            currentChildRelativeX = 0;
            currentChildRelativeY +=
              currentRowTallestNodeHeight + currentOpts.padding;
            currentRowTallestNodeHeight = 0;
          }
        }
      }
    }
    // --- End New Children Layout Logic ---
    console.log(
      `[GeminiLayout] Laid out children for ${parentScopeNode.label} (relative):`,
      JSON.parse(JSON.stringify(laidOutChildren))
    );

    parentLayoutNode.children = laidOutChildren.map((relativeChildNode) => {
      const finalChildLayoutNode: GeminiLayoutNode = {
        node: relativeChildNode.node,
        x: parentX + childrenAreaXOffset + relativeChildNode.x, // Absolute X on canvas
        y: parentY + childrenAreaYOffset + relativeChildNode.y, // Absolute Y on canvas
        w: relativeChildNode.w, // Allocated width for this child
        h: relativeChildNode.h, // Allocated height for this child
        renderMode: relativeChildNode.renderMode,
        isContainer: relativeChildNode.isContainer,
        children: [], // Will be populated by recursive calls if it's a container
      };

      if (finalChildLayoutNode.isContainer) {
        // Add this child to the queue to process its children
        // CRITICAL: Pass its *allocated* w and h for its own children's layout
        layoutQueue.push({
          node: finalChildLayoutNode.node,
          x: finalChildLayoutNode.x,
          y: finalChildLayoutNode.y,
          w: finalChildLayoutNode.w, // Use the allocated width
          h: finalChildLayoutNode.h, // Use the allocated height
          depth: depth + 1,
          parentLayoutNode: finalChildLayoutNode,
        });
      }
      return finalChildLayoutNode;
    });
  }

  return rootLayoutNode;
};
