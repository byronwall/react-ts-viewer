import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import {
  Position,
  NodeCategory,
  ScopeNode,
  BuildScopeTreeOptions,
} from "./types";

// Position helper (already in types.ts, but ts.LineAndCharacter is 0-based for line)
// export interface Position {
//   line: number; // 1-based
//   column: number; // 0-based
// }

// Default options for buildScopeTree
const defaultBuildOptions: Required<BuildScopeTreeOptions> = {
  flattenTree: true, // Enable overall flattening pass
  flattenBlocks: true,
  flattenArrowFunctions: true,
  createSyntheticGroups: true,
  includeImports: true,
  includeTypes: true,
  includeLiterals: false, // Literals often off by default due to volume
};

function isScopeBoundary(node: ts.Node): boolean {
  return (
    ts.isSourceFile(node) ||
    ts.isModuleBlock(node) ||
    ts.isClassLike(node) ||
    ts.isFunctionLike(node) || // Catches functions, methods, arrow functions, constructors
    ts.isBlock(node) || // Catches block statements {}
    ts.isCatchClause(node) || // catch (e) {}
    ts.isCaseBlock(node) || // case clauses in a switch actually form a block
    // ts.isCaseClause(node) || // case x: individual case, might be too granular
    // ts.isDefaultClause(node) || // default: individual default, might be too granular
    ts.isForStatement(node) || // for (;;) {}
    ts.isForInStatement(node) || // for (x in y) {}
    ts.isForOfStatement(node) || // for (x of y) {}
    ts.isWhileStatement(node) || // while (true) {}
    ts.isDoStatement(node) // do {} while (true)
  );
}

function mapKindToCategory(
  node: ts.Node,
  sourceFile?: ts.SourceFile
): NodeCategory {
  if (ts.isSourceFile(node)) return NodeCategory.Program;
  if (ts.isModuleDeclaration(node)) return NodeCategory.Module;
  if (ts.isClassLike(node)) return NodeCategory.Class; // Catches ClassDeclaration and ClassExpression
  if (ts.isArrowFunction(node)) {
    // Heuristic: arrow function returning JSX ⇒ React component
    if (
      node.body &&
      (ts.isJsxElement(node.body) ||
        ts.isJsxSelfClosingElement(node.body) ||
        (ts.isBlock(node.body) &&
          ts.forEachChild(node.body, (child) =>
            ts.isReturnStatement(child) &&
            child.expression &&
            (ts.isJsxElement(child.expression) ||
              ts.isJsxSelfClosingElement(child.expression))
              ? true
              : undefined
          )))
    ) {
      return NodeCategory.ReactComponent;
    }
    return NodeCategory.ArrowFunction;
  }
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  ) {
    // Heuristic: function returning JSX ⇒ React component
    if (
      node.body &&
      ts.forEachChild(node.body, (c) =>
        ts.isReturnStatement(c) &&
        c.expression &&
        (ts.isJsxElement(c.expression) ||
          ts.isJsxSelfClosingElement(c.expression))
          ? true
          : undefined
      )
    ) {
      return NodeCategory.ReactComponent;
    }
    return NodeCategory.Function;
  }
  if (ts.isBlock(node)) return NodeCategory.Block;
  if (ts.isVariableDeclaration(node)) return NodeCategory.Variable; // Note: ts.VariableDeclarationList is the parent for `const a=1,b=2`

  // IfStatement will be handled specially to create ConditionalBlock, IfClause, etc.
  // but its underlying kind can still be ControlFlow if categorized directly.
  if (
    ts.isIfStatement(node) || // Keep this for direct categorization if needed
    ts.isSwitchStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isTryStatement(node) || // try {} catch {} finally {}
    ts.isCatchClause(node)
  )
    return NodeCategory.ControlFlow;

  if (ts.isCallExpression(node)) {
    const identNode = ts.isPropertyAccessExpression(node.expression)
      ? node.expression.name
      : node.expression;
    if (ts.isIdentifier(identNode)) {
      const ident = identNode.getText(sourceFile);
      if (/^use[A-Z]/.test(ident)) return NodeCategory.ReactHook;
    }
    return NodeCategory.Call;
  }
  if (
    ts.isJsxElement(node) ||
    ts.isJsxSelfClosingElement(node) ||
    ts.isJsxFragment(node)
  )
    return NodeCategory.JSX;

  // Add new mappings
  if (ts.isImportDeclaration(node)) return NodeCategory.Import;
  if (ts.isTypeAliasDeclaration(node)) return NodeCategory.TypeAlias;
  if (ts.isInterfaceDeclaration(node)) return NodeCategory.Interface;
  if (
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    // ts.isBooleanLiteral(node) // ts.SyntaxKind.TrueKeyword / FalseKeyword
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword
  )
    return NodeCategory.Literal;

  return NodeCategory.Other;
}

