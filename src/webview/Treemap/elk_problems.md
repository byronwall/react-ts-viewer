# Problems with ELK LAyout and Reference + Scope Graph

Review the problem description in this file and figure out how to fix it. Implement those fixes. I will update the MD and we'll iterate until things are completely solved. Place an empahsis on concise but well placed logs that will help spot problems. I will be pasting them back in here.

## Problems

- A entry shows up for `if(isPreview)` but it is linked to a random `return` statement. isPreview is coming from a destructured assignment from the `props` parameter to the parent function. There should be a synthetic node created for the destructured assignment. The arrow should point to the synthetic node. There should not be an arrow to the `return` statement. It looks like maybe the problem is the inclusion of a default value on the destructured assignment? Investigate.
- There are a bunch of arrows to the wrong places in the if/else if/else blocks. Specifically, the incoming arrows should point to child nodes where needed. The `offsetY` variable is internal to the scope so it should not be counted as a reference. That is, there are no external refs directly referenced in the `if/else if/else` blocks.
- There should be several add'l synthetic nodes inside the `onResizeStart` call. That call has several parameters which include `block`, `blockStart`, `blockEnd`, `e`. The `block` related ones are external and should get synthetic nodes.

## Test Scenario

With the treemap loaded for the code below, I `SHIFT + CLICK` on the `handleMouseDown` scope.

