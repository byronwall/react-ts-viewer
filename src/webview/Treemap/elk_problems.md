# Problems with ELK LAyout and Reference + Scope Graph

## Problems

- The boxes for `setPressedModifiers` is rendered from the scope of a different function. I need it to refer to the parent call where the `setPressedModifiers` is declared. THe issue appears to be that the symbol is matched but there is no consideration for whether or not the found instance is the DECLARATION or the USAGE. The one being found currently is another usage of the same symbol in a different scope.

## Test Scenario

With the treemap loaded for the code below, I `SHIFT + CLICK` on the `handleKeyDown` scope.

I expect to see two external references to `setPressedModifiers` and `keysToTrack`.

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";

type ModifierKey = "Control" | "Shift" | "Alt" | "Meta";

// Type for the hook's return value
type KeyModifiersState = Partial<Record<ModifierKey, boolean>>;

export const useKeyModifiers = (
  keysToTrack: ModifierKey[]
): KeyModifiersState => {
  const [pressedModifiers, setPressedModifiers] = useState<KeyModifiersState>(
    {}
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (keysToTrack.includes(event.key as ModifierKey)) {
        setPressedModifiers((prev) => ({
          ...prev,
          [event.key as ModifierKey]: true,
        }));
      }
    },
    [keysToTrack]
  );

  const handleKeyUp = useCallback(
    (event: KeyboardEvent) => {
      if (keysToTrack.includes(event.key as ModifierKey)) {
        setPressedModifiers((prev) => ({
          ...prev,
          [event.key as ModifierKey]: false,
        }));
      }
    },
    [keysToTrack]
  );

  // Effect to add/remove global event listeners
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // Cleanup listeners on unmount
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]); // Re-attach if handlers change (due to keysToTrack changing)

  // Add visibility change listener to reset keys if window loses focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Reset all tracked keys to false when window is hidden
        const resetState = keysToTrack.reduce((acc, key) => {
          acc[key] = false;
          return acc;
        }, {} as KeyModifiersState);
        setPressedModifiers(resetState);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [keysToTrack]);

  return pressedModifiers;
};
```

## Most recent logs

bundle.js:387400 🖱️ Mouse down at: 112 227
bundle.js:383890 ✅ No overlaps detected
bundle.js:383945 ✅ All nodes successfully rendered!
bundle.js:383890 ✅ No overlaps detected
bundle.js:383945 ✅ All nodes successfully rendered!
🖱️ Mouse up, panning was: false
✅ Processing click action (no panning detected)
🎯 ELK Reference Layout starting for: handleKeyDown [17-27]
🔬 Building semantic reference graph for: handleKeyDown [17-27]
🔬 Performing full semantic analysis on focus node
🔬 Analyzing semantic references for: {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:423-698', label: 'handleKeyDown [17-27]'}
📊 Found 2 internal declarations
📤 Found 8 external references
🔄 Found 5 internal references
🔍 Searching for incoming references to BOI variables: (2) ['event', 'prev']
📥 Found 8 incoming references
📊 Found 21 total references (8 external, 8 incoming, 5 recursive)
🔍 Reference analysis: handleKeyDown {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
🔍 Reference analysis: useCallback {type: 'function_call', isRelevantType: true, isGenericName: true, shouldInclude: false}
🔍 Reference analysis: useCallback {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
🔍 Reference analysis: keysToTrack {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
🔍 Reference analysis: keysToTrack {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
🔍 Reference analysis: setPressedModifiers {type: 'function_call', isRelevantType: true, isGenericName: false, shouldInclude: true}
🔍 Reference analysis: setPressedModifiers {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
🔍 Reference analysis: keysToTrack {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
🔍 Reference analysis: event {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
🔍 Reference analysis: event {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
🔍 Reference analysis: event {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
🔍 Reference analysis: event {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
🔍 Reference analysis: event {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
🔍 Reference analysis: event {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
🔍 Reference analysis: event {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
🔍 Reference analysis: event {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
🔍 Reference analysis: event {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
🔍 Reference analysis: event {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
🔍 Reference analysis: prev {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: false}
🔍 Reference analysis: event {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
🔍 Reference analysis: event {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
🔍 Filtered to 6 most relevant references
[REF_GRAPH] Prioritized references to resolve: (6) ['setPressedModifiers', 'setPressedModifiers', 'handleKeyDown', 'keysToTrack', 'keysToTrack', 'keysToTrack']
🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:552-659', label: 'setPressedModifiers [20-23]', category: 'Call', declares: false}
🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:836-944', label: 'setPressedModifiers [32-35]', category: 'Call', declares: false}
🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1825-1856', label: 'setPressedModifiers [62]', category: 'Call', declares: false}
[REF_GRAPH] Final chosen node for "setPressedModifiers": {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1825-1856', label: 'setPressedModifiers [62]', category: 'Call', size: 31}
🔍 Selected node for setPressedModifiers: {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1825-1856', label: 'setPressedModifiers [62]', category: 'Call'}
[OFFSET_MATCH] {offset: 543, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 543, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 543, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 543, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 543, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 543, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 543, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 543, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 543, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 543, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 543, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 543, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 543, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 543, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:552-659', label: 'setPressedModifiers [20-23]', category: 'Call', declares: false}
🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:836-944', label: 'setPressedModifiers [32-35]', category: 'Call', declares: false}
🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1825-1856', label: 'setPressedModifiers [62]', category: 'Call', declares: false}
[REF_GRAPH] Final chosen node for "setPressedModifiers": {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1825-1856', label: 'setPressedModifiers [62]', category: 'Call', size: 31}
🔍 Selected node for setPressedModifiers: {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1825-1856', label: 'setPressedModifiers [62]', category: 'Call'}
[OFFSET_MATCH] {offset: 543, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 543, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 543, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 543, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 543, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 543, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 543, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts', label: 'useKeyModifiers.ts', category: 'Program', declares: true}
🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:246-2106', label: 'useKeyModifiers [10-74]', category: 'Variable', declares: true}
🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:264-2106', label: '() => {} [10-74]', category: 'ArrowFunction', declares: true}
🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:423-698', label: 'handleKeyDown [17-27]', category: 'Variable', declares: false}
[REF_GRAPH] Filtering to 4 declaration candidates for "handleKeyDown"
[REF_GRAPH] Final chosen node for "handleKeyDown": {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:423-698', label: 'handleKeyDown [17-27]', category: 'Variable', size: 275}
🔍 Selected node for handleKeyDown: {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:423-698', label: 'handleKeyDown [17-27]', category: 'Variable'}
⚠️ Skipped self-reference: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:423-698 (handleKeyDown [17-27]) for reference: handleKeyDown
🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts', label: 'useKeyModifiers.ts', category: 'Program', declares: true}
🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:246-2106', label: 'useKeyModifiers [10-74]', category: 'Variable', declares: true}
🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:264-2106', label: '() => {} [10-74]', category: 'ArrowFunction', declares: true}
🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', label: 'if (keysToTrack.includes(event.key as ModifierKey))', category: 'IfClause', declares: false}
🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:774-953', label: 'if (keysToTrack.includes(event.key as ModifierKey))', category: 'IfClause', declares: false}
🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1695-1815', label: 'keysToTrack.reduce [58-61]', category: 'Call', declares: false}
[REF_GRAPH] Filtering to 3 declaration candidates for "keysToTrack"
[REF_GRAPH] Final chosen node for "keysToTrack": {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:264-2106', label: '() => {} [10-74]', category: 'ArrowFunction', size: 1842}
🔍 Selected node for keysToTrack: {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:264-2106', label: '() => {} [10-74]', category: 'ArrowFunction'}
[OFFSET_MATCH] {offset: 494, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 494, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 494, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 494, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 494, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 494, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 494, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts', label: 'useKeyModifiers.ts', category: 'Program', declares: true}
🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:246-2106', label: 'useKeyModifiers [10-74]', category: 'Variable', declares: true}
🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:264-2106', label: '() => {} [10-74]', category: 'ArrowFunction', declares: true}
🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', label: 'if (keysToTrack.includes(event.key as ModifierKey))', category: 'IfClause', declares: false}
🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:774-953', label: 'if (keysToTrack.includes(event.key as ModifierKey))', category: 'IfClause', declares: false}
🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1695-1815', label: 'keysToTrack.reduce [58-61]', category: 'Call', declares: false}
[REF_GRAPH] Filtering to 3 declaration candidates for "keysToTrack"
[REF_GRAPH] Final chosen node for "keysToTrack": {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:264-2106', label: '() => {} [10-74]', category: 'ArrowFunction', size: 1842}
🔍 Selected node for keysToTrack: {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:264-2106', label: '() => {} [10-74]', category: 'ArrowFunction'}
[OFFSET_MATCH] {offset: 494, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 494, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 494, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 494, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 494, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
[OFFSET_MATCH] {offset: 494, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
bundle.js:387060 [OFFSET_MATCH] {offset: 494, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', matchedLabel: 'if (keysToTrack.includes(event.key as ModifierKey))'}
bundle.js:386437 🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts', label: 'useKeyModifiers.ts', category: 'Program', declares: true}
bundle.js:386437 🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:246-2106', label: 'useKeyModifiers [10-74]', category: 'Variable', declares: true}
bundle.js:386437 🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:264-2106', label: '() => {} [10-74]', category: 'ArrowFunction', declares: true}
bundle.js:386437 🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', label: 'if (keysToTrack.includes(event.key as ModifierKey))', category: 'IfClause', declares: false}
bundle.js:386437 🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:774-953', label: 'if (keysToTrack.includes(event.key as ModifierKey))', category: 'IfClause', declares: false}
bundle.js:386437 🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1695-1815', label: 'keysToTrack.reduce [58-61]', category: 'Call', declares: false}
bundle.js:386751 [REF_GRAPH] Filtering to 3 declaration candidates for "keysToTrack"
bundle.js:386759 [REF_GRAPH] Final chosen node for "keysToTrack": {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:264-2106', label: '() => {} [10-74]', category: 'ArrowFunction', size: 1842}
bundle.js:386771 🔍 Selected node for keysToTrack: {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:264-2106', label: '() => {} [10-74]', category: 'ArrowFunction'}
bundle.js:387060 [OFFSET_MATCH] {offset: 681, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:439-698', matchedLabel: 'useCallback [17-27]'}
bundle.js:387060 [OFFSET_MATCH] {offset: 681, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:439-698', matchedLabel: 'useCallback [17-27]'}
bundle.js:387060 [OFFSET_MATCH] {offset: 681, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:439-698', matchedLabel: 'useCallback [17-27]'}
bundle.js:387060 [OFFSET_MATCH] {offset: 681, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:439-698', matchedLabel: 'useCallback [17-27]'}
bundle.js:387060 [OFFSET_MATCH] {offset: 681, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:439-698', matchedLabel: 'useCallback [17-27]'}
bundle.js:387060 [OFFSET_MATCH] {offset: 681, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:439-698', matchedLabel: 'useCallback [17-27]'}
bundle.js:387060 [OFFSET_MATCH] {offset: 681, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:439-698', matchedLabel: 'useCallback [17-27]'}
bundle.js:387060 [OFFSET_MATCH] {offset: 681, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:439-698', matchedLabel: 'useCallback [17-27]'}
bundle.js:387060 [OFFSET_MATCH] {offset: 681, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:439-698', matchedLabel: 'useCallback [17-27]'}
bundle.js:387060 [OFFSET_MATCH] {offset: 681, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:439-698', matchedLabel: 'useCallback [17-27]'}
bundle.js:386818 ✅ Reference graph built: 5 nodes, 5 references
bundle.js:386821 📋 Nodes to be included in reference graph:
bundle.js:386823 1. /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:423-698 (handleKeyDown [17-27])
bundle.js:386823 2. /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1825-1856 (setPressedModifiers [62])
bundle.js:386823 3. /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668 (if (keysToTrack.includes(event.key as ModifierKey)))
bundle.js:386823 4. /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:264-2106 (() => {} [10-74])
bundle.js:386823 5. /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:439-698 (useCallback [17-27])
bundle.js:386505 🏗️ Building hierarchical structure for layout
bundle.js:386513 🔍 Common ancestor found: {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:264-2106', label: '() => {} [10-74]', targetNodes: 5}
bundle.js:386530 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668 (if (keysToTrack.includes(event.key as ModifierKey)))
bundle.js:386530 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:456-674 (() => {} [18-25])
bundle.js:386530 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:439-698 (useCallback [17-27])
bundle.js:386530 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:423-698 (handleKeyDown [17-27])
bundle.js:386530 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1825-1856 (setPressedModifiers [62])
bundle.js:386530 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1580-1865 (if (document.hidden))
bundle.js:386530 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1566-1871 (() => {} [55-64])
bundle.js:386530 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1541-1871 (handleVisibilityChange [55-64])
bundle.js:386530 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1523-2059 (() => {} [54-71])
bundle.js:386530 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1513-2075 (useEffect [54-71])
bundle.js:386530 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:264-2106 (() => {} [10-74])
bundle.js:386877 📊 Reference graph: {nodes: 5, references: 5}
bundle.js:386552 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts', label: 'useKeyModifiers.ts', isTarget: false, hasChildren: true}
bundle.js:386552 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:246-2106', label: 'useKeyModifiers [10-74]', isTarget: false, hasChildren: true}
bundle.js:386552 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:264-2106', label: '() => {} [10-74]', isTarget: true, hasChildren: true}
bundle.js:386552 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:423-698', label: 'handleKeyDown [17-27]', isTarget: true, hasChildren: true}
bundle.js:386552 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:439-698', label: 'useCallback [17-27]', isTarget: true, hasChildren: true}
bundle.js:386552 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:456-674', label: '() => {} [18-25]', isTarget: false, hasChildren: true}
bundle.js:386552 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668', label: 'if (keysToTrack.includes(event.key as ModifierKey))', isTarget: true, hasChildren: false}
bundle.js:386598 ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668 (428x60, children: 0)
bundle.js:386587 📦 Node /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:456-674 has 1 children in hierarchy
bundle.js:386598 ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:456-674 (200x120, children: 1)
bundle.js:386587 📦 Node /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:439-698 has 1 children in hierarchy
bundle.js:386598 ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:439-698 (200x120, children: 1)
bundle.js:386587 📦 Node /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:423-698 has 1 children in hierarchy
bundle.js:386598 ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:423-698 (208x120, children: 1)
bundle.js:386552 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1513-2075', label: 'useEffect [54-71]', isTarget: false, hasChildren: true}
bundle.js:386552 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1523-2059', label: '() => {} [54-71]', isTarget: false, hasChildren: true}
bundle.js:386552 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1541-1871', label: 'handleVisibilityChange [55-64]', isTarget: false, hasChildren: true}
bundle.js:386552 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1566-1871', label: '() => {} [55-64]', isTarget: false, hasChildren: true}
bundle.js:386552 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1580-1865', label: 'if (document.hidden)', isTarget: false, hasChildren: true}
bundle.js:386552 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1825-1856', label: 'setPressedModifiers [62]', isTarget: true, hasChildren: false}
bundle.js:386598 ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1825-1856 (212x60, children: 0)
bundle.js:386587 📦 Node /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1580-1865 has 1 children in hierarchy
bundle.js:386598 ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1580-1865 (200x120, children: 1)
bundle.js:386587 📦 Node /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1566-1871 has 1 children in hierarchy
bundle.js:386598 ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1566-1871 (200x120, children: 1)
bundle.js:386587 📦 Node /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1541-1871 has 1 children in hierarchy
bundle.js:386598 ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1541-1871 (280x120, children: 1)
bundle.js:386587 📦 Node /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1523-2059 has 1 children in hierarchy
bundle.js:386598 ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1523-2059 (200x120, children: 1)
bundle.js:386587 📦 Node /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1513-2075 has 1 children in hierarchy
bundle.js:386598 ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:1513-2075 (200x120, children: 1)
bundle.js:386587 📦 Node /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:264-2106 has 2 children in hierarchy
bundle.js:386598 ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:264-2106 (200x120, children: 2)
bundle.js:386587 📦 Node /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:246-2106 has 1 children in hierarchy
bundle.js:386598 ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:246-2106 (224x120, children: 1)
bundle.js:386587 📦 Node /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts has 1 children in hierarchy
bundle.js:386598 ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts (200x120, children: 1)
bundle.js:386916 [EDGE_BUILD] {ref: 'setPressedModifiers', dir: 'outgoing', usageNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668'}
bundle.js:386916 [EDGE_BUILD] {ref: 'setPressedModifiers', dir: 'outgoing', usageNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668'}
bundle.js:386916 [EDGE_BUILD] {ref: 'keysToTrack', dir: 'outgoing', usageNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668'}
bundle.js:386916 [EDGE_BUILD] {ref: 'keysToTrack', dir: 'outgoing', usageNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:490-668'}
bundle.js:386916 [EDGE_BUILD] {ref: 'keysToTrack', dir: 'outgoing', usageNodeId: '/Users/byronwall/Projects/tasks-trpc/src/hooks/useKeyModifiers.ts:439-698'}
bundle.js:386955 🔗 Created 5 edges out of 5 references
bundle.js:386981 🚀 Running ELK layout algorithm...
bundle.js:383890 ✅ No overlaps detected
bundle.js:383945 ✅ All nodes successfully rendered!
bundle.js:383890 ✅ No overlaps detected
bundle.js:383945 ✅ All nodes successfully rendered!
bundle.js:386984 ✅ ELK layout completed successfully
bundle.js:387003 📍 Layout complete with 1 top-level nodes
bundle.js:387019 🎉 ELK layout complete: {nodes: 1, edges: 5}
bundle.js:383890 ✅ No overlaps detected
bundle.js:383945 ✅ All nodes successfully rendered!
bundle.js:383890 ✅ No overlaps detected
bundle.js:383945 ✅ All nodes successfully rendered!
bundle.js:385351 🎨 Rendering ELK graph: {childrenCount: 1, edgesCount: 5}
bundle.js:385351 🎨 Rendering ELK graph: {childrenCount: 1, edgesCount: 5}
bundle.js:383890 ✅ No overlaps detected
bundle.js:383945 ✅ All nodes successfully rendered!
bundle.js:383890 ✅ No overlaps detected
bundle.js:383945 ✅ All nodes successfully rendered!
bundle.js:385351 🎨 Rendering ELK graph: {childrenCount: 1, edgesCount: 5}
bundle.js:385351 🎨 Rendering ELK graph: {childrenCount: 1, edgesCount: 5}