function deriveLabel(node: ts.Node, sourceFile?: ts.SourceFile): string {
  if (ts.isFunctionLike(node) && node.name && ts.isIdentifier(node.name))
    return node.name.text;
  if (ts.isClassLike(node) && node.name && ts.isIdentifier(node.name))
    return node.name.text;
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name))
    return node.name.text;
  if (ts.isCallExpression(node)) {
    const expressionText =
      node.expression.getText(sourceFile)?.split("\n")[0] || "";
    return expressionText.length > 50
      ? expressionText.substring(0, 47) + "..."
      : expressionText ||
          ts.SyntaxKind[node.expression.kind] ||
          "CallExpression";
  }
  if (ts.isPropertyAccessExpression(node))
    return node.name.getText(sourceFile) || node.name.escapedText.toString();
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isModuleDeclaration(node))
    return node.name.getText(sourceFile) || node.name.text;

  // Updated JSX handling:
  if (ts.isJsxElement(node)) {
    // Handles <Foo>...</Foo>
    return node.openingElement.tagName.getText(sourceFile) || "JSXElement";
  }
  if (ts.isJsxSelfClosingElement(node)) {
    // Handles <Foo/>
    return node.tagName.getText(sourceFile) || "JSXElement";
  }
  if (ts.isJsxFragment(node)) {
    // Handles <>...</>
    return "Fragment";
  }
  // The original check for JsxOpeningElement is removed as it's covered by the more specific JsxElement,
  // and JsxOpeningElement isn't typically the primary AST node for which a ScopeNode is created.

  const kindName = ts.SyntaxKind[node.kind];
  return kindName || "UnknownNode"; // Ensure a string is always returned
}

function collectMeta(
  node: ts.Node,
  category: NodeCategory,
  sourceFile?: ts.SourceFile
): Record<string, any> | undefined {
  if (category === NodeCategory.ReactHook && ts.isCallExpression(node)) {
    const expression = ts.isPropertyAccessExpression(node.expression)
      ? node.expression.name
      : node.expression;
    return { hookName: expression.getText(sourceFile) };
  }
  if (category === NodeCategory.ReactComponent && ts.isFunctionLike(node)) {
    return {
      props: node.parameters?.map((p) => p.name.getText(sourceFile)) ?? [],
    };
  }
  if (category === NodeCategory.Variable && ts.isVariableDeclaration(node)) {
    return {
      initializer: node.initializer
        ? node.initializer.getText(sourceFile)
        : undefined,
    };
  }
  return undefined;
}

function lineColOfPos(sourceFile: ts.SourceFile, pos: number): Position {
  const lc = sourceFile.getLineAndCharacterOfPosition(pos);
  return { line: lc.line + 1, column: lc.character }; // TS is 0-indexed for line
}

