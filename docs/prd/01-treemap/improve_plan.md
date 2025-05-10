# Treemap Improvement Plan

## Overview

Based on the feedback received, this plan outlines improvements to make the treemap visualization more effective by reducing excessive nesting, adding missing constructs, and introducing intelligent collapsing of nodes. The goal is to maintain all meaningful structure while making the treemap more navigable and informative.

## Issues to Address

1. **Excessive Depth**: The treemap quickly becomes too deep to be useful
   - Function/Block/JSX nesting creates too many levels
   - Arrow functions with simple bodies add unnecessary complexity
2. **Missing Important Constructs**: Several code elements aren't represented
   - Imports
   - Type aliases/interfaces
   - Literal constants
3. **Non-Informative Nesting**: Some nested structures don't add value
   - Blocks with only declarations/returns
   - JSX chains that are semantically one unit
   - Inline arrow callbacks with simple expressions

## Implementation Plan

### 1. Update NodeCategory in `src/types.ts`

Add new categories to represent missing constructs:

```typescript
export enum NodeCategory {
  // Existing categories
  Program = "Program",
  Module = "Module",
  Class = "Class",
  Function = "Function",
  ArrowFunction = "ArrowFunction",
  Block = "Block",
  ControlFlow = "ControlFlow",
  Variable = "Variable",
  Call = "Call",
  ReactComponent = "ReactComponent",
  ReactHook = "ReactHook",
  JSX = "JSX",
  Other = "Other",

  // New categories
  Import = "Import",
  TypeAlias = "TypeAlias",
  Interface = "Interface",
  Literal = "Literal",
  SyntheticGroup = "SyntheticGroup", // For grouping related nodes
}
```

### 2. Enhance `buildScopeTree.ts`

#### 2.1 Include New Node Types

Update the type mapping function to detect and categorize:

- Import declarations
- Type aliases and interfaces
- Literal expressions

```typescript
function mapKindToCategory(
  node: ts.Node,
  sourceFile?: ts.SourceFile
): NodeCategory {
  // Existing mappings...

  // Add new mappings
  if (ts.isImportDeclaration(node)) return NodeCategory.Import;
  if (ts.isTypeAliasDeclaration(node)) return NodeCategory.TypeAlias;
  if (ts.isInterfaceDeclaration(node)) return NodeCategory.Interface;
  if (
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    ts.isBooleanLiteral(node)
  )
    return NodeCategory.Literal;

  // Rest of existing function...
}
```

#### 2.2 Implement Node Flattening

Create a post-processing step after the initial tree construction:

```typescript
function flattenTree(rootNode: ScopeNode): ScopeNode {
  // Deep clone the root to avoid modifying the original
  const result = { ...rootNode, children: [...(rootNode.children || [])] };

  // Process each child recursively
  result.children = result.children.map(flattenNode);

  return result;
}

function flattenNode(node: ScopeNode): ScopeNode {
  // First recursively process all children
  const processedChildren = (node.children || []).map(flattenNode);

  // Apply flattening rules
  if (shouldCollapseBlock(node, processedChildren)) {
    // Rule: Collapse block with only declarations/returns
    return collapseBlockNode(node, processedChildren);
  }

  if (shouldCollapseArrowFunction(node, processedChildren)) {
    // Rule: Inline simple arrow functions
    return collapseArrowFunction(node, processedChildren);
  }

  // If no special rules apply, just update the children
  return { ...node, children: processedChildren };
}
```

#### 2.3 Implement Specific Flattening Rules

```typescript
function shouldCollapseBlock(node: ScopeNode, children: ScopeNode[]): boolean {
  return (
    node.category === NodeCategory.Block &&
    // Only variable declarations and maybe one return statement
    children.every(
      (child) =>
        child.category === NodeCategory.Variable ||
        child.kind === ts.SyntaxKind.ReturnStatement
    )
  );
}

function collapseBlockNode(node: ScopeNode, children: ScopeNode[]): ScopeNode {
  // Move all children to the parent, add metadata about collapse
  return {
    ...node,
    children,
    meta: {
      ...(node.meta || {}),
      collapsed: "block",
      originalCategory: NodeCategory.Block,
    },
  };
}

function shouldCollapseArrowFunction(
  node: ScopeNode,
  children: ScopeNode[]
): boolean {
  return (
    node.category === NodeCategory.ArrowFunction &&
    // Simple arrow function with ≤ 3 statements
    children.length <= 3
  );
}

function collapseArrowFunction(
  node: ScopeNode,
  children: ScopeNode[]
): ScopeNode {
  // For simple arrow functions, move call information to meta
  const callNode = children.find((c) => c.category === NodeCategory.Call);

  return {
    ...node,
    children,
    meta: {
      ...(node.meta || {}),
      collapsed: "arrowFunction",
      call: callNode ? callNode.label : undefined,
    },
  };
}
```

#### 2.4 Create Synthetic Group Nodes

