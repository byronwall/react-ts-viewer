import { ScopeNode } from "../../types";

// Base structure for all layout nodes, similar to other layouts
export interface BaseLayoutNode {
  node: ScopeNode;
  x: number;
  y: number;
  w: number;
  h: number;
  children?: HierarchicalLayoutNode[];
  parent?: HierarchicalLayoutNode;
  isContainer?: boolean; // True if it's a container with a header and children area
  renderMode?: "text" | "box" | "none"; // How the node should be rendered
  depth: number;
}

export interface HierarchicalLayoutNode extends BaseLayoutNode {
  // Add any specific properties for hierarchical layout nodes if needed
}

export interface HierarchicalLayoutOptions {
  headerHeight: number;
  padding: number; // General padding for within containers
  leafMinWidth: number;
  leafMinHeight: number;
  leafPrefWidth: number;
  leafPrefHeight: number;
  leafMinAspectRatio: number;
  leafMaxAspectRatio: number;
  // Packer choice could be an option later
  // valueAccessor: (node: ScopeNode) => number; // To get the 'value' for sizing
}

// --- 2D Bin Packer (Simple Shelf Packer Implementation) ---
interface PackerInputItem {
  id: string;
  targetW: number;
  targetH: number;
  node: ScopeNode; // Keep original node for value access or other properties
}

interface PackerPlacement {
  id: string;
  x: number;
  y: number;
  w: number; // Actual width allocated
  h: number; // Actual height allocated
  fits: boolean;
}

interface ISimpleShelfPacker {
  add(item: PackerInputItem): PackerPlacement;
  getPackedHeight(): number;
  reset(): void;
}

class SimpleShelfPacker implements ISimpleShelfPacker {
  private currentX = 0;
  private currentY = 0;
  private currentRowHeight = 0;
  private packedItems: PackerPlacement[] = [];
  private interItemPadding: number; // Renamed for clarity

  constructor(
    private maxWidth: number,
    optionsPadding: number // Still accept original options.padding
  ) {
    // Use a smaller, fixed padding for inter-item and inter-shelf spacing
    // The optionsPadding from settings still defines the contentPackingArea boundary.
    this.interItemPadding = Math.max(1, Math.floor(optionsPadding / 2)); // Or a fixed small value like 2
    // Ensure interItemPadding is at least 1 if optionsPadding is small but non-zero.
    if (optionsPadding > 0 && this.interItemPadding === 0) {
      this.interItemPadding = 1;
    }
    // If optionsPadding is 0, interItemPadding will also be 0.
  }

  add(item: PackerInputItem): PackerPlacement {
    if (item.targetW > this.maxWidth) {
      if (this.currentX > 0) {
        this.currentY += this.currentRowHeight + this.interItemPadding; // Use specific interItemPadding
        this.currentX = 0;
        this.currentRowHeight = 0;
      }
      const placement: PackerPlacement = {
        id: item.id,
        x: this.currentX,
        y: this.currentY,
        w: this.maxWidth,
        h: item.targetH,
        fits: true,
      };
      this.currentY += item.targetH + this.interItemPadding; // Use specific interItemPadding
      this.currentRowHeight = 0;
      this.currentX = 0;
      this.packedItems.push(placement);
      return placement;
    }

    // Check if item fits on current row, considering interItemPadding if currentX > 0
    let fitsOnCurrentRow = false;
    if (this.currentX === 0) {
      // First item on a new shelf
      fitsOnCurrentRow = item.targetW <= this.maxWidth;
    } else {
      // Not the first item, need to account for interItemPadding
      fitsOnCurrentRow =
        this.currentX + this.interItemPadding + item.targetW <= this.maxWidth;
    }

    if (!fitsOnCurrentRow) {
      // Not enough space in the current row, move to the next row
      this.currentY += this.currentRowHeight + this.interItemPadding; // Use specific interItemPadding
      this.currentX = 0;
      this.currentRowHeight = 0;
    }

    const placementX =
      this.currentX === 0 ? 0 : this.currentX + this.interItemPadding;

    const placement: PackerPlacement = {
      id: item.id,
      x: placementX,
      y: this.currentY,
      w: item.targetW,
      h: item.targetH,
      fits: true,
    };

    this.currentX = placementX + item.targetW; // currentX is now end of current item
    this.currentRowHeight = Math.max(this.currentRowHeight, item.targetH);
    this.packedItems.push(placement);
    return placement;
  }