export function buildScopeTree(
  filePath: string,
  fileText: string = fs.readFileSync(filePath, "utf8"),
  options?: BuildScopeTreeOptions
): ScopeNode {
  const mergedOptions: Required<BuildScopeTreeOptions> = {
    ...defaultBuildOptions,
    ...(options || {}),
  };

  const sourceFile = ts.createSourceFile(
    path.basename(filePath), // Use basename for the source file name in AST
    fileText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX // Assume TSX, adjust if needed
  );

  const rootLocEnd = lineColOfPos(sourceFile, fileText.length);
  const root: ScopeNode = {
    id: filePath, // Use full path for root ID for uniqueness
    kind: sourceFile.kind,
    category: NodeCategory.Program,
    label: path.basename(filePath),
    loc: {
      start: { line: 1, column: 0 },
      end: rootLocEnd,
    },
    source: fileText,
    value: fileText.length, // Could be LOC too: sourceFile.getLineAndCharacterOfPosition(fileText.length).line + 1
    children: [],
  };

  function walk(node: ts.Node, parentNodeInTree: ScopeNode, sf: ts.SourceFile) {
    // --- START: Special handling for IfStatement chains ---
    if (ts.isIfStatement(node)) {
      const conditionalBlockStartPos = node.getStart(sf);

      // Determine the end of the entire if-else if-else chain for accurate source and loc
      let lastKnownStatementInChain: ts.Node = node.thenStatement; // Start with the first 'then'
      let currentChainLink: ts.IfStatement | undefined = node;
      while (currentChainLink) {
        const thenStatementForCurrentLink = currentChainLink.thenStatement;
        // Update lastKnownStatementInChain with the 'then' of the current link if it exists
        if (thenStatementForCurrentLink) {
          lastKnownStatementInChain = thenStatementForCurrentLink;
        }

        if (currentChainLink.elseStatement) {
          lastKnownStatementInChain = currentChainLink.elseStatement; // Update with the else statement
          if (ts.isIfStatement(currentChainLink.elseStatement)) {
            currentChainLink = currentChainLink.elseStatement; // It's an 'else if', continue
            // The 'then' of this 'else if' could be the new last known statement
            if (currentChainLink.thenStatement) {
              // Check if this new currentChainLink has a thenStatement
              lastKnownStatementInChain = currentChainLink.thenStatement;
            }
          } else {
            // It's a final 'else' block. lastKnownStatementInChain is already set to it.
            currentChainLink = undefined;
          }
        } else {
          // No more 'else' parts.
          // lastKnownStatementInChain should be the 'then' of the final if/else if.
          // This is handled by updating it with thenStatementForCurrentLink at the start of the loop.
          currentChainLink = undefined;
        }
      }
      const conditionalBlockEndPos = lastKnownStatementInChain.getEnd();

      const conditionalBlockId = `${filePath}:${conditionalBlockStartPos}-${conditionalBlockEndPos}`;
      const conditionalBlockNode: ScopeNode = {
        id: conditionalBlockId,
        kind: ts.SyntaxKind.Unknown, // Custom kind for ConditionalBlock
        category: NodeCategory.ConditionalBlock,
        label: "Conditional Block",
        loc: {
          start: lineColOfPos(sf, conditionalBlockStartPos),
          end: lineColOfPos(sf, conditionalBlockEndPos),
        },
        source: fileText.substring(
          conditionalBlockStartPos,
          conditionalBlockEndPos
        ),
        value: conditionalBlockEndPos - conditionalBlockStartPos,
        children: [],
        meta: {},
      };

      let currentIfStmtNode: ts.IfStatement | undefined = node;
      let clauseCategory = NodeCategory.IfClause;

      while (currentIfStmtNode) {
        const conditionText = currentIfStmtNode.expression.getText(sf);
        const thenStatement = currentIfStmtNode.thenStatement;

        // Clause spans from 'if(...)' or 'else if(...)' to the end of its 'then' block
        const clauseStartPos = currentIfStmtNode.getStart(sf);
        const clauseEndPos = thenStatement.getEnd();
        const clauseNodeId = `${filePath}:${clauseStartPos}-${clauseEndPos}`;
        const clauseLabel =
          clauseCategory === NodeCategory.IfClause
            ? `if (${conditionText})`
            : `else if (${conditionText})`;

        const clauseNode: ScopeNode = {
          id: clauseNodeId,
          kind: currentIfStmtNode.kind, // ts.SyntaxKind.IfStatement
          category: clauseCategory,
          label: clauseLabel,
          loc: {
            start: lineColOfPos(sf, clauseStartPos),
            end: lineColOfPos(sf, clauseEndPos),
          },
          source: fileText.substring(clauseStartPos, clauseEndPos), // Source for 'if(cond) then_block'
          value: clauseEndPos - clauseStartPos,
          children: [], // Children will be from the 'then' block
          meta: { condition: conditionText },
        };
        conditionalBlockNode.children.push(clauseNode);

        // Recursively walk the 'then' statement; its children will be added to clauseNode
        walk(thenStatement, clauseNode, sf);

        const elseStatement: ts.Statement | undefined =
          currentIfStmtNode.elseStatement;
        if (elseStatement) {
          if (ts.isIfStatement(elseStatement)) {
            // This is an 'else if'
            currentIfStmtNode = elseStatement;
            clauseCategory = NodeCategory.ElseIfClause;
          } else {
            // This is a final 'else' block
            const elseNodeStartPos = elseStatement.getStart(sf);
            const elseNodeEndPos = elseStatement.getEnd();
            const elseNodeId = `${filePath}:${elseNodeStartPos}-${elseNodeEndPos}`;
            const elseClauseNode: ScopeNode = {
              id: elseNodeId,
              kind: elseStatement.kind,
              category: NodeCategory.ElseClause,
              label: "else",
              loc: {
                start: lineColOfPos(sf, elseNodeStartPos),
                end: lineColOfPos(sf, elseNodeEndPos),
              },
              source: fileText.substring(elseNodeStartPos, elseNodeEndPos),
              value: elseNodeEndPos - elseNodeStartPos,
              children: [],
              meta: {},
            };
            conditionalBlockNode.children.push(elseClauseNode);
            walk(elseStatement, elseClauseNode, sf); // process children of the elseStatement under the elseClauseNode
            currentIfStmtNode = undefined; // End of the chain
          }
        } else {
          currentIfStmtNode = undefined; // End of the chain, no else
        }
      }

      // Conditionally add the ConditionalBlock or its single IfClause child
      if (
        conditionalBlockNode.children.length === 1 &&
        conditionalBlockNode.children[0] &&
        conditionalBlockNode.children[0].category === NodeCategory.IfClause
      ) {
        // Single 'if' statement with no 'else' or 'else if'. Promote the IfClause.
        parentNodeInTree.children.push(conditionalBlockNode.children[0]);
      } else {
        // Contains 'else', 'else if', or is empty (should not happen for a valid 'if').
        // Keep the ConditionalBlock wrapper.
        parentNodeInTree.children.push(conditionalBlockNode);
      }

      return; // IMPORTANT: Prevent default child traversal for the IfStatement itself and its components by the outer loop
    }
    // --- END: Special handling for IfStatement chains ---

    let currentContainer = parentNodeInTree;
    const category = mapKindToCategory(node, sf);

    // Create a new scope node if it's a scope boundary OR a significant non-boundary element
    // Ensure IfStatement itself isn't re-processed here to create a plain ControlFlow node if already handled.
    if (
      isScopeBoundary(node) ||
      category === NodeCategory.Variable ||
      category === NodeCategory.ReactHook ||
      category === NodeCategory.Call ||
      category === NodeCategory.JSX ||
      category === NodeCategory.Import ||
      category === NodeCategory.TypeAlias ||
      category === NodeCategory.Interface ||
      (category === NodeCategory.ControlFlow && !ts.isIfStatement(node)) // Process other control flows
    ) {
      const startPos = node.getStart(sf, /*includeJsDoc*/ false);
      const endPos = node.getEnd();

      // Skip zero-width nodes or nodes outside parent's range (can happen with some synthetic nodes)
      if (endPos === startPos) {
        ts.forEachChild(node, (child) => walk(child, currentContainer, sf));
        return;
      }

      const startLoc = lineColOfPos(sf, startPos);
      const endLoc = lineColOfPos(sf, endPos);

      // Ensure node is within parent's text span.
      // const parentStartOffset = parentNodeInTree.source === fileText ? 0 : sf.text.indexOf(parentNodeInTree.source);
      // if (parentStartOffset === -1 && parentNodeInTree.category !== NodeCategory.Program) { /* handle error or skip */ }
      // const parentEndOffset = parentStartOffset + parentNodeInTree.source.length;
      // if (startPos < parentStartOffset || endPos > parentEndOffset) {
      //   // This node is outside its AST parent's source range, potentially problematic
      //   // For now, we'll allow it but this could be refined
      // }

      const nodeSourceText = fileText.substring(startPos, endPos);
      const nodeId = `${filePath}:${startPos}-${endPos}`; // Unique ID

      const newNode: ScopeNode = {
        id: nodeId,
        kind: node.kind,
        category: category,
        label: deriveLabel(node, sf),
        loc: { start: startLoc, end: endLoc },
        source: nodeSourceText,
        value: nodeSourceText.length, // char length
        meta: collectMeta(node, category, sf),
        children: [],
      };

      // Check for duplicate IDs (can happen with overlapping nodes or incorrect walk logic)
      // This check is more for debugging the walk logic itself.
      // const checkExisting = (nodes: ScopeNode[], id: string): boolean => {
      //     if (nodes.find(n => n.id === id)) return true;
      //     for (const n of nodes) {
      //         if (checkExisting(n.children, id)) return true;
      //     }
      //     return false;
      // };
      // if (checkExisting([root], newNode.id)) {
      //     console.warn("Duplicate node ID:", newNode.id, "Label:", newNode.label);
      // }

      // Attach to the correct parent in the tree
      // This logic ensures nodes are nested under the *current* semantic container.
      parentNodeInTree.children.push(newNode);
      currentContainer = newNode; // This new node is now the container for its children
    }

    ts.forEachChild(node, (child) => walk(child, currentContainer, sf));
  }

  // Start walking from the SourceFile node itself.
  // The root ScopeNode represents the file, its children will be top-level statements/declarations.
  ts.forEachChild(sourceFile, (child) => walk(child, root, sourceFile));

  let processedTree = root;

  // Filter nodes based on options first
  processedTree = filterNodesByOptions(processedTree, mergedOptions);

  if (mergedOptions.flattenTree) {
    processedTree = flattenTree(processedTree, mergedOptions);
  }
  if (mergedOptions.createSyntheticGroups) {
    processedTree = createSyntheticGroups(processedTree, true); // Pass true for the initial call
  }

  console.log("Raw source code for:", filePath, /*fileText*/ "(text omitted)"); // Avoid logging full source
  console.log(
    "Final ScopeTree output for:",
    filePath,
    JSON.stringify(processedTree, null, 2) // Log the processed tree
  );

  return processedTree; // Return the processed tree
}