```typescript
function createSyntheticGroups(rootNode: ScopeNode): ScopeNode {
  // Deep clone the root
  const result = { ...rootNode };

  // Process children recursively
  if (result.children && result.children.length > 0) {
    result.children = groupRelatedNodes(result.children);
    result.children = result.children.map(createSyntheticGroups);
  }

  return result;
}

function groupRelatedNodes(nodes: ScopeNode[]): ScopeNode[] {
  const result: ScopeNode[] = [];
  const groupCandidates: Map<string, ScopeNode[]> = new Map();

  // First pass: identify group candidates
  for (const node of nodes) {
    // Look for patterns like hook calls
    if (
      node.category === NodeCategory.Call &&
      node.label.startsWith("use") &&
      /[A-Z]/.test(node.label[3] || "")
    ) {
      // Group hooks
      const groupName = "Hooks";
      const group = groupCandidates.get(groupName) || [];
      group.push(node);
      groupCandidates.set(groupName, group);
    }
    // Look for mutation hooks
    else if (
      node.category === NodeCategory.Variable &&
      node.meta?.initializer?.includes("Mutation")
    ) {
      const groupName = "Mutations";
      const group = groupCandidates.get(groupName) || [];
      group.push(node);
      groupCandidates.set(groupName, group);
    }
    // Add more grouping rules as needed
    else {
      result.push(node);
    }
  }

  // Second pass: create synthetic groups
  for (const [groupName, groupNodes] of groupCandidates.entries()) {
    if (groupNodes.length > 1) {
      // Create synthetic group node
      const groupValue = groupNodes.reduce((sum, node) => sum + node.value, 0);
      const groupId = `synthetic:${groupName}:${groupNodes[0].id}`;

      result.push({
        id: groupId,
        category: NodeCategory.SyntheticGroup,
        label: groupName,
        kind: 0, // Synthetic kind
        value: groupValue,
        loc: groupNodes[0].loc, // Use first node's location as reference
        source: "", // No source for synthetic nodes
        children: groupNodes,
        meta: {
          syntheticGroup: true,
          contains: groupNodes.length,
        },
      });
    } else {
      // If only one node in candidate group, don't create a group
      result.push(...groupNodes);
    }
  }

  return result;
}
```

#### 2.5 Integrate in Main buildScopeTree Function

```typescript
export function buildScopeTree(
  filePath: string,
  fileText: string = fs.readFileSync(filePath, "utf8")
): ScopeNode {
  // Original tree building code...

  // After the raw tree is built, apply our transformations
  let optimizedTree = flattenTree(root);
  optimizedTree = createSyntheticGroups(optimizedTree);

  return optimizedTree;
}
```

### 3. Update `TreemapDisplay.tsx`

#### 3.1 Extend Color Palettes for New Node Types

```typescript
// Add new categories to all color palettes
const pastelSet: Record<NodeCategory, string> = {
  // Existing entries...

  // New entries
  [NodeCategory.Import]: "#c1e7ff",
  [NodeCategory.TypeAlias]: "#ffe8b3",
  [NodeCategory.Interface]: "#f0e68c",
  [NodeCategory.Literal]: "#dcdcdc",
  [NodeCategory.SyntheticGroup]: "#e6e6fa",
};

// Repeat for other color palettes
```

#### 3.2 Enhance Tooltip to Show Special Node Information

```typescript
tooltip={settings.enableTooltip ? ({ node }: { node: ComputedNode<ScopeNode> }) => {
  const scopeNode = node.data;
  const snippetLength = Math.max(0, settings.tooltipSourceSnippetLength);

  // Tooltip container JSX
  return (
    <div style={{/* existing styles */}}>
      {/* Existing tooltip content */}

      {/* Add metadata about collapsed nodes */}
      {scopeNode.meta?.collapsed && (
        <div style={{ marginTop: '5px', color: '#888' }}>
          {scopeNode.meta.collapsed === 'arrowFunction' && scopeNode.meta.call && (
            <>
              <div>Calls: {scopeNode.meta.call}</div>
            </>
          )}
          {scopeNode.meta.syntheticGroup && (
            <>
              <div>Group containing {scopeNode.meta.contains} nodes</div>
            </>
          )}
        </div>
      )}
    </div>
  );
} : () => null}
```

### 4. Update `App.tsx`

#### 4.1 Add New Settings in App Component

```typescript
// Extend TreemapSettings
interface TreemapSettings {
  // Existing settings...

  // New settings for flattening
  enableNodeFlattening: boolean;
  flattenBlocks: boolean;
  flattenArrowFunctions: boolean;
  createSyntheticGroups: boolean;

  // Category visibility toggles
  showImports: boolean;
  showTypes: boolean;
  showLiterals: boolean;
}

// Update default settings
const defaultTreemapSettings: TreemapSettings = {
  // Existing defaults...

  // New settings
  enableNodeFlattening: true,
  flattenBlocks: true,
  flattenArrowFunctions: true,
  createSyntheticGroups: true,

  showImports: true,
  showTypes: true,
  showLiterals: false, // Off by default as there could be many literals
};
```

