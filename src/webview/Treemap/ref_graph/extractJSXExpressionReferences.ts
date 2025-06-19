import * as ts from "typescript";

import { VariableScope } from "./graph_nodes";
import { getLineAndCharacter } from "./ts_ast";
import { isVariableDeclaredInScope } from "./graph_nodes";
import { isIdentifierTypePosition, isKeyword } from "./ts_ast";
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