// Example Usage (for testing - remove or comment out in production extension code):
// if (require.main === module) {
//   const exampleFilePath = path.join(__dirname, '../../src/webview/App.tsx'); // Adjust path as needed
//   if (fs.existsSync(exampleFilePath)) {
//     const tree = buildScopeTree(exampleFilePath);
//     fs.writeFileSync(path.join(__dirname, 'scopeTreeOutput.json'), JSON.stringify(tree, null, 2));
//     console.log('Scope tree generated to scopeTreeOutput.json');
//   } else {
//     console.error('Example file not found:', exampleFilePath);
//   }
// }

// --- START: Node Flattening and Grouping Logic ---
function flattenTree(
  rootNode: ScopeNode,
  options: Required<BuildScopeTreeOptions>
): ScopeNode {
  // Deep clone the root to avoid modifying the original
  // A proper deep clone might be needed if ScopeNode has complex nested objects not handled by spread
  const result = {
    ...rootNode,
    // Ensure children array exists before mapping, and clone children
    children: (rootNode.children || []).map((child) => ({ ...child })),
  };

  // Process each child recursively
  result.children = result.children.map((child) => flattenNode(child, options)); // Pass a copy to flattenNode

  return result;
}

function flattenNode(
  node: ScopeNode,
  options: Required<BuildScopeTreeOptions>
): ScopeNode {
  // Recursively process the children of the current node first.
  let processedChildren = (node.children || []).map(
    (
      child // Use 'let' to allow reassignment
    ) => flattenNode({ ...child }, options) // Creates a copy of child for processing
  );

  // New logic: If the current node `node` has exactly one processed child,
  // and that child is a Block, then "hoist" the Block's children to become direct children of `node`.
  // This is controlled by the flattenBlocks option.
  if (
    options.flattenBlocks &&
    processedChildren.length === 1 &&
    processedChildren[0] && // Ensure the child exists
    processedChildren[0].category === NodeCategory.Block
  ) {
    // The new children for the current `node` are the children of its single Block child.
    // Ensure the Block's children array exists, defaulting to an empty array if not.
    processedChildren = processedChildren[0].children || [];
  }

  // Now, apply existing collapse logic for the current `node` itself,
  // using the potentially modified list of its children (`processedChildren`).
  if (shouldCollapseBlock(node, processedChildren, options)) {
    return collapseBlockNode({ ...node }, processedChildren); // Options not passed to collapse*Node directly
  }

  if (shouldCollapseArrowFunction(node, processedChildren, options)) {
    return collapseArrowFunction({ ...node }, processedChildren); // Options not passed to collapse*Node directly
  }

  return { ...node, children: processedChildren };
}