```tsx
"use client";
import { Link, Lock } from "lucide-react";
import { type MouseEvent, type RefObject } from "react";

import { cn } from "~/lib/utils";
import { useEditTaskStore } from "~/stores/useEditTaskStore";

import { type TimeBlockWithPosition } from "./WeeklyCalendar";

export type TimeBlockProps = {
  block: TimeBlockWithPosition & {
    isClippedStart?: boolean;
    isClippedEnd?: boolean;
  };
  onDragStart: (
    blockId: string,
    offset: { x: number; y: number },
    e: MouseEvent
  ) => void;
  onResizeStart: (
    blockId: string,
    edge: "top" | "bottom",
    startTime: Date,
    endTime: Date,
    e: MouseEvent
  ) => void;
  isPreview?: boolean;
  startHour: number;
  endHour: number;
  gridRef: RefObject<HTMLDivElement>;
  isClipped?: boolean;
  topOffset?: number;
  numberOfDays?: number;
  weekStart: Date;
  blockHeight?: number;
};

export function TimeBlock({
  block,
  onDragStart,
  onResizeStart,
  isPreview = false,
  isClipped = false,
}: TimeBlockProps) {
  const openEditDialog = useEditTaskStore((state) => state.open);
  const blockStart = block.startTime;
  const blockEnd = block.endTime;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isPreview) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    // Check if clicking on resize handles
    if (offsetY < 8) {
      onResizeStart(block.id, "top", blockStart, blockEnd, e);
    } else if (offsetY > rect.height - 8) {
      onResizeStart(block.id, "bottom", blockStart, blockEnd, e);
    } else {
      onDragStart(block.id, { x: offsetX, y: offsetY }, e);
    }
  };

  return (
    <div
      data-time-block="true"
      className={cn(
        "group absolute z-10 rounded-md border",
        isPreview
          ? "border-dashed border-gray-400 bg-gray-100/50"
          : "border-solid bg-card shadow-sm hover:shadow-md",
        isClipped && "rounded-none border-dashed",
        block.isClippedStart && "rounded-t-none border-t-0",
        block.isClippedEnd && "rounded-b-none border-b-0"
      )}
      onMouseDown={handleMouseDown}
    >
      <div className="h-full p-2 text-sm">
        {!isPreview && (
          <>
            <div className="absolute inset-x-0 top-0 h-2 cursor-ns-resize hover:bg-black/10" />
            <div className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize hover:bg-black/10" />
          </>
        )}
        <div className="flex h-full flex-col justify-between overflow-hidden">
          <div className="flex items-start gap-2">
            <span className="flex-1 overflow-hidden">
              {block.title || "Untitled Block"}
            </span>
            <div className="flex items-center gap-1">
              {block.isFixedTime && <Lock className="h-3 w-3" />}
              {block.taskAssignments?.length > 0 && (
                <button
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    if (block.taskAssignments?.[0]?.task) {
                      openEditDialog(block.taskAssignments[0].task.task_id);
                    }
                  }}
                  className="rounded p-0.5 hover:bg-black/10"
                >
                  <Link className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

## Most recent logs

```
bundle.js:387559 🖱️ Mouse down at: 257 193
bundle.js:383872 1 overlaps still remain
bundle.js:383876   1. "useEditTaskStore [6]" overlaps "WeeklyCalendar [8]"
bundle.js:383879      A: [690.5, 79.4, 93.5x37.4]
bundle.js:383882      B: [571.5, 119.8, 120.0x24.0]
bundle.js:383885      Overlap area: 1.8 px²
bundle.js:383945 ✅ All nodes successfully rendered!
bundle.js:383872 1 overlaps still remain
bundle.js:383876   1. "useEditTaskStore [6]" overlaps "WeeklyCalendar [8]"
bundle.js:383879      A: [690.5, 79.4, 93.5x37.4]
bundle.js:383882      B: [571.5, 119.8, 120.0x24.0]
bundle.js:383885      Overlap area: 1.8 px²
bundle.js:383945 ✅ All nodes successfully rendered!
 🖱️ Mouse up, panning was: false
 ✅ Processing click action (no panning detected)
 🎯 ELK Reference Layout starting for: handleMouseDown [49-66]
 🔬 Building semantic reference graph for: handleMouseDown [49-66]
 🔬 Performing full semantic analysis on focus node
 🔬 Analyzing semantic references for: {id: 'TimeBlock2.tsx:1150-1702', label: 'handleMouseDown [49-66]'}
 📊 Found 4 internal declarations
 📤 Found 17 external references
 🔄 Found 19 internal references
 🔍 Searching for incoming references to BOI variables: (4) ['e', 'rect', 'offsetX', 'offsetY']
 📥 Found 2 incoming references
 📊 Found 38 total references (17 external, 2 incoming, 19 recursive)
 🔍 Reference analysis: handleMouseDown {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: isPreview {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: onResizeStart {type: 'function_call', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: onResizeStart {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: block {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: blockStart {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: blockEnd {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: onResizeStart {type: 'function_call', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: onResizeStart {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: block {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: blockStart {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: blockEnd {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: onDragStart {type: 'function_call', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: onDragStart {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: block {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: x {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: false}
 🔍 Reference analysis: y {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: false}
 🔍 Reference analysis: e {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
 🔍 Reference analysis: e {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
 🔍 Reference analysis: e {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
 🔍 Reference analysis: e {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
 🔍 Reference analysis: e {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
 🔍 Reference analysis: e {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
 🔍 Reference analysis: rect {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: false}
 🔍 Reference analysis: rect {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: false}
 🔍 Reference analysis: e {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
 🔍 Reference analysis: e {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
 🔍 Reference analysis: rect {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: false}
 🔍 Reference analysis: rect {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: false}
 🔍 Reference analysis: offsetY {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: false}
 🔍 Reference analysis: e {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
 🔍 Reference analysis: offsetY {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: false}
 🔍 Reference analysis: rect {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: false}
 🔍 Reference analysis: rect {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: false}
 🔍 Reference analysis: e {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
 🔍 Reference analysis: offsetX {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: false}
 🔍 Reference analysis: offsetY {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: false}
 🔍 Reference analysis: e {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
 🔍 Filtered to 15 most relevant references
 [REF_GRAPH] Prioritized references to resolve: (15) ['block', 'block', 'block', 'handleMouseDown', 'isPreview', 'onResizeStart', 'blockStart', 'blockEnd', 'onResizeStart', 'blockStart', 'blockEnd', 'onDragStart', 'onResizeStart', 'onResizeStart', 'onDragStart']
   🔎 candidate ➜ {id: 'TimeBlock2.tsx', label: 'TimeBlock2.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:3037-3175', label: 'if (block.taskAssignments?.[0]?.task)', category: 'IfClause', declares: false}
 [REF_GRAPH] Filtering to 2 declaration candidates for "block"
 [REF_GRAPH] Final chosen node for "block": {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', size: 2577}
 🔍 Selected node for block: {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function'}
 [OFFSET_MATCH] {offset: 1467, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1467, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1467, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1467, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1467, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1467, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1467, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1467, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1467, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1467, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1467, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1467, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1467, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1467, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx', label: 'TimeBlock2.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:3037-3175', label: 'if (block.taskAssignments?.[0]?.task)', category: 'IfClause', declares: false}
 [REF_GRAPH] Filtering to 2 declaration candidates for "block"
 [REF_GRAPH] Final chosen node for "block": {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', size: 2577}
 🔍 Selected node for block: {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function'}
 [OFFSET_MATCH] {offset: 1574, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1574, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1574, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1574, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1574, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1574, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1574, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1574, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1574, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1574, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1574, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1574, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1574, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1574, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx', label: 'TimeBlock2.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:3037-3175', label: 'if (block.taskAssignments?.[0]?.task)', category: 'IfClause', declares: false}
 [REF_GRAPH] Filtering to 2 declaration candidates for "block"
 [REF_GRAPH] Final chosen node for "block": {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', size: 2577}
 🔍 Selected node for block: {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function'}
 [OFFSET_MATCH] {offset: 1651, matchedNodeId: 'TimeBlock2.tsx:1639-1691', matchedLabel: 'onDragStart [64]'}
 [OFFSET_MATCH] {offset: 1651, matchedNodeId: 'TimeBlock2.tsx:1639-1691', matchedLabel: 'onDragStart [64]'}
 [OFFSET_MATCH] {offset: 1651, matchedNodeId: 'TimeBlock2.tsx:1639-1691', matchedLabel: 'onDragStart [64]'}
 [OFFSET_MATCH] {offset: 1651, matchedNodeId: 'TimeBlock2.tsx:1639-1691', matchedLabel: 'onDragStart [64]'}
 [OFFSET_MATCH] {offset: 1651, matchedNodeId: 'TimeBlock2.tsx:1639-1691', matchedLabel: 'onDragStart [64]'}
 [OFFSET_MATCH] {offset: 1651, matchedNodeId: 'TimeBlock2.tsx:1639-1691', matchedLabel: 'onDragStart [64]'}
 [OFFSET_MATCH] {offset: 1651, matchedNodeId: 'TimeBlock2.tsx:1639-1691', matchedLabel: 'onDragStart [64]'}
 [OFFSET_MATCH] {offset: 1651, matchedNodeId: 'TimeBlock2.tsx:1639-1691', matchedLabel: 'onDragStart [64]'}
 [OFFSET_MATCH] {offset: 1651, matchedNodeId: 'TimeBlock2.tsx:1639-1691', matchedLabel: 'onDragStart [64]'}
 [OFFSET_MATCH] {offset: 1651, matchedNodeId: 'TimeBlock2.tsx:1639-1691', matchedLabel: 'onDragStart [64]'}
 [OFFSET_MATCH] {offset: 1651, matchedNodeId: 'TimeBlock2.tsx:1639-1691', matchedLabel: 'onDragStart [64]'}
 [OFFSET_MATCH] {offset: 1651, matchedNodeId: 'TimeBlock2.tsx:1639-1691', matchedLabel: 'onDragStart [64]'}
 [OFFSET_MATCH] {offset: 1651, matchedNodeId: 'TimeBlock2.tsx:1639-1691', matchedLabel: 'onDragStart [64]'}
 [OFFSET_MATCH] {offset: 1651, matchedNodeId: 'TimeBlock2.tsx:1639-1691', matchedLabel: 'onDragStart [64]'}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx', label: 'TimeBlock2.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:1150-1702', label: 'handleMouseDown [49-66]', category: 'Variable', declares: false}
 [REF_GRAPH] Filtering to 3 declaration candidates for "handleMouseDown"
 [REF_GRAPH] Final chosen node for "handleMouseDown": {id: 'TimeBlock2.tsx:1150-1702', label: 'handleMouseDown [49-66]', category: 'Variable', size: 552}
 🔍 Selected node for handleMouseDown: {id: 'TimeBlock2.tsx:1150-1702', label: 'handleMouseDown [49-66]', category: 'Variable'}
 ⚠️ Skipped self-reference: TimeBlock2.tsx:1150-1702 (handleMouseDown [49-66]) for reference: handleMouseDown
   🔎 candidate ➜ {id: 'TimeBlock2.tsx', label: 'TimeBlock2.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:1199-1235', label: 'if (isPreview)', category: 'IfClause', declares: false}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:1707-3446', label: 'return (\n    <div\n      data-time-blo... [68-114]', category: 'ReturnStatement', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:1720-3441', label: '<div> [69-113]', category: 'JSXElementDOM', declares: true}
 [REF_GRAPH] Filtering to 4 declaration candidates for "isPreview"
 [REF_GRAPH] Final chosen node for "isPreview": {id: 'TimeBlock2.tsx:1720-3441', label: '<div> [69-113]', category: 'JSXElementDOM', size: 1721}
 🔍 Selected node for isPreview: {id: 'TimeBlock2.tsx:1720-3441', label: '<div> [69-113]', category: 'JSXElementDOM'}
 [OFFSET_MATCH] {offset: 1203, matchedNodeId: 'TimeBlock2.tsx:1199-1235', matchedLabel: 'if (isPreview)'}
 [OFFSET_MATCH] {offset: 1203, matchedNodeId: 'TimeBlock2.tsx:1199-1235', matchedLabel: 'if (isPreview)'}
 [OFFSET_MATCH] {offset: 1203, matchedNodeId: 'TimeBlock2.tsx:1199-1235', matchedLabel: 'if (isPreview)'}
 [OFFSET_MATCH] {offset: 1203, matchedNodeId: 'TimeBlock2.tsx:1199-1235', matchedLabel: 'if (isPreview)'}
 [OFFSET_MATCH] {offset: 1203, matchedNodeId: 'TimeBlock2.tsx:1199-1235', matchedLabel: 'if (isPreview)'}
 [OFFSET_MATCH] {offset: 1203, matchedNodeId: 'TimeBlock2.tsx:1199-1235', matchedLabel: 'if (isPreview)'}
 [OFFSET_MATCH] {offset: 1203, matchedNodeId: 'TimeBlock2.tsx:1199-1235', matchedLabel: 'if (isPreview)'}
 [OFFSET_MATCH] {offset: 1203, matchedNodeId: 'TimeBlock2.tsx:1199-1235', matchedLabel: 'if (isPreview)'}
 [OFFSET_MATCH] {offset: 1203, matchedNodeId: 'TimeBlock2.tsx:1199-1235', matchedLabel: 'if (isPreview)'}
 [OFFSET_MATCH] {offset: 1203, matchedNodeId: 'TimeBlock2.tsx:1199-1235', matchedLabel: 'if (isPreview)'}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx', label: 'TimeBlock2.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:1453-1508', label: 'onResizeStart [60]', category: 'Call', declares: false}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:1560-1618', label: 'onResizeStart [62]', category: 'Call', declares: false}
 [REF_GRAPH] Filtering to 2 declaration candidates for "onResizeStart"
 [REF_GRAPH] Final chosen node for "onResizeStart": {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', size: 2577}
 🔍 Selected node for onResizeStart: {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function'}
 [OFFSET_MATCH] {offset: 1446, matchedNodeId: 'TimeBlock2.tsx:1428-1515', matchedLabel: 'if (offsetY < 8)'}
 [OFFSET_MATCH] {offset: 1446, matchedNodeId: 'TimeBlock2.tsx:1428-1515', matchedLabel: 'if (offsetY < 8)'}
 [OFFSET_MATCH] {offset: 1446, matchedNodeId: 'TimeBlock2.tsx:1428-1515', matchedLabel: 'if (offsetY < 8)'}
 [OFFSET_MATCH] {offset: 1446, matchedNodeId: 'TimeBlock2.tsx:1428-1515', matchedLabel: 'if (offsetY < 8)'}
 [OFFSET_MATCH] {offset: 1446, matchedNodeId: 'TimeBlock2.tsx:1428-1515', matchedLabel: 'if (offsetY < 8)'}
 [OFFSET_MATCH] {offset: 1446, matchedNodeId: 'TimeBlock2.tsx:1428-1515', matchedLabel: 'if (offsetY < 8)'}
 [OFFSET_MATCH] {offset: 1446, matchedNodeId: 'TimeBlock2.tsx:1428-1515', matchedLabel: 'if (offsetY < 8)'}
 [OFFSET_MATCH] {offset: 1446, matchedNodeId: 'TimeBlock2.tsx:1428-1515', matchedLabel: 'if (offsetY < 8)'}
 [OFFSET_MATCH] {offset: 1446, matchedNodeId: 'TimeBlock2.tsx:1428-1515', matchedLabel: 'if (offsetY < 8)'}
 [OFFSET_MATCH] {offset: 1446, matchedNodeId: 'TimeBlock2.tsx:1428-1515', matchedLabel: 'if (offsetY < 8)'}
 [OFFSET_MATCH] {offset: 1446, matchedNodeId: 'TimeBlock2.tsx:1428-1515', matchedLabel: 'if (offsetY < 8)'}
 [OFFSET_MATCH] {offset: 1446, matchedNodeId: 'TimeBlock2.tsx:1428-1515', matchedLabel: 'if (offsetY < 8)'}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx', label: 'TimeBlock2.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:1077-1105', label: 'blockStart [46]', category: 'Variable', declares: false}
 [REF_GRAPH] Filtering to 3 declaration candidates for "blockStart"
 [REF_GRAPH] Final chosen node for "blockStart": {id: 'TimeBlock2.tsx:1077-1105', label: 'blockStart [46]', category: 'Variable', size: 28}
 🔍 Selected node for blockStart: {id: 'TimeBlock2.tsx:1077-1105', label: 'blockStart [46]', category: 'Variable'}
 [OFFSET_MATCH] {offset: 1483, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1483, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1483, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1483, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1483, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1483, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1483, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx', label: 'TimeBlock2.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:1115-1139', label: 'blockEnd [47]', category: 'Variable', declares: false}
 [REF_GRAPH] Filtering to 3 declaration candidates for "blockEnd"
 [REF_GRAPH] Final chosen node for "blockEnd": {id: 'TimeBlock2.tsx:1115-1139', label: 'blockEnd [47]', category: 'Variable', size: 24}
 🔍 Selected node for blockEnd: {id: 'TimeBlock2.tsx:1115-1139', label: 'blockEnd [47]', category: 'Variable'}
 [OFFSET_MATCH] {offset: 1495, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1495, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1495, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1495, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1495, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1495, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
 [OFFSET_MATCH] {offset: 1495, matchedNodeId: 'TimeBlock2.tsx:1453-1508', matchedLabel: 'onResizeStart [60]'}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx', label: 'TimeBlock2.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:1453-1508', label: 'onResizeStart [60]', category: 'Call', declares: false}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:1560-1618', label: 'onResizeStart [62]', category: 'Call', declares: false}
 [REF_GRAPH] Filtering to 2 declaration candidates for "onResizeStart"
 [REF_GRAPH] Final chosen node for "onResizeStart": {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', size: 2577}
 🔍 Selected node for onResizeStart: {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function'}
 [OFFSET_MATCH] {offset: 1553, matchedNodeId: 'TimeBlock2.tsx:1521-1625', matchedLabel: 'else if (offsetY > rect.height - 8)'}
 [OFFSET_MATCH] {offset: 1553, matchedNodeId: 'TimeBlock2.tsx:1521-1625', matchedLabel: 'else if (offsetY > rect.height - 8)'}
 [OFFSET_MATCH] {offset: 1553, matchedNodeId: 'TimeBlock2.tsx:1521-1625', matchedLabel: 'else if (offsetY > rect.height - 8)'}
 [OFFSET_MATCH] {offset: 1553, matchedNodeId: 'TimeBlock2.tsx:1521-1625', matchedLabel: 'else if (offsetY > rect.height - 8)'}
 [OFFSET_MATCH] {offset: 1553, matchedNodeId: 'TimeBlock2.tsx:1521-1625', matchedLabel: 'else if (offsetY > rect.height - 8)'}
 [OFFSET_MATCH] {offset: 1553, matchedNodeId: 'TimeBlock2.tsx:1521-1625', matchedLabel: 'else if (offsetY > rect.height - 8)'}
 [OFFSET_MATCH] {offset: 1553, matchedNodeId: 'TimeBlock2.tsx:1521-1625', matchedLabel: 'else if (offsetY > rect.height - 8)'}
 [OFFSET_MATCH] {offset: 1553, matchedNodeId: 'TimeBlock2.tsx:1521-1625', matchedLabel: 'else if (offsetY > rect.height - 8)'}
 [OFFSET_MATCH] {offset: 1553, matchedNodeId: 'TimeBlock2.tsx:1521-1625', matchedLabel: 'else if (offsetY > rect.height - 8)'}
 [OFFSET_MATCH] {offset: 1553, matchedNodeId: 'TimeBlock2.tsx:1521-1625', matchedLabel: 'else if (offsetY > rect.height - 8)'}
 [OFFSET_MATCH] {offset: 1553, matchedNodeId: 'TimeBlock2.tsx:1521-1625', matchedLabel: 'else if (offsetY > rect.height - 8)'}
 [OFFSET_MATCH] {offset: 1553, matchedNodeId: 'TimeBlock2.tsx:1521-1625', matchedLabel: 'else if (offsetY > rect.height - 8)'}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx', label: 'TimeBlock2.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:1077-1105', label: 'blockStart [46]', category: 'Variable', declares: false}
 [REF_GRAPH] Filtering to 3 declaration candidates for "blockStart"
 [REF_GRAPH] Final chosen node for "blockStart": {id: 'TimeBlock2.tsx:1077-1105', label: 'blockStart [46]', category: 'Variable', size: 28}
 🔍 Selected node for blockStart: {id: 'TimeBlock2.tsx:1077-1105', label: 'blockStart [46]', category: 'Variable'}
 [OFFSET_MATCH] {offset: 1593, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1593, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1593, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1593, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1593, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1593, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1593, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx', label: 'TimeBlock2.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:1115-1139', label: 'blockEnd [47]', category: 'Variable', declares: false}
 [REF_GRAPH] Filtering to 3 declaration candidates for "blockEnd"
 [REF_GRAPH] Final chosen node for "blockEnd": {id: 'TimeBlock2.tsx:1115-1139', label: 'blockEnd [47]', category: 'Variable', size: 24}
 🔍 Selected node for blockEnd: {id: 'TimeBlock2.tsx:1115-1139', label: 'blockEnd [47]', category: 'Variable'}
 [OFFSET_MATCH] {offset: 1605, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1605, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1605, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1605, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1605, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1605, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
 [OFFSET_MATCH] {offset: 1605, matchedNodeId: 'TimeBlock2.tsx:1560-1618', matchedLabel: 'onResizeStart [62]'}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx', label: 'TimeBlock2.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:1639-1691', label: 'onDragStart [64]', category: 'Call', declares: false}
 [REF_GRAPH] Filtering to 2 declaration candidates for "onDragStart"
 [REF_GRAPH] Final chosen node for "onDragStart": {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', size: 2577}
 🔍 Selected node for onDragStart: {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function'}
 [OFFSET_MATCH] {offset: 1632, matchedNodeId: 'TimeBlock2.tsx:1631-1698', matchedLabel: 'else'}
 [OFFSET_MATCH] {offset: 1632, matchedNodeId: 'TimeBlock2.tsx:1631-1698', matchedLabel: 'else'}
 [OFFSET_MATCH] {offset: 1632, matchedNodeId: 'TimeBlock2.tsx:1631-1698', matchedLabel: 'else'}
 [OFFSET_MATCH] {offset: 1632, matchedNodeId: 'TimeBlock2.tsx:1631-1698', matchedLabel: 'else'}
 [OFFSET_MATCH] {offset: 1632, matchedNodeId: 'TimeBlock2.tsx:1631-1698', matchedLabel: 'else'}
 [OFFSET_MATCH] {offset: 1632, matchedNodeId: 'TimeBlock2.tsx:1631-1698', matchedLabel: 'else'}
 [OFFSET_MATCH] {offset: 1632, matchedNodeId: 'TimeBlock2.tsx:1631-1698', matchedLabel: 'else'}
 [OFFSET_MATCH] {offset: 1632, matchedNodeId: 'TimeBlock2.tsx:1631-1698', matchedLabel: 'else'}
 [OFFSET_MATCH] {offset: 1632, matchedNodeId: 'TimeBlock2.tsx:1631-1698', matchedLabel: 'else'}
 [OFFSET_MATCH] {offset: 1632, matchedNodeId: 'TimeBlock2.tsx:1631-1698', matchedLabel: 'else'}
 [OFFSET_MATCH] {offset: 1632, matchedNodeId: 'TimeBlock2.tsx:1631-1698', matchedLabel: 'else'}
 [OFFSET_MATCH] {offset: 1632, matchedNodeId: 'TimeBlock2.tsx:1631-1698', matchedLabel: 'else'}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx', label: 'TimeBlock2.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:1453-1508', label: 'onResizeStart [60]', category: 'Call', declares: false}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:1560-1618', label: 'onResizeStart [62]', category: 'Call', declares: false}
 [REF_GRAPH] Filtering to 2 declaration candidates for "onResizeStart"
 [REF_GRAPH] Final chosen node for "onResizeStart": {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', size: 2577}
 🔍 Selected node for onResizeStart: {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function'}
 [OFFSET_MATCH] {offset: 1446, matchedNodeId: 'TimeBlock2.tsx:1428-1515', matchedLabel: 'if (offsetY < 8)'}
 [OFFSET_MATCH] {offset: 1446, matchedNodeId: 'TimeBlock2.tsx:1428-1515', matchedLabel: 'if (offsetY < 8)'}
 [OFFSET_MATCH] {offset: 1446, matchedNodeId: 'TimeBlock2.tsx:1428-1515', matchedLabel: 'if (offsetY < 8)'}
 [OFFSET_MATCH] {offset: 1446, matchedNodeId: 'TimeBlock2.tsx:1428-1515', matchedLabel: 'if (offsetY < 8)'}
 [OFFSET_MATCH] {offset: 1446, matchedNodeId: 'TimeBlock2.tsx:1428-1515', matchedLabel: 'if (offsetY < 8)'}
 [OFFSET_MATCH] {offset: 1446, matchedNodeId: 'TimeBlock2.tsx:1428-1515', matchedLabel: 'if (offsetY < 8)'}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx', label: 'TimeBlock2.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:1453-1508', label: 'onResizeStart [60]', category: 'Call', declares: false}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:1560-1618', label: 'onResizeStart [62]', category: 'Call', declares: false}
 [REF_GRAPH] Filtering to 2 declaration candidates for "onResizeStart"
 [REF_GRAPH] Final chosen node for "onResizeStart": {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', size: 2577}
 🔍 Selected node for onResizeStart: {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function'}
 [OFFSET_MATCH] {offset: 1553, matchedNodeId: 'TimeBlock2.tsx:1521-1625', matchedLabel: 'else if (offsetY > rect.height - 8)'}
 [OFFSET_MATCH] {offset: 1553, matchedNodeId: 'TimeBlock2.tsx:1521-1625', matchedLabel: 'else if (offsetY > rect.height - 8)'}
 [OFFSET_MATCH] {offset: 1553, matchedNodeId: 'TimeBlock2.tsx:1521-1625', matchedLabel: 'else if (offsetY > rect.height - 8)'}
 [OFFSET_MATCH] {offset: 1553, matchedNodeId: 'TimeBlock2.tsx:1521-1625', matchedLabel: 'else if (offsetY > rect.height - 8)'}
 [OFFSET_MATCH] {offset: 1553, matchedNodeId: 'TimeBlock2.tsx:1521-1625', matchedLabel: 'else if (offsetY > rect.height - 8)'}
 [OFFSET_MATCH] {offset: 1553, matchedNodeId: 'TimeBlock2.tsx:1521-1625', matchedLabel: 'else if (offsetY > rect.height - 8)'}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx', label: 'TimeBlock2.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', declares: true}
   🔎 candidate ➜ {id: 'TimeBlock2.tsx:1639-1691', label: 'onDragStart [64]', category: 'Call', declares: false}
 [REF_GRAPH] Filtering to 2 declaration candidates for "onDragStart"
 [REF_GRAPH] Final chosen node for "onDragStart": {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function', size: 2577}
 🔍 Selected node for onDragStart: {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', category: 'Function'}
 [OFFSET_MATCH] {offset: 1632, matchedNodeId: 'TimeBlock2.tsx:1631-1698', matchedLabel: 'else'}
 [OFFSET_MATCH] {offset: 1632, matchedNodeId: 'TimeBlock2.tsx:1631-1698', matchedLabel: 'else'}
 [OFFSET_MATCH] {offset: 1632, matchedNodeId: 'TimeBlock2.tsx:1631-1698', matchedLabel: 'else'}
 [OFFSET_MATCH] {offset: 1632, matchedNodeId: 'TimeBlock2.tsx:1631-1698', matchedLabel: 'else'}
 [OFFSET_MATCH] {offset: 1632, matchedNodeId: 'TimeBlock2.tsx:1631-1698', matchedLabel: 'else'}
 [OFFSET_MATCH] {offset: 1632, matchedNodeId: 'TimeBlock2.tsx:1631-1698', matchedLabel: 'else'}
 ✅ Reference graph built: 12 nodes, 14 references
 📋 Nodes to be included in reference graph:
   1. TimeBlock2.tsx:1150-1702 (handleMouseDown [49-66])
   2. TimeBlock2.tsx:871-3448 (TimeBlock() [38-115])
   3. TimeBlock2.tsx:1453-1508 (onResizeStart [60])
   4. TimeBlock2.tsx:1560-1618 (onResizeStart [62])
   5. TimeBlock2.tsx:1639-1691 (onDragStart [64])
   6. TimeBlock2.tsx:1720-3441 (<div> [69-113])
   7. TimeBlock2.tsx:1199-1235 (if (isPreview))
   8. TimeBlock2.tsx:1428-1515 (if (offsetY < 8))
   9. TimeBlock2.tsx:1077-1105 (blockStart [46])
   10. TimeBlock2.tsx:1115-1139 (blockEnd [47])
   11. TimeBlock2.tsx:1521-1625 (else if (offsetY > rect.height - 8))
   12. TimeBlock2.tsx:1631-1698 (else)
 🏗️ Building hierarchical structure for layout
 🔍 Common ancestor found: {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', targetNodes: 12}
 📦 Including node in hierarchy: TimeBlock2.tsx:1077-1105 (blockStart [46])
 📦 Including node in hierarchy: TimeBlock2.tsx:1115-1139 (blockEnd [47])
 📦 Including node in hierarchy: TimeBlock2.tsx:1199-1235 (if (isPreview))
 📦 Including node in hierarchy: TimeBlock2.tsx:1453-1508 (onResizeStart [60])
 📦 Including node in hierarchy: TimeBlock2.tsx:1428-1515 (if (offsetY < 8))
bundle.js:386607 📦 Including node in hierarchy: TimeBlock2.tsx:1560-1618 (onResizeStart [62])
bundle.js:386607 📦 Including node in hierarchy: TimeBlock2.tsx:1521-1625 (else if (offsetY > rect.height - 8))
bundle.js:386607 📦 Including node in hierarchy: TimeBlock2.tsx:1639-1691 (onDragStart [64])
bundle.js:386607 📦 Including node in hierarchy: TimeBlock2.tsx:1631-1698 (else)
bundle.js:386607 📦 Including node in hierarchy: TimeBlock2.tsx:1428-1698 (if/else if/else [59-65])
bundle.js:386607 📦 Including node in hierarchy: TimeBlock2.tsx:1168-1702 (() => {} [49-66])
bundle.js:386607 📦 Including node in hierarchy: TimeBlock2.tsx:1150-1702 (handleMouseDown [49-66])
bundle.js:386607 📦 Including node in hierarchy: TimeBlock2.tsx:1720-3441 (<div> [69-113])
bundle.js:386607 📦 Including node in hierarchy: TimeBlock2.tsx:1707-3446 (return (
    <div
      data-time-blo... [68-114])
bundle.js:386607 📦 Including node in hierarchy: TimeBlock2.tsx:871-3448 (TimeBlock() [38-115])
bundle.js:386985 ➕ Created synthetic param node for block {parent: 'TimeBlock() [38-115]', id: 'TimeBlock2.tsx:871-3448::param:block'}
3bundle.js:386991 🔍 Param decision for block: cat=Function => treat-as-param
bundle.js:386991 🔍 Param decision for isPreview: cat=JSXElementDOM => skip
bundle.js:386985 ➕ Created synthetic param node for onResizeStart {parent: 'TimeBlock() [38-115]', id: '/Users/byronwall/Projects/tasks-trpc/src/component…ocks/TimeBlock2.tsx:871-3448::param:onResizeStart'}
bundle.js:386991 🔍 Param decision for onResizeStart: cat=Function => treat-as-param
bundle.js:386991 🔍 Param decision for blockStart: cat=Variable => skip
bundle.js:386991 🔍 Param decision for blockEnd: cat=Variable => skip
bundle.js:386991 🔍 Param decision for onResizeStart: cat=Function => treat-as-param
bundle.js:386991 🔍 Param decision for blockStart: cat=Variable => skip
bundle.js:386991 🔍 Param decision for blockEnd: cat=Variable => skip
bundle.js:386985 ➕ Created synthetic param node for onDragStart {parent: 'TimeBlock() [38-115]', id: '/Users/byronwall/Projects/tasks-trpc/src/component…blocks/TimeBlock2.tsx:871-3448::param:onDragStart'}
bundle.js:386991 🔍 Param decision for onDragStart: cat=Function => treat-as-param
bundle.js:386997 📊 Reference graph: {nodes: 12, references: 14, syntheticParams: 3}
bundle.js:386629 🔄 Converting hierarchical node to ELK format: {id: 'TimeBlock2.tsx', label: 'TimeBlock2.tsx', isTarget: false, hasChildren: true}
bundle.js:386629 🔄 Converting hierarchical node to ELK format: {id: 'TimeBlock2.tsx:871-3448', label: 'TimeBlock() [38-115]', isTarget: true, hasChildren: true}
bundle.js:386629 🔄 Converting hierarchical node to ELK format: {id: 'TimeBlock2.tsx:1077-1105', label: 'blockStart [46]', isTarget: true, hasChildren: false}
bundle.js:386675   ✅ ELK hierarchical node created: TimeBlock2.tsx:1077-1105 (140x60, children: 0)
bundle.js:386629 🔄 Converting hierarchical node to ELK format: {id: 'TimeBlock2.tsx:1115-1139', label: 'blockEnd [47]', isTarget: true, hasChildren: false}
bundle.js:386675   ✅ ELK hierarchical node created: TimeBlock2.tsx:1115-1139 (124x60, children: 0)
bundle.js:386629 🔄 Converting hierarchical node to ELK format: {id: 'TimeBlock2.tsx:1150-1702', label: 'handleMouseDown [49-66]', isTarget: true, hasChildren: true}
bundle.js:386629 🔄 Converting hierarchical node to ELK format: {id: 'TimeBlock2.tsx:1168-1702', label: '() => {} [49-66]', isTarget: false, hasChildren: true}
bundle.js:386629 🔄 Converting hierarchical node to ELK format: {id: 'TimeBlock2.tsx:1199-1235', label: 'if (isPreview)', isTarget: true, hasChildren: false}
bundle.js:386675   ✅ ELK hierarchical node created: TimeBlock2.tsx:1199-1235 (132x60, children: 0)
bundle.js:386629 🔄 Converting hierarchical node to ELK format: {id: 'TimeBlock2.tsx:1428-1698', label: 'if/else if/else [59-65]', isTarget: false, hasChildren: true}
bundle.js:386629 🔄 Converting hierarchical node to ELK format: {id: 'TimeBlock2.tsx:1428-1515', label: 'if (offsetY < 8)', isTarget: true, hasChildren: true}
bundle.js:386629 🔄 Converting hierarchical node to ELK format: {id: 'TimeBlock2.tsx:1453-1508', label: 'onResizeStart [60]', isTarget: true, hasChildren: false}
bundle.js:386675   ✅ ELK hierarchical node created: TimeBlock2.tsx:1453-1508 (164x60, children: 0)
bundle.js:386664   📦 Node TimeBlock2.tsx:1428-1515 has 1 children in hierarchy
bundle.js:386675   ✅ ELK hierarchical node created: TimeBlock2.tsx:1428-1515 (200x120, children: 1)
bundle.js:386629 🔄 Converting hierarchical node to ELK format: {id: 'TimeBlock2.tsx:1521-1625', label: 'else if (offsetY > rect.height - 8)', isTarget: true, hasChildren: true}
bundle.js:386629 🔄 Converting hierarchical node to ELK format: {id: 'TimeBlock2.tsx:1560-1618', label: 'onResizeStart [62]', isTarget: true, hasChildren: false}
bundle.js:386675   ✅ ELK hierarchical node created: TimeBlock2.tsx:1560-1618 (164x60, children: 0)
bundle.js:386664   📦 Node TimeBlock2.tsx:1521-1625 has 1 children in hierarchy
bundle.js:386675   ✅ ELK hierarchical node created: TimeBlock2.tsx:1521-1625 (320x120, children: 1)
bundle.js:386629 🔄 Converting hierarchical node to ELK format: {id: 'TimeBlock2.tsx:1631-1698', label: 'else', isTarget: true, hasChildren: true}
bundle.js:386629 🔄 Converting hierarchical node to ELK format: {id: 'TimeBlock2.tsx:1639-1691', label: 'onDragStart [64]', isTarget: true, hasChildren: false}
bundle.js:386675   ✅ ELK hierarchical node created: TimeBlock2.tsx:1639-1691 (148x60, children: 0)
bundle.js:386664   📦 Node TimeBlock2.tsx:1631-1698 has 1 children in hierarchy
bundle.js:386675   ✅ ELK hierarchical node created: TimeBlock2.tsx:1631-1698 (200x120, children: 1)
bundle.js:386664   📦 Node TimeBlock2.tsx:1428-1698 has 3 children in hierarchy
bundle.js:386675   ✅ ELK hierarchical node created: TimeBlock2.tsx:1428-1698 (224x120, children: 3)
bundle.js:386664   📦 Node TimeBlock2.tsx:1168-1702 has 2 children in hierarchy
bundle.js:386675   ✅ ELK hierarchical node created: TimeBlock2.tsx:1168-1702 (200x120, children: 2)
bundle.js:386664   📦 Node TimeBlock2.tsx:1150-1702 has 1 children in hierarchy
bundle.js:386675   ✅ ELK hierarchical node created: TimeBlock2.tsx:1150-1702 (224x120, children: 1)
bundle.js:386629 🔄 Converting hierarchical node to ELK format: {id: 'TimeBlock2.tsx:1707-3446', label: 'return (\n    <div\n      data-time-blo... [68-114]', isTarget: false, hasChildren: true}
bundle.js:386629 🔄 Converting hierarchical node to ELK format: {id: 'TimeBlock2.tsx:1720-3441', label: '<div> [69-113]', isTarget: true, hasChildren: false}
bundle.js:386675   ✅ ELK hierarchical node created: TimeBlock2.tsx:1720-3441 (132x60, children: 0)
bundle.js:386664   📦 Node TimeBlock2.tsx:1707-3446 has 1 children in hierarchy
bundle.js:386675   ✅ ELK hierarchical node created: TimeBlock2.tsx:1707-3446 (432x120, children: 1)
bundle.js:386664   📦 Node TimeBlock2.tsx:871-3448 has 4 children in hierarchy
bundle.js:386675   ✅ ELK hierarchical node created: TimeBlock2.tsx:871-3448 (200x120, children: 4)
bundle.js:386664   📦 Node TimeBlock2.tsx has 1 children in hierarchy
bundle.js:386675   ✅ ELK hierarchical node created: TimeBlock2.tsx (200x120, children: 1)
bundle.js:387032 🔧 Injected parameter node into ELK: block
bundle.js:387032 🔧 Injected parameter node into ELK: onResizeStart
bundle.js:387032 🔧 Injected parameter node into ELK: onDragStart
bundle.js:387065 [EDGE_BUILD] {ref: 'block', dir: 'outgoing', src: 'TimeBlock2.tsx:871-3448::param:block', tgt: 'TimeBlock2.tsx:1453-1508'}
bundle.js:387065 [EDGE_BUILD] {ref: 'block', dir: 'outgoing', src: 'TimeBlock2.tsx:871-3448::param:block', tgt: 'TimeBlock2.tsx:1560-1618'}
bundle.js:387065 [EDGE_BUILD] {ref: 'block', dir: 'outgoing', src: 'TimeBlock2.tsx:871-3448::param:block', tgt: 'TimeBlock2.tsx:1639-1691'}
bundle.js:387065 [EDGE_BUILD] {ref: 'isPreview', dir: 'outgoing', src: 'TimeBlock2.tsx:1720-3441', tgt: 'TimeBlock2.tsx:1199-1235'}
bundle.js:387065 [EDGE_BUILD] {ref: 'onResizeStart', dir: 'outgoing', src: '/Users/byronwall/Projects/tasks-trpc/src/component…ocks/TimeBlock2.tsx:871-3448::param:onResizeStart', tgt: 'TimeBlock2.tsx:1428-1515'}
bundle.js:387065 [EDGE_BUILD] {ref: 'blockStart', dir: 'outgoing', src: 'TimeBlock2.tsx:1077-1105', tgt: 'TimeBlock2.tsx:1453-1508'}
bundle.js:387065 [EDGE_BUILD] {ref: 'blockEnd', dir: 'outgoing', src: 'TimeBlock2.tsx:1115-1139', tgt: 'TimeBlock2.tsx:1453-1508'}
bundle.js:387065 [EDGE_BUILD] {ref: 'onResizeStart', dir: 'outgoing', src: '/Users/byronwall/Projects/tasks-trpc/src/component…ocks/TimeBlock2.tsx:871-3448::param:onResizeStart', tgt: 'TimeBlock2.tsx:1521-1625'}
bundle.js:387065 [EDGE_BUILD] {ref: 'blockStart', dir: 'outgoing', src: 'TimeBlock2.tsx:1077-1105', tgt: 'TimeBlock2.tsx:1560-1618'}
bundle.js:387065 [EDGE_BUILD] {ref: 'blockEnd', dir: 'outgoing', src: 'TimeBlock2.tsx:1115-1139', tgt: 'TimeBlock2.tsx:1560-1618'}
bundle.js:387065 [EDGE_BUILD] {ref: 'onDragStart', dir: 'outgoing', src: '/Users/byronwall/Projects/tasks-trpc/src/component…blocks/TimeBlock2.tsx:871-3448::param:onDragStart', tgt: 'TimeBlock2.tsx:1631-1698'}
bundle.js:387065 [EDGE_BUILD] {ref: 'onResizeStart', dir: 'outgoing', src: 'TimeBlock2.tsx:871-3448', tgt: 'TimeBlock2.tsx:1428-1515'}
bundle.js:387065 [EDGE_BUILD] {ref: 'onResizeStart', dir: 'outgoing', src: 'TimeBlock2.tsx:871-3448', tgt: 'TimeBlock2.tsx:1521-1625'}
bundle.js:387065 [EDGE_BUILD] {ref: 'onDragStart', dir: 'outgoing', src: 'TimeBlock2.tsx:871-3448', tgt: 'TimeBlock2.tsx:1631-1698'}
bundle.js:387081 🔗 Created 14 edges out of 14 references
bundle.js:387107 🚀 Running ELK layout algorithm...
bundle.js:383872 1 overlaps still remain
bundle.js:383876   1. "useEditTaskStore [6]" overlaps "WeeklyCalendar [8]"
bundle.js:383879      A: [690.5, 79.4, 93.5x37.4]
bundle.js:383882      B: [571.5, 119.8, 120.0x24.0]
bundle.js:383885      Overlap area: 1.8 px²
bundle.js:383945 ✅ All nodes successfully rendered!
bundle.js:383872 1 overlaps still remain
bundle.js:383876   1. "useEditTaskStore [6]" overlaps "WeeklyCalendar [8]"
bundle.js:383879      A: [690.5, 79.4, 93.5x37.4]
bundle.js:383882      B: [571.5, 119.8, 120.0x24.0]
bundle.js:383885      Overlap area: 1.8 px²
bundle.js:383945 ✅ All nodes successfully rendered!
bundle.js:387110 ✅ ELK layout completed successfully
bundle.js:387129 📍 Layout complete with 1 top-level nodes
bundle.js:387145 🎉 ELK layout complete: {nodes: 1, edges: 14}
bundle.js:383872 1 overlaps still remain
bundle.js:383876   1. "useEditTaskStore [6]" overlaps "WeeklyCalendar [8]"
bundle.js:383879      A: [690.5, 79.4, 93.5x37.4]
bundle.js:383882      B: [571.5, 119.8, 120.0x24.0]
bundle.js:383885      Overlap area: 1.8 px²
bundle.js:383945 ✅ All nodes successfully rendered!
bundle.js:383872 1 overlaps still remain
bundle.js:383876   1. "useEditTaskStore [6]" overlaps "WeeklyCalendar [8]"
bundle.js:383879      A: [690.5, 79.4, 93.5x37.4]
bundle.js:383882      B: [571.5, 119.8, 120.0x24.0]
bundle.js:383885      Overlap area: 1.8 px²
bundle.js:383945 ✅ All nodes successfully rendered!
bundle.js:385351 🎨 Rendering ELK graph: {childrenCount: 1, edgesCount: 14}
bundle.js:385351 🎨 Rendering ELK graph: {childrenCount: 1, edgesCount: 14}
bundle.js:383872 1 overlaps still remain
bundle.js:383876   1. "useEditTaskStore [6]" overlaps "WeeklyCalendar [8]"
bundle.js:383879      A: [690.5, 79.4, 93.5x37.4]
bundle.js:383882      B: [571.5, 119.8, 120.0x24.0]
bundle.js:383885      Overlap area: 1.8 px²
bundle.js:383945 ✅ All nodes successfully rendered!
bundle.js:383872 1 overlaps still remain
bundle.js:383876   1. "useEditTaskStore [6]" overlaps "WeeklyCalendar [8]"
bundle.js:383879      A: [690.5, 79.4, 93.5x37.4]
bundle.js:383882      B: [571.5, 119.8, 120.0x24.0]
bundle.js:383885      Overlap area: 1.8 px²
bundle.js:383945 ✅ All nodes successfully rendered!
bundle.js:385351 🎨 Rendering ELK graph: {childrenCount: 1, edgesCount: 14}
bundle.js:385351 🎨 Rendering ELK graph: {childrenCount: 1, edgesCount: 14}
bundle.js:387515 ⏰ ELK layout timed out after 5 seconds
setTimeout
```