  getPackedHeight(): number {
    if (this.packedItems.length === 0) return 0;
    // The total height is the y-position of the last row (this.currentY)
    // plus the height of the items in that row (this.currentRowHeight).
    // No need to add trailing interItemPadding here as it's space *between* rows or *after* the content.
    return this.currentY + this.currentRowHeight;
  }

  reset(): void {
    this.currentX = 0;
    this.currentY = 0;
    this.currentRowHeight = 0;
    this.packedItems = [];
  }
}

// --- Main Layout Function ---
export type HierarchicalLayoutFn = (
  rootNode: ScopeNode,
  viewportWidth: number,
  viewportHeight: number,
  options: HierarchicalLayoutOptions
) => HierarchicalLayoutNode;

export const layoutHierarchical: HierarchicalLayoutFn = (
  rootNode,
  viewportWidth,
  viewportHeight,
  options
) => {
  const layoutRoot = layoutNodeRecursive(
    rootNode,
    { x: 0, y: 0, w: viewportWidth, h: viewportHeight },
    options,
    0, // depth
    undefined // parent
  );

  // Fallback if layoutRoot is null (should not happen for the root)
  return (
    layoutRoot || {
      node: rootNode,
      x: 0,
      y: 0,
      w: viewportWidth,
      h: viewportHeight,
      depth: 0,
      isContainer: !!(rootNode.children && rootNode.children.length > 0),
      renderMode: "text",
    }
  );
};