function shouldCollapseBlock(
  node: ScopeNode,
  children: ScopeNode[],
  options: Required<BuildScopeTreeOptions>
): boolean {
  if (!options.flattenBlocks) {
    return false;
  }
  return (
    node.category === NodeCategory.Block &&
    children.every(
      (child) =>
        child.category === NodeCategory.Variable ||
        child.kind === ts.SyntaxKind.ReturnStatement
    ) &&
    children.filter((child) => child.kind === ts.SyntaxKind.ReturnStatement)
      .length <= 1
  );
}

function collapseBlockNode(node: ScopeNode, children: ScopeNode[]): ScopeNode {
  // Removed options from signature
  return {
    ...node,
    children,
    meta: {
      ...(node.meta || {}),
      collapsed: "block",
      originalCategory: node.category,
    },
  };
}

function shouldCollapseArrowFunction(
  node: ScopeNode,
  children: ScopeNode[],
  options: Required<BuildScopeTreeOptions>
): boolean {
  if (!options.flattenArrowFunctions) {
    return false;
  }
  if (node.category !== NodeCategory.ArrowFunction) return false;

  // If the arrow function's direct body resulted in no significant children ScopeNodes (e.g. direct expression `() => x`)
  if (children.length === 0) return true;

  // If it has one child, and that child is a simple block (e.g. `() => { /* simple stuff */ }`)
  // Safely access children[0] and its children property
  if (children.length === 1 && children[0]?.category === NodeCategory.Block) {
    // Consider the block's children (statements within the arrow function block)
    const blockChildren = children[0]?.children || [];
    return blockChildren.length <= 3; // As per plan: ≤ 3 statements in the block
  }

  // Otherwise, if children are directly from a more complex body (not a single block that was processed)
  // This case might be less common if ArrowFunction's body is always a Block or an expression.
  // For now, stick to the plan's spirit: simple body implies few statements.
  return children.length <= 1; // Heuristic: few direct structural children means simple.
}

