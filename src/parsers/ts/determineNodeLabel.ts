import * as path from "path";

import * as ts from "typescript";

import { isAssignmentOperatorKind } from "./isAssignmentOperatorKind";

import { NodeCategory, type ScopeNode } from "../../types";

export function determineNodeLabel(
  item: ts.Node | ScopeNode, // Can be a TS AST node or a ScopeNode (for synthetic/post-processed nodes)
  sourceFile?: ts.SourceFile, // Required if item is ts.Node
  childrenForSyntheticNode?: ScopeNode[] // Optional: for nodes whose labels depend on children (e.g., ConditionalBlock)
): string {
  // Handle ScopeNode items (typically synthetic or already processed)
  if ("category" in item && "id" in item) {
    // Heuristic to check if it's a ScopeNode
    const scopeNode = item as ScopeNode;
    switch (scopeNode.category) {
      case NodeCategory.Program: // Root node
        return path.basename(scopeNode.id); // id is filePath for root
      case NodeCategory.ConditionalBlock:
        if (childrenForSyntheticNode && childrenForSyntheticNode.length > 0) {
          const clauseTypes: string[] = [];
          if (
            childrenForSyntheticNode.some(
              (c) => c.category === NodeCategory.IfClause
            )
          ) {
            clauseTypes.push("if");
          }
          if (
            childrenForSyntheticNode.some(
              (c) => c.category === NodeCategory.ElseIfClause
            )
          ) {
            if (!clauseTypes.includes("else if")) {
              clauseTypes.push("else if");
            }
          }
          if (
            childrenForSyntheticNode.some(
              (c) => c.category === NodeCategory.ElseClause
            )
          ) {
            clauseTypes.push("else");
          }
          if (clauseTypes.length > 0) {
            return clauseTypes.join("/");
          }
          return "Conditional"; // Fallback
        }
        return "Conditional Block"; // Default if no children info
      case NodeCategory.IfClause: // Should be derived from ts.Node, but as a fallback
      case NodeCategory.ElseIfClause:
      case NodeCategory.ElseClause: // Fallback if somehow called with ScopeNode
        return scopeNode.label || scopeNode.category; // Use pre-set label or category name
      case NodeCategory.Block: // E.g. a 'finally' block might be passed as a ScopeNode
        if (scopeNode.label === "finally") return "finally"; // If it was pre-labeled

        // General blocks usually don't have distinct labels unless they are special (like 'finally')
        return "Block"; // Or derive from its original kind if available in meta
      case NodeCategory.SyntheticGroup:
        return scopeNode.label; // Synthetic groups have their labels (e.g., "Imports") set directly
      default:
        // For other ScopeNodes, if they have a label, use it. Otherwise, fallback.
        return scopeNode.label || ts.SyntaxKind[scopeNode.kind] || "ScopeNode";
    }
  }

  // Handle ts.Node items
  const tsNode = item as ts.Node;
  if (!sourceFile) {
    // sourceFile is crucial for getText()
    // This case should ideally not be hit if called correctly from walk for ts.Node
    return ts.SyntaxKind[tsNode.kind] || "UnknownTSNode";
  }

  // --- Control Flow concise labeling ---
  if (ts.isTryStatement(tsNode)) return "try";
  if (ts.isCatchClause(tsNode)) return "catch"; // The block associated with catch
  if (ts.isForStatement(tsNode)) {
    const init = tsNode.initializer
      ? tsNode.initializer.getText(sourceFile).trim()
      : "";
    const cond = tsNode.condition
      ? tsNode.condition.getText(sourceFile).trim()
      : "";
    const incr = tsNode.incrementor
      ? tsNode.incrementor.getText(sourceFile).trim()
      : "";
    return `for (${init}; ${cond}; ${incr})`;
  }
  if (ts.isForOfStatement(tsNode)) {
    const init = tsNode.initializer.getText(sourceFile).trim();
    const expr = tsNode.expression.getText(sourceFile).trim();
    return `for (${init} of ${expr})`;
  }
  if (ts.isForInStatement(tsNode)) {
    const init = tsNode.initializer.getText(sourceFile).trim();
    const expr = tsNode.expression.getText(sourceFile).trim();
    return `for (${init} in ${expr})`;
  }
  if (ts.isWhileStatement(tsNode)) {
    // Label for the 'while' loop itself. Condition text could be added if desired.
    // Example: `while (${tsNode.expression.getText(sourceFile)})`
    return "while";
  }
  if (ts.isDoStatement(tsNode)) return "do";
  if (ts.isSwitchStatement(tsNode)) return "switch";
  if (ts.isCaseClause(tsNode)) {
    const expr = tsNode.expression?.getText(sourceFile);
    return expr ? `case ${expr}` : "case";
  }
  if (ts.isDefaultClause(tsNode)) return "default";

  // Labels for IfStatement clauses (called when creating IfClause, ElseIfClause nodes)
  if (ts.isIfStatement(tsNode)) {
    // This specific part is tricky because an IfStatement can be an IfClause or ElseIfClause
    // The caller (walk) determines its role.
    // For direct calls, this could be a generic "If Statement" or based on its expression.
    // Let's assume specific clauses are handled by their distinct node creation in walk.
    // If this function is called for the *whole* if statement that is NOT part of a chain handled by ConditionalBlock:
    return `if (${tsNode.expression.getText(sourceFile)})`;
  }

  // --- Declarations and Identifiers ---
  if (ts.isFunctionLike(tsNode) && tsNode.name && ts.isIdentifier(tsNode.name))
    return tsNode.name.text;
  if (ts.isArrowFunction(tsNode)) return "() => {}"; // Revised: Always return () => {} as base label
  if (ts.isClassLike(tsNode) && tsNode.name && ts.isIdentifier(tsNode.name))
    return tsNode.name.text;
  if (ts.isVariableDeclaration(tsNode))
    // Revised: Use getText() for full LHS
    return tsNode.name.getText(sourceFile);
  if (ts.isModuleDeclaration(tsNode))
    return tsNode.name.getText(sourceFile) || tsNode.name.text;
  if (ts.isPropertyAccessExpression(tsNode))
    return (
      tsNode.name.getText(sourceFile) || tsNode.name.escapedText.toString()
    );
  if (ts.isIdentifier(tsNode)) return tsNode.text; // General identifier

  // --- Expressions ---
  if (ts.isCallExpression(tsNode)) {
    const expressionText =
      tsNode.expression.getText(sourceFile)?.split("\n")[0] || "";
    return expressionText.length > 50
      ? expressionText.substring(0, 47) + "..."
      : expressionText ||
          ts.SyntaxKind[tsNode.expression.kind] ||
          "CallExpression";
  }

  // --- Imports ---
  if (ts.isImportDeclaration(tsNode)) {
    const moduleSpecifier = tsNode.moduleSpecifier;
    let rawImportPath: string | undefined = undefined;
    if (ts.isStringLiteral(moduleSpecifier)) {
      rawImportPath = moduleSpecifier.text;
    } else {
      const text = moduleSpecifier.getText(sourceFile)?.trim();
      if (text) {
        if (
          (text.startsWith("'") && text.endsWith("'")) ||
          (text.startsWith('"') && text.endsWith('"'))
        ) {
          rawImportPath = text.substring(1, text.length - 1);
        } else {
          rawImportPath = text;
        }
      }
    }
    if (rawImportPath) {
      return path.basename(rawImportPath);
    }
    return "Import"; // Fallback
  }

  // --- JSX ---
  if (ts.isJsxElement(tsNode)) {
    const tagNameNode = tsNode.openingElement.tagName;
    let tagNameString = tagNameNode.getText(sourceFile);
    if (tagNameString === "" && ts.isIdentifier(tagNameNode))
      tagNameString = tagNameNode.text;
    return tagNameString ? `<${tagNameString}>` : "<JSXElement>";
  }
  if (ts.isJsxSelfClosingElement(tsNode)) {
    const tagNameNode = tsNode.tagName;
    let tagNameString = tagNameNode.getText(sourceFile);
    if (tagNameString === "" && ts.isIdentifier(tagNameNode))
      tagNameString = tagNameNode.text;
    return tagNameString ? `<${tagNameString}>` : "<JSXElement>";
  }
  if (ts.isJsxFragment(tsNode)) return " "; // Results in < >

  // --- Return Statements ---
  if (ts.isReturnStatement(tsNode)) {
    const exprText = tsNode.expression?.getText(sourceFile) || "";
    const truncatedExpr = exprText.substring(0, 30);
    return exprText
      ? `return ${truncatedExpr}${exprText.length > 30 ? "..." : ""}`
      : "return";
  }

  // --- Assignment Expressions ---
  if (
    ts.isBinaryExpression(tsNode) &&
    isAssignmentOperatorKind(tsNode.operatorToken.kind)
  ) {
    const leftText = tsNode.left.getText(sourceFile);
    const operatorText = tsNode.operatorToken.getText(sourceFile);
    const rightText = tsNode.right.getText(sourceFile);

    return `${leftText} ${operatorText} ${rightText}`;
  }

  // --- Type Nodes ---
  if (ts.isInterfaceDeclaration(tsNode) && tsNode.name) return tsNode.name.text;
  if (ts.isTypeAliasDeclaration(tsNode) && tsNode.name) return tsNode.name.text;

  // Fallback: If this is a ControlFlow node not handled by specific cases above, return its kind.
  // Or an empty string if that's preferred to avoid overly generic labels like "IfStatement" for already handled structures.
  // The mapKindToCategory check might be redundant if all control flow is handled above.
  // if (mapKindToCategory(tsNode, sourceFile) === NodeCategory.ControlFlow) {
  //   return ts.SyntaxKind[tsNode.kind] || "ControlFlow"; // Or ""
  // }
  // General Fallback
  return ts.SyntaxKind[tsNode.kind] || "UnknownNode";
}
