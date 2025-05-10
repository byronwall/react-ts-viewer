import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import { Position, NodeCategory, ScopeNode } from "./types";

// Position helper (already in types.ts, but ts.LineAndCharacter is 0-based for line)
// export interface Position {
//   line: number; // 1-based
//   column: number; // 0-based
// }

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
  if (
    ts.isIfStatement(node) ||
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
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
    return node.tagName.getText(sourceFile) || "JSXElement";

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
  fileText: string = fs.readFileSync(filePath, "utf8")
): ScopeNode {
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
    let currentContainer = parentNodeInTree;
    const category = mapKindToCategory(node, sf);

    // Create a new scope node if it's a scope boundary OR a significant non-boundary element like a variable declaration or call
    if (
      isScopeBoundary(node) ||
      category === NodeCategory.Variable ||
      category === NodeCategory.ReactHook ||
      category === NodeCategory.Call ||
      category === NodeCategory.JSX
    ) {
      const startPos = node.getStart(sf, /*includeJsDoc*/ false); // false to get actual start
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

  return root;
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