function collapseArrowFunction(
  node: ScopeNode,
  children: ScopeNode[]
  // options: Required<BuildScopeTreeOptions> // Options removed from signature
): ScopeNode {
  let callNodeLabel: string | undefined = undefined;

  function findCallLabelRecursive(nodes: ScopeNode[]): string | undefined {
    for (const child of nodes) {
      if (child.category === NodeCategory.Call) {
        return child.label;
      }
      if (child.children && child.children.length > 0) {
        const found = findCallLabelRecursive(child.children);
        if (found) return found;
      }
    }
    return undefined;
  }

  callNodeLabel = findCallLabelRecursive(children);

  return {
    ...node,
    // Children are kept, but visualizer might hide them or represent the node differently.
    children,
    meta: {
      ...(node.meta || {}),
      collapsed: "arrowFunction",
      originalCategory: node.category,
      call: callNodeLabel, // Store the label of the found call
    },
  };
}

// Helper function to create a synthetic group
function createActualSyntheticGroup(
  groupNodes: ScopeNode[],
  groupName: string,
  parentId: string
): ScopeNode | null {
  if (groupNodes.length <= 1) return null; // Only group if more than one item

  const firstNode = groupNodes[0];
  // Guard against empty groupNodes though length check should prevent this
  if (!firstNode) return null;

  const groupValue = groupNodes.reduce((sum, node) => sum + node.value, 0);
  // Ensure a unique enough ID for the synthetic group
  const groupId = `synthetic:${parentId}:${groupName}:${firstNode.id}`;
  const firstNodeLoc = firstNode.loc; // Use loc of the first node for simplicity
  // Concatenate source code from all nodes in the group
  const combinedSource = groupNodes.map((node) => node.source).join("\n\n"); // Join with double newline for readability in tooltips

  return {
    id: groupId,
    category: NodeCategory.SyntheticGroup,
    label: groupName,
    kind: ts.SyntaxKind.Unknown, // Synthetic nodes don't have a direct TS kind
    value: groupValue,
    loc: firstNodeLoc,
    source: combinedSource,
    children: groupNodes, // Embed original nodes as children
    meta: {
      syntheticGroup: true,
      contains: groupNodes.length,
      originalNodesCategories: groupNodes.map((n) => n.category),
    },
  };
}

