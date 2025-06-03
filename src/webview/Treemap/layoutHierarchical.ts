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

  constructor(
    private maxWidth: number,
    private padding: number
  ) {}

  add(item: PackerInputItem): PackerPlacement {
    if (item.targetW > this.maxWidth) {
      // Item is wider than the container, try to place it alone if possible
      if (this.currentX > 0) {
        // Start a new row
        this.currentY += this.currentRowHeight + this.padding;
        this.currentX = 0;
        this.currentRowHeight = 0;
      }
      const placement: PackerPlacement = {
        id: item.id,
        x: this.currentX,
        y: this.currentY,
        w: this.maxWidth, // Take full width
        h: item.targetH,
        fits: true,
      };
      this.currentY += item.targetH + this.padding;
      this.currentRowHeight = 0; // Reset row height as this item takes its own "row"
      this.currentX = 0;
      this.packedItems.push(placement);
      return placement;
    }

    if (this.currentX + item.targetW > this.maxWidth) {
      // Not enough space in the current row, move to the next row
      this.currentY += this.currentRowHeight + this.padding;
      this.currentX = 0;
      this.currentRowHeight = 0;
    }

    const placement: PackerPlacement = {
      id: item.id,
      x: this.currentX,
      y: this.currentY,
      w: item.targetW,
      h: item.targetH,
      fits: true, // Assume it fits for this simple packer
    };

    this.currentX += item.targetW + this.padding;
    this.currentRowHeight = Math.max(this.currentRowHeight, item.targetH);
    this.packedItems.push(placement);
    return placement;
  }

  getPackedHeight(): number {
    if (this.packedItems.length === 0) return 0;
    // Calculate based on the Y position of the last item and its height
    // Or more simply, currentY + currentRowHeight if anything is in the current row
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
  // console.log(
  //   `[layoutNodeRecursive] Node: ${node.label} (${node.id}), Depth: ${depth}`,
  //   { parentAllocatedSpace, calculatedW, calculatedH, isEffectivelyLeaf }
  // );

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
    // console.log(
    //   `[layoutNodeRecursive] Leaf: ${node.label} (Value: ${node.value}), Initial targetW/H:`,
    //   {
    //     targetW,
    //     targetH,
    //     parentAllocatedSpaceW: parentAllocatedSpace.w,
    //     parentAllocatedSpaceH: parentAllocatedSpace.h,
    //   }
    // );

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

    // console.log(
    //   `[layoutNodeRecursive] Leaf: ${node.label} (Value: ${node.value}), After min enforcement:`,
    //   { w: currentLayoutNode.w, h: currentLayoutNode.h }
    // );

    // Ensure it still fits after min enforcement (could clip if min is larger than allocated)
    currentLayoutNode.w = Math.min(currentLayoutNode.w, parentAllocatedSpace.w);
    currentLayoutNode.h = Math.min(currentLayoutNode.h, parentAllocatedSpace.h);
    // console.log(
    //   `[layoutNodeRecursive] Leaf: ${node.label} (Value: ${node.value}), Final leaf W/H:`,
    //   {
    //     w: currentLayoutNode.w,
    //     h: currentLayoutNode.h,
    //   }
    // );

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
    // console.log(
    //   `[layoutNodeRecursive] Container: ${node.label}, ContentPackingArea:`,
    //   { contentPackingArea, headerActualHeight }
    // );
    // console.log(
    //   `[layoutNodeRecursive] Container: ${node.label}, Children values:`,
    //   node.children?.map((c) => ({ label: c.label, value: c.value }))
    // );

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
    // console.log(
    //   `[layoutNodeRecursive] Container: ${node.label}, Sorted children for packing:`,
    //   sortedChildren.map((c) => ({ label: c.label, value: c.value, id: c.id }))
    // );

    const totalChildrenValue =
      childrenToLayout.reduce((sum, child) => sum + (child.value || 1), 0) || 1;
    // console.log(
    //   `[layoutNodeRecursive] Container: ${node.label}, Total children value: ${totalChildrenValue}`
    // );

    for (const childNode of sortedChildren) {
      // Estimate child size
      const isChildContainer =
        childNode.children && childNode.children.length > 0;
      let childTargetW, childTargetH;

      if (isChildContainer) {
        const childValueRatio = (childNode.value || 1) / totalChildrenValue;
        // childTargetH = contentPackingArea.h * childValueRatio;
        // childTargetW = Math.min(options.leafPrefWidth * 2, contentPackingArea.w); // Aim for preferred width, capped by available space. Multiply by 2 for containers for now.

        const targetArea =
          contentPackingArea.w * contentPackingArea.h * childValueRatio;
        let idealDimension = Math.sqrt(targetArea);
        if (isNaN(idealDimension) || idealDimension === 0)
          idealDimension = options.leafMinWidth; // Fallback

        childTargetW = idealDimension;
        childTargetH = idealDimension; // This is for the whole container, including header space conceptually

        // Cap by available space
        childTargetW = Math.min(childTargetW, contentPackingArea.w);
        childTargetH = Math.min(childTargetH, contentPackingArea.h);

        // console.log(
        //   `[layoutNodeRecursive] Child Container ${childNode.label} (Value: ${childNode.value}, Ratio: ${childValueRatio.toFixed(2)}) of ${node.label}: Estimated AreaShare W: ${childTargetW.toFixed(2)}, H: ${childTargetH.toFixed(2)} (TargetArea: ${targetArea.toFixed(2)})`
        // );
      } else {
        // Is a Leaf
        childTargetW = options.leafPrefWidth;
        childTargetH = options.leafPrefHeight;
        // console.log(
        //   `[layoutNodeRecursive] Child Leaf ${childNode.label} (Value: ${childNode.value}) of ${node.label}: Estimated W/H (preferred): ${childTargetW}/${childTargetH}`
        // );
      }

      // !!! Add specific log here to check options right before Math.max
      // console.log(
      //   `[layoutNodeRecursive] Child ${childNode.label} of ${node.label}: Checking options before Math.max:`,
      //   {
      //     options_leafMinWidth: options.leafMinWidth,
      //     options_leafMinHeight: options.leafMinHeight,
      //     childTargetW_before_max: childTargetW,
      //     childTargetH_before_max: childTargetH,
      //   }
      // );

      childTargetW = Math.max(options.leafMinWidth, childTargetW);
      // For containers, ensure targetH can accommodate at least a minimal content area + header
      // For leaves, just ensure min height.
      const minHeightForChild = isChildContainer
        ? options.leafMinHeight + options.headerHeight
        : options.leafMinHeight;
      childTargetH = Math.max(minHeightForChild, childTargetH);
      // console.log(
      //   `[layoutNodeRecursive] Child ${childNode.label} of ${node.label}: After min enforcement W/H: `,
      //   { childTargetW, childTargetH }
      // );

      // Packer input
      const packerInput: PackerInputItem = {
        id: childNode.id,
        targetW: childTargetW,
        targetH: childTargetH,
        node: childNode,
      };
      // console.log(
      //   `[layoutNodeRecursive] Child ${childNode.label} (Value: ${childNode.value}) of ${node.label}: Packer input:`,
      //   { packerInput }
      // );

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
    // console.log(
    //   `[layoutNodeRecursive] Container: ${node.label}, Final W/H based on packed content:`,
    //   {
    //     w: currentLayoutNode.w,
    //     h: currentLayoutNode.h,
    //     packedContentHeight,
    //     headerActualHeight,
    //   }
    // );

    if (
      currentLayoutNode.children &&
      currentLayoutNode.children.length === 0 &&
      packedContentHeight === 0
    ) {
      // If it was supposed to be a container but has no visible children and no packed height
      // currentLayoutNode.isContainer = false; // Re-evaluate if it should render as a simple box/leaf
      // or just show header
      currentLayoutNode.h = headerActualHeight;
      // console.log(
      //   `[layoutNodeRecursive] Container: ${node.label}, No visible children, setting height to header height: ${headerActualHeight}`
      // );
    }
  }

  // Ensure node dimensions are not smaller than minimums if it's not 'none'
  if (currentLayoutNode.renderMode !== "none") {
    if (
      currentLayoutNode.w < options.leafMinWidth &&
      currentLayoutNode.h < options.leafMinHeight
    ) {
      // console.warn(
      //   `[layoutNodeRecursive] Node ${node.label} is too small (${currentLayoutNode.w}x${currentLayoutNode.h}), smaller than leaf min (${options.leafMinWidth}x${options.leafMinHeight}). Setting renderMode to 'none'.`
      // );
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
    // console.error(
    //   "[layoutNodeRecursive] FINAL NaN detected in currentLayoutNode dimensions for node:",
    //   { nodeID: node.id, label: node.label, currentLayoutNode }
    // );
    // Provide default values to prevent SVG errors, though layout will be wrong.
    currentLayoutNode.x = currentLayoutNode.x || 0;
    currentLayoutNode.y = currentLayoutNode.y || 0;
    currentLayoutNode.w = currentLayoutNode.w || options.leafMinWidth;
    currentLayoutNode.h = currentLayoutNode.h || options.leafMinHeight;
    // console.error("[layoutNodeRecursive] Applied fallback for NaN values:", {
    //   currentLayoutNode,
    // });
  }

  return currentLayoutNode;
}