#### 4.2 Add UI Controls for New Settings

```jsx
{
  /* Node Flattening Settings */
}
<div className="settings-group" style={{ marginTop: "10px" }}>
  <h5>Node Structure Settings</h5>
  <div className="setting-item-checkbox">
    <input
      type="checkbox"
      id="enableNodeFlattening"
      checked={treemapSettings.enableNodeFlattening}
      onChange={(e) =>
        handleTreemapSettingChange("enableNodeFlattening", e.target.checked)
      }
    />
    <label htmlFor="enableNodeFlattening">Enable Node Flattening</label>
  </div>

  {/* Only show these if flattening is enabled */}
  {treemapSettings.enableNodeFlattening && (
    <>
      <div className="setting-item-checkbox indented">
        <input
          type="checkbox"
          id="flattenBlocks"
          checked={treemapSettings.flattenBlocks}
          onChange={(e) =>
            handleTreemapSettingChange("flattenBlocks", e.target.checked)
          }
        />
        <label htmlFor="flattenBlocks">Flatten Simple Blocks</label>
      </div>

      <div className="setting-item-checkbox indented">
        <input
          type="checkbox"
          id="flattenArrowFunctions"
          checked={treemapSettings.flattenArrowFunctions}
          onChange={(e) =>
            handleTreemapSettingChange(
              "flattenArrowFunctions",
              e.target.checked
            )
          }
        />
        <label htmlFor="flattenArrowFunctions">Flatten Arrow Functions</label>
      </div>

      <div className="setting-item-checkbox indented">
        <input
          type="checkbox"
          id="createSyntheticGroups"
          checked={treemapSettings.createSyntheticGroups}
          onChange={(e) =>
            handleTreemapSettingChange(
              "createSyntheticGroups",
              e.target.checked
            )
          }
        />
        <label htmlFor="createSyntheticGroups">Create Synthetic Groups</label>
      </div>
    </>
  )}

  <h5>Node Visibility</h5>
  <div className="setting-item-checkbox">
    <input
      type="checkbox"
      id="showImports"
      checked={treemapSettings.showImports}
      onChange={(e) =>
        handleTreemapSettingChange("showImports", e.target.checked)
      }
    />
    <label htmlFor="showImports">Show Imports</label>
  </div>

  <div className="setting-item-checkbox">
    <input
      type="checkbox"
      id="showTypes"
      checked={treemapSettings.showTypes}
      onChange={(e) =>
        handleTreemapSettingChange("showTypes", e.target.checked)
      }
    />
    <label htmlFor="showTypes">Show Type Definitions</label>
  </div>

  <div className="setting-item-checkbox">
    <input
      type="checkbox"
      id="showLiterals"
      checked={treemapSettings.showLiterals}
      onChange={(e) =>
        handleTreemapSettingChange("showLiterals", e.target.checked)
      }
    />
    <label htmlFor="showLiterals">Show Literals</label>
  </div>
</div>;
```

#### 4.3 Pass Flattening Settings to Extension

```typescript
const requestTreemapData = useCallback(
  (fp: string) => {
    if (!fp) return;
    vscodeApi.postMessage({
      command: "getScopeTree",
      filePath: fp,
      options: {
        flattenTree: treemapSettings.enableNodeFlattening,
        flattenBlocks: treemapSettings.flattenBlocks,
        flattenArrowFunctions: treemapSettings.flattenArrowFunctions,
        createSyntheticGroups: treemapSettings.createSyntheticGroups,
        includeImports: treemapSettings.showImports,
        includeTypes: treemapSettings.showTypes,
        includeLiterals: treemapSettings.showLiterals,
      },
    });
    // Rest of the function...
  },
  [vscodeApi, treemapSettings]
);
```

### 5. Update Extension to Handle New Options

Add code to the extension to pass these options to the buildScopeTree function when handling the getScopeTree command.

## Implementation Phases

### Phase 1: Core Improvements (Highest Impact)

1. Add new node categories (Import, TypeAlias, Interface)
2. Implement basic block and arrow function flattening
3. Update color palettes

### Phase 2: Advanced Features

1. Implement JSX chain flattening
2. Add synthetic grouping
3. Add tooltip enhancements

### Phase 3: UI Controls

1. Add settings UI for all new options
2. Wire up settings to the extension

## Testing Plan

1. Test with complex React components with deep nesting
2. Compare before/after visualizations
3. Ensure navigation still works properly with flattened nodes
4. Verify tooltip shows correct information about collapsed structures

## Future Enhancements

1. User-configurable rules for node flattening
2. Ability to toggle between flat and hierarchical views
3. Custom coloring/filtering based on file patterns
4. Export options for flat/hierarchical data models