function createSyntheticGroups(
  rootNode: ScopeNode,
  isTopLevelCall: boolean = false
): ScopeNode {
  // Ensure children are initialized and cloned properly at the start
  const initialChildrenToProcess = rootNode.children
    ? rootNode.children.map((c) => ({ ...c }))
    : [];

  const result = {
    ...rootNode,
    children: initialChildrenToProcess, // Assign the definitely-an-array to result.children
  };

  // Now, result.children is guaranteed to be an array (possibly empty)
  if (result.children.length > 0) {
    // Recursively call on children. Each child from result.children is a clone.
    // For recursive calls, isTopLevelCall is false.
    const childrenAfterRecursiveCall = result.children.map((child) =>
      createSyntheticGroups(child, false)
    );
    // Then, group the (already processed) children nodes. Pass the flag.
    result.children = groupRelatedNodes(
      childrenAfterRecursiveCall,
      result.id,
      isTopLevelCall
    );
  }
  return result;
}

function groupRelatedNodes(
  nodes: ScopeNode[],
  parentId: string,
  isTopLevel: boolean
): ScopeNode[] {
  const collectedGroups: {
    Imports: ScopeNode[];
    "Type defs": ScopeNode[];
    Hooks: ScopeNode[];
  } = {
    Imports: [],
    "Type defs": [],
    Hooks: [],
  };
  const remainingNodes: ScopeNode[] = [];

  for (const node of nodes) {
    let assignedToGroup = false;
    if (isTopLevel) {
      if (node.category === NodeCategory.Import) {
        collectedGroups["Imports"].push(node);
        assignedToGroup = true;
      } else if (
        node.category === NodeCategory.TypeAlias ||
        node.category === NodeCategory.Interface
      ) {
        if (!assignedToGroup) {
          // Should be redundant if Import/Type/Interface are mutually exclusive categories
          collectedGroups["Type defs"].push(node);
          assignedToGroup = true;
        }
      }
    }

    if (!assignedToGroup) {
      const label = node.label;
      let isHookLike = false;
      if (node.category === NodeCategory.ReactHook) {
        isHookLike = true;
      } else if (
        node.category === NodeCategory.Call &&
        typeof label === "string" &&
        label.startsWith("use") &&
        label.length > 3
      ) {
        const charAtIndex3 = label[3]; // Access character
        if (typeof charAtIndex3 === "string" && /[A-Z]/.test(charAtIndex3)) {
          // Check if char is string and test
          isHookLike = true;
        }
      }

      if (isHookLike) {
        collectedGroups["Hooks"].push(node);
        assignedToGroup = true;
      }
    }

    if (!assignedToGroup) {
      remainingNodes.push(node);
    }
  }

  const finalResultNodes: ScopeNode[] = [];
  // Now groupOrder keys will correctly map to ScopeNode[] types in collectedGroups
  const groupOrder: Array<keyof typeof collectedGroups> = [
    "Imports",
    "Type defs",
    "Hooks",
  ];

  for (const groupName of groupOrder) {
    const groupNodes = collectedGroups[groupName]; // groupNodes is now ScopeNode[]
    if (groupNodes.length > 0) {
      const syntheticGroup = createActualSyntheticGroup(
        groupNodes,
        groupName,
        parentId
      );
      if (syntheticGroup) {
        finalResultNodes.push(syntheticGroup);
      } else {
        remainingNodes.push(...groupNodes); // groupNodes is ScopeNode[], spreadable
      }
    }
  }

  finalResultNodes.push(...remainingNodes);
  return finalResultNodes;
}