// --- Recursive Layout Engine ---
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function layoutNodeRecursive(
  node: ScopeNode,
  parentAllocatedSpace: Rect,
  options: HierarchicalLayoutOptions,
  depth: number,
  parentLayoutNode?: HierarchicalLayoutNode
): HierarchicalLayoutNode | null {
  if (parentAllocatedSpace.w <= 0 || parentAllocatedSpace.h <= 0) {
    return null;
  }
  if (
    isNaN(parentAllocatedSpace.w) ||
    isNaN(parentAllocatedSpace.h) ||
    isNaN(parentAllocatedSpace.x) ||
    isNaN(parentAllocatedSpace.y)
  ) {
    // This indicates a severe issue upstream or with initial inputs.
    return null;
  }

  const isEffectivelyLeaf = !node.children || node.children.length === 0;

  const calculatedW = parentAllocatedSpace.w;
  const calculatedH = parentAllocatedSpace.h;

  const currentLayoutNode: HierarchicalLayoutNode = {
    node,
    x: parentAllocatedSpace.x,
    y: parentAllocatedSpace.y,
    w: calculatedW,
    h: calculatedH,
    depth,
    parent: parentLayoutNode,
    children: [],
    isContainer: !isEffectivelyLeaf, // Initially assume container if has children
    renderMode: "text",
  };

  if (isEffectivelyLeaf) {
    // --- Handle Leaf Node ---
    // Apply heuristics: min/pref size, aspect ratio. Fit within parentAllocatedSpace.
    let targetW = Math.max(options.leafMinWidth, options.leafPrefWidth);
    let targetH = Math.max(options.leafMinHeight, options.leafPrefHeight);

    // Aspect ratio adjustment (simplified)
    // If too wide for aspect ratio: h = w / maxAspect
    // If too tall for aspect ratio: w = h * maxAspect (or w = h / minAspect if defined that way)
    // This needs more sophisticated logic to balance prefSize and aspectRatio within allocated space.

    // For now, just try to fit preferred, then scale down if needed.
    if (targetW > parentAllocatedSpace.w) {
      const scale = parentAllocatedSpace.w / targetW;
      targetW = parentAllocatedSpace.w;
      targetH *= scale;
    }
    if (targetH > parentAllocatedSpace.h) {
      const scale = parentAllocatedSpace.h / targetH;
      targetH = parentAllocatedSpace.h;
      targetW *= scale; // Maintain aspect ratio from previous adjustment
    }

    currentLayoutNode.w = Math.max(options.leafMinWidth, targetW);
    currentLayoutNode.h = Math.max(options.leafMinHeight, targetH);

    // Ensure it still fits after min enforcement (could clip if min is larger than allocated)
    currentLayoutNode.w = Math.min(currentLayoutNode.w, parentAllocatedSpace.w);
    currentLayoutNode.h = Math.min(currentLayoutNode.h, parentAllocatedSpace.h);
    console.log(
      `[layoutNodeRecursive] LEAF FINAL: ${node.label} (ID: ${node.id})`,
      {
        finalW: currentLayoutNode.w,
        finalH: currentLayoutNode.h,
        parentW: parentAllocatedSpace.w,
        parentH: parentAllocatedSpace.h,
        parentX: parentAllocatedSpace.x,
        parentY: parentAllocatedSpace.y,
      }
    );

    currentLayoutNode.isContainer = false; // It's a leaf
  } else {
    // --- Handle Container Node ---
    currentLayoutNode.isContainer = true;
    const headerActualHeight = Math.min(
      options.headerHeight,
      parentAllocatedSpace.h
    );

    const contentPackingArea: Rect = {
      x: 0, // Relative to container's own (0,0)
      y: headerActualHeight,
      w: parentAllocatedSpace.w - 2 * options.padding, // Account for L/R padding
      h: parentAllocatedSpace.h - headerActualHeight - 2 * options.padding, // Account for T/B padding (header + bottom)
    };

    if (contentPackingArea.w <= 0 || contentPackingArea.h <= 0) {
      // Not enough space for content, render as box or nothing
      currentLayoutNode.h = headerActualHeight; // Only header might be visible
      currentLayoutNode.children = [];
      if (headerActualHeight < options.leafMinHeight) {
        currentLayoutNode.renderMode = "none";
      }
      return currentLayoutNode;
    }

    const packer = new SimpleShelfPacker(contentPackingArea.w, options.padding);

    const childrenToLayout = node.children || [];
    // Separate into childContainers and looseLeafs (simplified: treat all children similarly for now)
    // TODO: Implement sorting and proportional allocation for child containers as per layout3.md

    const sortedChildren = [...childrenToLayout].sort(
      (a, b) => (b.value || 0) - (a.value || 0)
    );

    const totalChildrenValue =
      childrenToLayout.reduce((sum, child) => sum + (child.value || 1), 0) || 1;

    for (const childNode of sortedChildren) {
      // Estimate child size
      const isChildContainer =
        childNode.children && childNode.children.length > 0;
      let childTargetW, childTargetH;

      if (isChildContainer) {
        const childValueRatio = (childNode.value || 1) / totalChildrenValue;

        const targetArea =
          contentPackingArea.w * contentPackingArea.h * childValueRatio;
        let idealDimension = Math.sqrt(targetArea);
        if (isNaN(idealDimension) || idealDimension === 0)
          idealDimension = options.leafMinWidth; // Fallback

        childTargetW = idealDimension;
        childTargetH = idealDimension;

        // Cap by available space
        childTargetW = Math.min(childTargetW, contentPackingArea.w);
        childTargetH = Math.min(childTargetH, contentPackingArea.h);
      } else {
        // Is a Leaf
        childTargetW = options.leafPrefWidth;
        childTargetH = options.leafPrefHeight;
      }

      childTargetW = Math.max(options.leafMinWidth, childTargetW);
      // For containers, ensure targetH can accommodate at least a minimal content area + header
      // For leaves, just ensure min height.
      const minHeightForChild = isChildContainer
        ? options.leafMinHeight + options.headerHeight
        : options.leafMinHeight;
      childTargetH = Math.max(minHeightForChild, childTargetH);

      // Ensure target dimensions for packer do not exceed available packing area dimensions
      // The packer operates with contentPackingArea.w as its maxWidth, so childTargetW will be capped by packer if it tries to exceed.
      // Explicitly cap targetH here.
      childTargetW = Math.min(childTargetW, contentPackingArea.w);
      childTargetH = Math.min(childTargetH, contentPackingArea.h);

      // Packer input
      const packerInput: PackerInputItem = {
        id: childNode.id,
        targetW: childTargetW,
        targetH: childTargetH,
        node: childNode,
      };

      const placement = packer.add(packerInput);

      if (placement.fits) {
        // SimpleShelfPacker always sets fits = true
        const allocatedCellForChild: Rect = {
          x: parentAllocatedSpace.x + options.padding + placement.x, // Convert to absolute
          y:
            parentAllocatedSpace.y +
            headerActualHeight +
            options.padding +
            placement.y, // Convert to absolute
          w: placement.w,
          h: placement.h,
        };

        // Ensure child allocation does not exceed the content packing area boundaries
        // placement.x and placement.y are relative to contentPackingArea's origin (top-left of the area where children are packed).
        // contentPackingArea.w and contentPackingArea.h are the dimensions of this packing area.
        const childMaxW = contentPackingArea.w - placement.x;
        const childMaxH = contentPackingArea.h - placement.y;

        allocatedCellForChild.w = Math.min(allocatedCellForChild.w, childMaxW);
        allocatedCellForChild.h = Math.min(allocatedCellForChild.h, childMaxH);

        // Ensure dimensions are positive before recursing
        if (allocatedCellForChild.w > 0 && allocatedCellForChild.h > 0) {
          const laidOutChild = layoutNodeRecursive(
            childNode,
            allocatedCellForChild,
            options,
            depth + 1,
            currentLayoutNode
          );
          if (laidOutChild) {
            currentLayoutNode.children?.push(laidOutChild);
            console.log(
              `[layoutNodeRecursive] CHILD (in ${node.label} container, ID: ${node.id}) - LAID OUT: ${childNode.label} (ID: ${childNode.id})`,
              {
                childAllocatedW: allocatedCellForChild.w,
                childAllocatedH: allocatedCellForChild.h,
                childAllocatedX: allocatedCellForChild.x,
                childAllocatedY: allocatedCellForChild.y,
                childFinalW: laidOutChild.w,
                childFinalH: laidOutChild.h,
                childFinalX: laidOutChild.x,
                childFinalY: laidOutChild.y,
                parentContainerW: currentLayoutNode.w, // Parent container's current calculated width
                parentContainerH: currentLayoutNode.h, // Parent container's current calculated height
              }
            );
          }
        }
        // If allocatedCellForChild.w or .h is <= 0, the child is effectively skipped
        // as it cannot be rendered in a zero or negative space. The recursive call
        // would also return null in such cases due to its initial checks.
      }
      // No explicit 'else' for placement.fits as SimpleShelfPacker always returns fits: true.
      // If a packer could return fits: false, handling for that would go here.
    }

    // Determine Container's Final Dimensions
    const packedContentHeight = packer.getPackedHeight();
    currentLayoutNode.w = parentAllocatedSpace.w; // Typically takes full allocated width
    currentLayoutNode.h = Math.min(
      parentAllocatedSpace.h,
      headerActualHeight +
        packedContentHeight +
        (packedContentHeight > 0 ? options.padding * 2 : options.padding) // top padding is part of contentPackingArea.y
    );
    console.log(
      `[layoutNodeRecursive] CONTAINER FINAL: ${node.label} (ID: ${node.id})`,
      {
        finalW: currentLayoutNode.w,
        finalH: currentLayoutNode.h,
        parentAllocatedW: parentAllocatedSpace.w,
        parentAllocatedH: parentAllocatedSpace.h,
        packedContentHeight,
        headerActualHeight,
        optionsPadding: options.padding,
      }
    );

    if (
      currentLayoutNode.children &&
      currentLayoutNode.children.length === 0 &&
      packedContentHeight === 0
    ) {
      // If it was supposed to be a container but has no visible children and no packed height
      // currentLayoutNode.isContainer = false; // Re-evaluate if it should render as a simple box/leaf
      // or just show header
      currentLayoutNode.h = headerActualHeight;
    }
  }

  // Ensure node dimensions are not smaller than minimums if it's not 'none'
  if (currentLayoutNode.renderMode !== "none") {
    if (
      currentLayoutNode.w < options.leafMinWidth &&
      currentLayoutNode.h < options.leafMinHeight
    ) {
      // if too small for even a leaf, make it none.
      // This is a tough call, might need different min for container vs leaf.
      // For now, if smaller than a leaf's min, it's probably not useful.
      // currentLayoutNode.renderMode = "none"; // Decided against auto-setting to none here, let rendering handle small items.
    } else {
      // currentLayoutNode.w = Math.max(currentLayoutNode.w, options.leafMinWidth);
      // currentLayoutNode.h = Math.max(currentLayoutNode.h, options.leafMinHeight);
    }
  }
  if (
    isNaN(currentLayoutNode.w) ||
    isNaN(currentLayoutNode.h) ||
    isNaN(currentLayoutNode.x) ||
    isNaN(currentLayoutNode.y)
  ) {
    // Provide default values to prevent SVG errors, though layout will be wrong.
    currentLayoutNode.x = currentLayoutNode.x || 0;
    currentLayoutNode.y = currentLayoutNode.y || 0;
    currentLayoutNode.w = currentLayoutNode.w || options.leafMinWidth;
    currentLayoutNode.h = currentLayoutNode.h || options.leafMinHeight;
  }

  return currentLayoutNode;
}
