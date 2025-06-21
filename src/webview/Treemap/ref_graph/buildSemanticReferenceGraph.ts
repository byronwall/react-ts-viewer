import { type Node, Project, SyntaxKind, ts } from "ts-morph";

import { findInnermostNodeByOffset } from "./graph_nodes";

import type { ScopeNode } from "../../../types";

interface SemanticReference {
  name: string;
  type:
    | "function_call"
    | "variable_reference"
    | "import"
    | "property_access"
    | "destructured_variable";
  sourceNodeId: string;
  targetNodeId?: string;
  position: { line: number; character: number };
  /** Absolute character offset (from SourceFile) where this reference occurs */
  offset: number;
  /** ID of the innermost ScopeNode that contains the reference usage (filled later) */
  usageNodeId?: string;
}

export function buildSemanticReferenceGraph(
  focusNode: ScopeNode,
  rootNode: ScopeNode,
  options: { includeTypeReferences?: boolean } = {}
): {
  nodes: ScopeNode[];
  references: SemanticReference[];
} {
  const { includeTypeReferences = false } = options;

  // Guard against missing or trivial source text
  if (
    !focusNode.source ||
    typeof focusNode.source !== "string" ||
    focusNode.source.trim().length < 3
  ) {
    return {
      nodes: [focusNode],
      references: [],
    };
  }

  /* ------------------------------------------------------------------ *
   * Build ts-morph project for the FULL file so we can resolve        *
   * symbols to their declarations (needed for drawing edges).          *
   * ------------------------------------------------------------------ */

  const fullSource: string =
    typeof rootNode.source === "string" ? rootNode.source : "";

  const project = new Project({ useInMemoryFileSystem: true });

  // Determine a plausible file path from the node id (everything before last ':').
  const match = focusNode.id.match(/^(.*):\d+-\d+$/);
  const sourceFilePath = match ? match[1]! : "file.tsx";

  const sourceFile = project.createSourceFile(sourceFilePath, fullSource, {
    scriptKind: ts.ScriptKind.TSX,
    overwrite: true,
  });

  // Character range of the BOI (focus node) taken directly from the id
  const rangeMatch = focusNode.id.match(/:(\d+)-(\d+)$/);
  const focusStartOffset = rangeMatch ? parseInt(rangeMatch[1]!, 10) : 0;
  const focusEndOffset = rangeMatch
    ? parseInt(rangeMatch[2]!, 10)
    : fullSource.length;

  /* ------------------------------------------------------------------ *
   * Step 1:  Collect identifiers INSIDE focus range + their symbols   *
   * ------------------------------------------------------------------ */

  const declaredInside = new Set<string>();
  const externalUsages: { name: string; node: import("ts-morph").Node }[] = [];

  sourceFile.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id) => {
    const pos = id.getStart();
    if (pos < focusStartOffset || pos > focusEndOffset) return; // outside BOI

    // Check if this identifier *declares* something within BOI
    const parent = id.getParent();
    if (parent) {
      const kind = parent.getKind();
      if (
        (kind === SyntaxKind.VariableDeclaration ||
          kind === SyntaxKind.Parameter ||
          kind === SyntaxKind.FunctionDeclaration ||
          kind === SyntaxKind.ClassDeclaration ||
          kind === SyntaxKind.InterfaceDeclaration ||
          kind === SyntaxKind.TypeAliasDeclaration ||
          kind === SyntaxKind.EnumDeclaration) &&
        id.getStart() === parent.getStart() // being conservative – id is the name
      ) {
        declaredInside.add(id.getText());
        return;
      }
    }

    // ---------------------------------------------
    // Filtering rules:
    // 1. Skip JSX attribute names.
    // 2. Skip intrinsic JSX tag names (opening, self-closing, or closing)
    // 3. Skip identifiers that are the right-hand property in a property-access chain;
    //    we only want the left-most root symbol (e.g., keep "api" in "api.update.mutate").
    // ---------------------------------------------

    const p = id.getParent();
    const pKind = p?.getKind();

    // 1) JSX attribute
    if (pKind === SyntaxKind.JsxAttribute) return;

    // 2) intrinsic JSX tag names (opening, self-closing, or closing)
    if (
      (pKind === SyntaxKind.JsxOpeningElement ||
        pKind === SyntaxKind.JsxSelfClosingElement ||
        pKind === SyntaxKind.JsxClosingElement) &&
      /^[a-z]/.test(id.getText())
    ) {
      return;
    }

    // 3) right-hand side of property access expression
    if (pKind === SyntaxKind.PropertyAccessExpression) {
      // ts-morph provides getNameNode on PropertyAccessExpression
      const pae: any = p;
      if (typeof pae.getNameNode === "function") {
        const nameNode = pae.getNameNode();
        if (nameNode && nameNode.getText() === id.getText()) {
          return; // skip RHS property
        }
      }
    }

    // 4) Identifier used as an explicit property key in an object literal
    //    Example: const obj = { x: 42 } – here `x` should NOT be treated as a
    //    variable reference, only as a literal key. We still want to keep
    //    shorthand properties (e.g., `{ x }`) because in that scenario the
    //    identifier *is* a variable reference.
    if (pKind === SyntaxKind.PropertyAssignment) {
      const pa: any = p;
      if (typeof pa.getNameNode === "function") {
        const nameNode = pa.getNameNode();
        // Skip when the identifier is the *name* of the property assignment
        // (and not part of the initializer).
        if (nameNode && nameNode.getStart() === id.getStart()) {
          return;
        }
      }
    }

    // 5) Skip identifiers that appear only in *type* positions (e.g., in a
    //    type assertion `as SomeType`, generic parameter `<T>`, or other
    //    TypeReference usage) **unless** the caller explicitly opts in via
    //    includeTypeReferences.
    if (!includeTypeReferences) {
      const isTypePosition = (() => {
        let current: Node | undefined = id.getParent();
        const typePositionKinds = new Set([
          SyntaxKind.TypeReference,
          SyntaxKind.TypePredicate,
          SyntaxKind.TypeLiteral,
          SyntaxKind.ImportType,
          SyntaxKind.UnionType,
          SyntaxKind.IntersectionType,
          SyntaxKind.AsExpression,
          SyntaxKind.TypeQuery,
          SyntaxKind.ExpressionWithTypeArguments,
        ]);
        while (current) {
          if (typePositionKinds.has(current.getKind())) return true;
          current = current.getParent();
        }
        return false;
      })();

      if (isTypePosition) {
        return; // skip type-only reference
      }
    }

    // Otherwise, count as external usage
    externalUsages.push({ name: id.getText(), node: id });
  });

  /* ------------------------------------------------------------------ *
   * Step 2:  Convert usages to SemanticReference objects              *
   * ------------------------------------------------------------------ */

  const references: SemanticReference[] = [];
  const nodes: ScopeNode[] = [focusNode];

  const seen = new Set<string>(); // dedupe by name + position

  const offsetToLineChar = (
    src: string,
    off: number
  ): { line: number; character: number } => {
    if (off < 0) return { line: 0, character: 0 };
    const before = src.slice(0, off);
    const line = before.split(/\n/).length; // 1-based
    const lastNewlineIdx = before.lastIndexOf("\n");
    const character = off - (lastNewlineIdx + 1);
    return { line, character };
  };

  for (const { name, node } of externalUsages) {
    if (declaredInside.has(name)) continue; // local capture

    const key = `${name}:${node.getStart()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let targetNodeId: string | undefined;

    const symbol = node.getSymbol();
    const declarations = symbol ? symbol.getDeclarations() : [];

    if (declarations && declarations.length > 0) {
      const declNode = declarations[0]!;
      const declOffset = declNode.getStart();

      const declScope = findInnermostNodeByOffset(rootNode, declOffset);
      if (declScope && declScope.id !== focusNode.id) {
        targetNodeId = declScope.id;
        if (!nodes.some((n) => n.id === declScope.id)) nodes.push(declScope);
      }
    }

    const offset = node.getStart();
    const position = offsetToLineChar(fullSource, offset);

    // Determine the *innermost* scope node that contains this usage so we can
    // point the arrow to the exact box instead of the BOI header.
    let usageNodeId = focusNode.id;
    const usageScope = findInnermostNodeByOffset(focusNode, offset);
    if (usageScope) {
      usageNodeId = usageScope.id;

      // Ensure this scope is included in the returned node set so the caller
      // can reliably locate it when drawing arrows.
      if (!nodes.some((n) => n.id === usageScope.id)) {
        nodes.push(usageScope);
      }
    }

    references.push({
      name,
      type: "variable_reference",
      sourceNodeId: focusNode.id,
      targetNodeId,
      position,
      offset,
      usageNodeId,
    });
  }

  return {
    nodes,
    references,
  };
}
