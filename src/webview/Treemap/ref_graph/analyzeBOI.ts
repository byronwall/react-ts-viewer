import type * as ts from "typescript";
import type { ScopeNode } from "../../../types";
import { type SemanticReference } from "./buildSemanticReferenceGraph";
import { buildVariableScope } from "./buildVariableScope";
import { extractSemanticReferences } from "./extractSemanticReferences";
import { findIncomingReferences } from "./findIncomingReferences";
import { getPathToNode } from "./graph_nodes";
import { createSourceFile, getLineAndCharacter } from "./ts_ast";

interface BOIAnalysis {
  scopeBoundary: { start: number; end: number };
  internalDeclarations: Map<
    string,
    { node: ts.Node; name: string; line: number }
  >;
  externalReferences: SemanticReference[];
  incomingReferences: SemanticReference[];
  recursiveReferences: SemanticReference[];
}

// Analyze Block of Interest (BOI) for semantic references
export function analyzeBOI(
  focusNode: ScopeNode,
  rootNode: ScopeNode
): BOIAnalysis {
  if (!focusNode.source || typeof focusNode.source !== "string") {
    console.warn("⚠️ No source code available for BOI analysis");
    return {
      scopeBoundary: { start: 0, end: 0 },
      internalDeclarations: new Map(),
      externalReferences: [],
      incomingReferences: [],
      recursiveReferences: [],
    };
  }

  try {
    // Create TypeScript source file
    const sourceFile = createSourceFile(focusNode.source);

    // Build variable scope for the BOI
    const boiScope = buildVariableScope(sourceFile, sourceFile);

    // Extract semantic references
    const allReferences = extractSemanticReferences(
      sourceFile,
      sourceFile,
      focusNode.id,
      boiScope
    );

    // ------------------------------------------------------------------
    // Compute absolute position (line/character) across the FULL source file
    // ------------------------------------------------------------------
    const fullSourceFile: ts.SourceFile | null =
      typeof rootNode.source === "string"
        ? createSourceFile(rootNode.source)
        : null;

    // Identify the variable name that *owns* the BOI (e.g. the variable to
    // which an arrow-function is assigned).  Any reference to that variable
    // is considered *internal* and should therefore be excluded from the
    // "external" set.
    const pathToFocus = getPathToNode(rootNode, focusNode.id);
    const owningVarNode = [...pathToFocus].reverse().find((n) => {
      return String(n.category) === "Variable";
    });

    const boiVarName = (() => {
      if (!owningVarNode?.label) return null;
      // Heuristic: first token of the label before whitespace or assignment
      return owningVarNode.label.split(/[\s=:{[(]/)[0] ?? null;
    })();

    // Helper to de-duplicate references (name+type+offset)
    const unique = new Map<string, SemanticReference>();
    allReferences.forEach((ref) => {
      const key = `${ref.name}|${ref.type}|${ref.offset}`;
      if (!unique.has(key)) {
        unique.set(key, ref);
      }
    });

    let dedupedReferences = Array.from(unique.values());

    // Recalculate line/character using the full file so the positions are absolute
    if (fullSourceFile) {
      dedupedReferences = dedupedReferences.map((r) => ({
        ...r,
        position: getLineAndCharacter(fullSourceFile, r.offset),
      }));
    }

    // Categorize references by direction, excluding refs that point to the
    // BOI's own variable name (if detected).
    let externalReferences = dedupedReferences.filter(
      (ref) => !ref.isInternal && ref.name !== boiVarName
    );
    const recursiveReferences = dedupedReferences.filter(
      (ref) => ref.isInternal
    );

    // Final de-duplication for external refs – one entry per (name,type)
    {
      const seen = new Map<string, SemanticReference>();
      externalReferences.forEach((ref) => {
        // not concerned with type here, just want to avoid duplicates
        const key = ref.name;
        if (!seen.has(key)) {
          seen.set(key, ref);
        }
      });
      externalReferences = Array.from(seen.values());
    }

    // Find incoming references by searching the root node for references to BOI variables
    const incomingReferences = findIncomingReferences(
      focusNode,
      rootNode,
      boiScope
    );

    return {
      scopeBoundary: { start: 0, end: focusNode.source.length },
      internalDeclarations: boiScope.declarations,
      externalReferences,
      incomingReferences,
      recursiveReferences,
    };
  } catch (error) {
    console.error("❌ Error in BOI analysis:", error);
    return {
      scopeBoundary: { start: 0, end: 0 },
      internalDeclarations: new Map(),
      externalReferences: [],
      incomingReferences: [],
      recursiveReferences: [],
    };
  }
}
