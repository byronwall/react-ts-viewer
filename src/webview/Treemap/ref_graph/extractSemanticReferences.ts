import * as ts from "typescript";
import { type SemanticReference } from "./buildSemanticReferenceGraph";
import { type VariableScope } from "./graph_nodes";
import { getLineAndCharacter } from "./ts_ast";
import { isVariableDeclaredInScope } from "./graph_nodes";
import { extractJSXExpressionReferences } from "./extractJSXExpressionReferences";
import { getRangeFromNodeId } from "./graph_nodes";
import { isJSXComponentName } from "./ts_ast";
import {
  isIdentifierInsideJsxText,
  isIdentifierTypePosition,
  isKeyword,
  isPartOfDeclaration,
} from "./ts_ast";

// Extract semantic references from AST

export function extractSemanticReferences(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  sourceNodeId: string,
  boiScope: VariableScope
): SemanticReference[] {
  const references: SemanticReference[] = [];

  function visitNode(n: ts.Node) {
    const position = getLineAndCharacter(sourceFile, n.pos);

    // Function calls
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const name = n.expression.text;
      const isInternal = isVariableDeclaredInScope(name, boiScope);
      if (!isInternal) {
        references.push({
          name,
          type: "function_call",
          sourceNodeId,
          position,
          offset: n.pos,
          isInternal,
          direction: "outgoing",
          targets: [],
        });
      }
    }

    // Property access (calls or plain) – capture ONLY the root object identifier
    const handlePropertyAccess = (pa: ts.PropertyAccessExpression) => {
      const root = pa.expression;
      if (ts.isIdentifier(root)) {
        const name = root.text;
        if (!isKeyword(name)) {
          const isInternal = isVariableDeclaredInScope(name, boiScope);
          if (!isInternal) {
            references.push({
              name,
              type: "variable_reference",
              sourceNodeId,
              position,
              offset: pa.pos,
              isInternal,
              direction: "outgoing",
              targets: [],
            });
          }
        }
      }
    };

    // Property access in a call expression: foo.bar()
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      handlePropertyAccess(n.expression);
    }

    // Stand-alone property access: foo.bar
    if (
      ts.isPropertyAccessExpression(n) &&
      !ts.isCallExpression(n.parent) /* avoid double count */
    ) {
      handlePropertyAccess(n);
    }

    // Variable references (not in declarations)
    if (
      ts.isIdentifier(n) &&
      !isPartOfDeclaration(n) &&
      !isIdentifierTypePosition(n)
    ) {
      // Skip identifiers that are *property names* in a property access expression
      // e.g. the `includes` in `keysToTrack.includes`. We only want the root object
      // (handled separately by `handlePropertyAccess`).
      if (ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) {
        return; // ignore property name part
      }

      const name = n.text;

      // Skip common keywords and JSX component names
      if (
        !isKeyword(name) &&
        !isJSXComponentName(n) &&
        !isIdentifierInsideJsxText(n)
      ) {
        const isInternal = isVariableDeclaredInScope(name, boiScope);

        if (!isInternal) {
          references.push({
            name,
            type: "variable_reference",
            sourceNodeId,
            position,
            offset: n.pos,
            isInternal,
            direction: "outgoing",
            targets: [],
          });
        }
      }
    }

    // JSX Expression containers - extract variables from {variable} expressions
    if (ts.isJsxExpression(n) && n.expression) {
      extractJSXExpressionReferences(
        n.expression,
        sourceNodeId,
        boiScope,
        references,
        sourceFile
      );
    }

    // Import declarations
    if (ts.isImportDeclaration(n) && n.importClause) {
      if (n.importClause.name) {
        // Default import
        const name = n.importClause.name.text;
        references.push({
          name,
          type: "import",
          sourceNodeId,
          position,
          offset: n.pos,
          isInternal: false,
          direction: "outgoing",
          targets: [],
        });
      }

      if (n.importClause.namedBindings) {
        if (ts.isNamedImports(n.importClause.namedBindings)) {
          // Named imports
          n.importClause.namedBindings.elements.forEach((element) => {
            const name = element.name.text;
            references.push({
              name,
              type: "import",
              sourceNodeId,
              position,
              offset: n.pos,
              isInternal: false,
              direction: "outgoing",
              targets: [],
            });
          });
        }
      }
    }

    ts.forEachChild(n, visitNode);
  }

  visitNode(node);

  // Convert local offsets to absolute file offsets
  const focusStartOffset = getRangeFromNodeId(sourceNodeId)?.start ?? 0;
  references.forEach((r) => {
    r.offset = r.offset + focusStartOffset;
  });

  return references;
}