// --- END: Node Flattening and Grouping Logic ---

// --- START: Node Filtering Logic ---
function filterNodesByOptionsRecursive(
  node: ScopeNode,
  options: Required<BuildScopeTreeOptions>
): ScopeNode | null {
  // First, filter children recursively
  if (node.children && node.children.length > 0) {
    node.children = node.children
      .map((child: ScopeNode) =>
        filterNodesByOptionsRecursive({ ...child }, options)
      ) // Process cloned children, child is ScopeNode
      .filter((child: ScopeNode | null) => child !== null) as ScopeNode[]; // child is ScopeNode | null before filter
  }

  // Then, decide if the current node itself should be filtered out
  if (!options.includeImports && node.category === NodeCategory.Import) {
    return null;
  }
  if (
    !options.includeTypes &&
    (node.category === NodeCategory.TypeAlias ||
      node.category === NodeCategory.Interface)
  ) {
    return null;
  }
  if (!options.includeLiterals && node.category === NodeCategory.Literal) {
    return null;
  }

  return node;
}

function filterNodesByOptions(
  rootNode: ScopeNode,
  options: Required<BuildScopeTreeOptions>
): ScopeNode {
  const clonedRoot = JSON.parse(JSON.stringify(rootNode)); // Simple deep clone for safety

  if (clonedRoot.children && clonedRoot.children.length > 0) {
    clonedRoot.children = clonedRoot.children
      .map((child: ScopeNode) =>
        filterNodesByOptionsRecursive({ ...child }, options)
      ) // child is ScopeNode
      .filter((child: ScopeNode | null) => child !== null) as ScopeNode[]; // child is ScopeNode | null
  }
  return clonedRoot;
}
// --- END: Node Filtering Logic ---
