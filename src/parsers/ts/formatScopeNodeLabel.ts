import * as ts from "typescript";

import { NodeCategory, type ScopeNode } from "../../types";

// New function to format the display label, incorporating logic previously in getNodeDisplayLabel.tsx

export function formatScopeNodeLabel(node: ScopeNode): string {
  let displayLabel = node.label; // Initialize with baseLabel, which is node.label

  // Logic adapted from getNodeDisplayLabel.tsx
  // Only include cases that modify the base label.
  switch (node.category) {
    case NodeCategory.Module:
      displayLabel = `module ${displayLabel}`;
      break;
    case NodeCategory.Class:
      displayLabel = `class ${displayLabel}`;
      break;
    case NodeCategory.ReactComponent:
      displayLabel = `<${displayLabel}>`;
      break;
    case NodeCategory.ArrowFunction:
      if (node.meta?.collapsed === "arrowFunction") {
        if (node.meta?.call) {
          displayLabel = `() => ${node.meta.call}`;
        } else {
          displayLabel = `() => { ... }`; // Simple collapsed view
        }
      } else if (!displayLabel) {
        // Fallback if baseLabel (displayLabel here) was empty
        displayLabel = "Arrow Function";
      }
      // If displayLabel had a value (e.g. from variable assignment), it's used directly.
      break;
    case NodeCategory.Function:
      displayLabel = `${displayLabel}()`; // e.g., "myFunction()"
      break;
    case NodeCategory.Block:
      // For blocks that are not special (like 'finally', 'catch body')
      // and not collapsed. 'finally' label is already set by determineNodeLabel.
      // General blocks might not need a prefix, or could be "{ Block }"
      if (displayLabel === "Block") {
        // Only change if it's the generic "Block"
        displayLabel = "{ Block }";
      }
      // If displayLabel was specific (e.g., "finally"), it remains.
      break;
    case NodeCategory.Import:
      // Remove "import " prefix, just use the module name directly
      // displayLabel remains as is (the module name)
      break;
    case NodeCategory.TypeAlias:
      displayLabel = `type ${displayLabel}`;
      break;
    case NodeCategory.Interface:
      displayLabel = `interface ${displayLabel}`;
      break;
    case NodeCategory.Literal:
      // determineNodeLabel now returns the literal's text.
      // Format it for display, e.g., strings in quotes.
      if (node.kind === ts.SyntaxKind.StringLiteral) {
        // If node.source is the full source text of the literal including quotes
        // and determineNodeLabel returns text without quotes, we might need to re-add them
        // For now, assume displayLabel (baseLabel) is the raw string content.
        // Let's refine to check if it *looks* like it needs quoting.
        // If determineNodeLabel for StringLiteral returns node.text, it won't have quotes.
        if (
          !(displayLabel.startsWith("'") && displayLabel.endsWith("'")) &&
          !(displayLabel.startsWith('"') && displayLabel.endsWith('"'))
        ) {
          displayLabel = `'${displayLabel}'`; // Add single quotes if not already quoted
        }
      }
      // For numbers, booleans, displayLabel (baseLabel) is already correct.
      break;
    case NodeCategory.SyntheticGroup:
      // Labels like "Imports", "Type defs" are set directly by determineNodeLabel for the group.
      displayLabel = `${displayLabel} (${node.children?.length || 0})`;
      break;
    default:
      // Handles NodeCategory.Program, Variable, ControlFlow, IfClause, etc., and Other.
      // If displayLabel (baseLabel) was "UnknownNode" or empty, set it to the category name.
      if (displayLabel === "UnknownNode" || !displayLabel) {
        displayLabel = node.category;
      }
      // Otherwise, displayLabel (baseLabel) is used as is.
      break;
  }

  // Add line numbers if not a synthetic group and not the program root
  if (
    node.category !== NodeCategory.SyntheticGroup &&
    node.category !== NodeCategory.Program
  ) {
    if (node.loc && node.loc.start && node.loc.end) {
      if (node.loc.start.line === node.loc.end.line) {
        displayLabel += ` [${node.loc.start.line}]`;
      } else {
        displayLabel += ` [${node.loc.start.line}-${node.loc.end.line}]`;
      }
    }
  }
  return displayLabel;
}
