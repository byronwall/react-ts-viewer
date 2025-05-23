import * as ts from "typescript";
import { NodeCategory } from "../../types";
import { isAssignmentOperatorKind } from "./isAssignmentOperatorKind";

export function mapKindToCategory(
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
    ts.isCatchClause(node) ||
    ts.isCaseClause(node) || // Added
    ts.isDefaultClause(node) // Added
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
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    const tagNameNode = ts.isJsxElement(node)
      ? node.openingElement.tagName
      : node.tagName;
    const tagName = tagNameNode.getText(sourceFile);
    if (tagName && /^[a-z]/.test(tagName)) {
      return NodeCategory.JSXElementDOM;
    } else {
      return NodeCategory.JSXElementCustom;
    }
  }
  if (ts.isJsxFragment(node)) return NodeCategory.JSX;

  // Add new mappings
  if (ts.isImportDeclaration(node)) return NodeCategory.Import;
  if (ts.isTypeAliasDeclaration(node)) return NodeCategory.TypeAlias;
  if (ts.isInterfaceDeclaration(node)) return NodeCategory.Interface;
  if (ts.isReturnStatement(node)) return NodeCategory.ReturnStatement;
  if (
    ts.isBinaryExpression(node) &&
    isAssignmentOperatorKind(node.operatorToken.kind)
  ) {
    return NodeCategory.Assignment;
  }
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
