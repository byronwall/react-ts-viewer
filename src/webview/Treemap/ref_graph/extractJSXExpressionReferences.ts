import * as ts from "typescript";

import { VariableScope } from "./graph_nodes";
import { getLineAndCharacter } from "./ts_ast";
import { isVariableDeclaredInScope } from "./graph_nodes";
import { isIdentifierTypePosition, isKeyword } from "./ts_ast";
import { isIdentifierPartOfJsxAttributeName } from "./ts_ast";
import { SemanticReference } from "./buildSemanticReferenceGraph";

// Helper function to extract references from JSX expressions

export function extractJSXExpressionReferences(
  expression: ts.Expression,
  sourceNodeId: string,
  boiScope: VariableScope,
  references: SemanticReference[],
  sourceFile: ts.SourceFile
) {
  function visitExpression(expr: ts.Expression) {
    const position = getLineAndCharacter(sourceFile, expr.pos);

    if (ts.isIdentifier(expr) && !isIdentifierTypePosition(expr)) {
      // Skip identifiers that are **property names** in:
      //   1. A property access expression – e.g. the `includes` in `obj.includes`.
      //   2. An object-literal property assignment – e.g. the `x` in `{ x: offsetX }`.
      // These are not variable references; we only care about the root identifiers
      // that may need to be passed into the refactored function.
      if (
        (ts.isPropertyAccessExpression(expr.parent) &&
          expr.parent.name === expr) ||
        (ts.isPropertyAssignment(expr.parent) && expr.parent.name === expr)
      ) {
        return; // Ignore property name part
      }

      // Skip identifiers originating from within string literals or template literals.
      if (ts.isStringLiteralLike(expr.parent as ts.Node)) {
        return;
      }

      // Ignore any identifier that belongs to a JSX attribute name (including dashed attributes).
      if (isIdentifierPartOfJsxAttributeName(expr)) {
        return;
      }

      const name = expr.text;
      if (!isKeyword(name)) {
        const isInternal = isVariableDeclaredInScope(name, boiScope);

        if (!isInternal) {
          references.push({
            name,
            type: "variable_reference",
            sourceNodeId,
            position,
            offset: expr.pos,
            isInternal,
            direction: "outgoing",
            targets: [],
          });
        }
      }
    } else if (ts.isPropertyAccessExpression(expr)) {
      // Capture only the root object identifier of the JSX property access
      const rootObj = expr.expression;
      if (ts.isIdentifier(rootObj)) {
        const name = rootObj.text;
        const isInternal = isVariableDeclaredInScope(name, boiScope);
        if (!isInternal) {
          references.push({
            name,
            type: "variable_reference",
            sourceNodeId,
            position,
            offset: expr.pos,
            isInternal,
            direction: "outgoing",
            targets: [],
          });
        }
      }
    } else if (ts.isCallExpression(expr)) {
      if (ts.isIdentifier(expr.expression)) {
        const name = expr.expression.text;
        const isInternal = isVariableDeclaredInScope(name, boiScope);
        if (!isInternal) {
          references.push({
            name,
            type: "function_call",
            sourceNodeId,
            position,
            offset: expr.pos,
            isInternal,
            direction: "outgoing",
            targets: [],
          });
        }
      } else if (ts.isPropertyAccessExpression(expr.expression)) {
        const objectName = ts.isIdentifier(expr.expression.expression)
          ? expr.expression.expression.text
          : "unknown";
        const propertyName = expr.expression.name.text;
        const name = `${objectName}.${propertyName}`;
        const isInternal = isVariableDeclaredInScope(objectName, boiScope);
        if (!isInternal) {
          references.push({
            name,
            type: "property_access",
            sourceNodeId,
            position,
            offset: expr.pos,
            isInternal,
            direction: "outgoing",
            targets: [],
          });
        }
      }
    }

    // Recursively visit child expressions
    ts.forEachChild(expr, (child) => {
      if (ts.isExpression(child)) {
        visitExpression(child);
      }
    });
  }

  visitExpression(expression);
}
