import type { ScopeNode } from "../../../types";
import { analyzeBOI } from "./analyzeBOI";
import { buildHierarchicalStructure } from "./buildHierarchicalStructure";
import { findInnermostNodeByOffset } from "./graph_nodes";

// New: rely on the TypeScript compiler API via ts-morph for declaration resolution
import { Project } from "ts-morph";

export interface SemanticReference {
  name: string;
  type:
    | "function_call"
    | "variable_reference"
    | "import"
    | "property_access"
    | "destructured_variable";
  sourceNodeId: string;
  targetNodeId?: string;
  targets?: string[];
  position: { line: number; character: number };
  /** Absolute character offset (from SourceFile) where this reference occurs */
  offset: number;
  /** ID of the innermost ScopeNode that contains the reference usage (filled later) */
  usageNodeId?: string;
  isInternal: boolean; // true if declared within BOI scope
  direction: "outgoing";
}

export function buildSemanticReferenceGraph(
  focusNode: ScopeNode,
  rootNode: ScopeNode
): {
  nodes: ScopeNode[];
  references: SemanticReference[];
  hierarchicalRoot: ScopeNode;
} {
  // Check if focus node has meaningful source code for analysis
  if (
    !focusNode.source ||
    typeof focusNode.source !== "string" ||
    focusNode.source.trim().length < 10
  ) {
    return {
      nodes: [focusNode],
      references: [],
      hierarchicalRoot: focusNode,
    };
  }

  // Perform full BOI analysis for all cases (including JSX)
  const { externalReferences } = analyzeBOI(focusNode, rootNode);

  const referencedNodes: ScopeNode[] = [focusNode]; // Always include the focus node
  const resolvedReferences: SemanticReference[] = [];

  /* ======================================================================
     Leverage ts-morph to locate *actual* declaration nodes instead of our
     previous ad-hoc heuristics.
  ====================================================================== */

  // 1. Create a lightweight ts-morph project containing the file we are
  //    analysing.  We purposefully skip adding every file from the
  //    tsconfig to keep things fast.  For same-file references this is
  //    more than enough; cross-file look-ups will gracefully fall back.
  const sourceFilePath: string = (focusNode.id.split(":")[0] ||
    focusNode.id) as string; // Extract an arbitrary path string (first colon-separated segment)

  // Create an in-memory ts-morph project so we avoid filesystem access in the browser/webview environment.
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
  });

  // Fall back to an empty string if the full source isn't available (should be rare).
  const sourceText = typeof rootNode.source === "string" ? rootNode.source : "";

  // Create (or overwrite) the virtual source file inside the project.
  const sourceFile = project.createSourceFile(sourceFilePath, sourceText, {
    overwrite: true,
  });

  for (const ref of externalReferences) {
    // Locate the usage node by absolute character position.
    const usageNodeTs = sourceFile.getDescendantAtPos(ref.offset);

    if (!usageNodeTs) {
      continue; // Couldn't find node at offset (comment, whitespace, etc.)
    }

    // Resolve the symbol associated with this usage.
    const symbol = usageNodeTs.getSymbol() ?? usageNodeTs.getType().getSymbol();

    if (!symbol) {
      continue; // Not all nodes have symbols (e.g. punctuation)
    }

    const declarations = symbol.getDeclarations();

    if (!declarations || declarations.length === 0) {
      continue; // No declaration found (should be rare)
    }

    // Prefer declarations that live in the same file – falling back to the
    // first declaration if none match.
    let declTs = declarations.find(
      (d) => d.getSourceFile().getFilePath() === sourceFilePath
    );

    if (!declTs) {
      // Cross-file declaration – for now, we skip because we don't have a
      // ScopeTree built for that file.  Future refactor could lazily build
      // additional ScopeTrees.
      continue;
    }

    const declStart = declTs.getStart();

    const declarationScopeNode = findInnermostNodeByOffset(rootNode, declStart);

    if (!declarationScopeNode) {
      continue; // Couldn't map ts-morph node back to scope tree
    }

    // Guard against self-references (e.g. recursive function calls)
    if (declarationScopeNode.id === focusNode.id) {
      continue;
    }

    const usageScopeNodeId =
      findInnermostNodeByOffset(rootNode, ref.offset)?.id || focusNode.id;

    resolvedReferences.push({
      ...ref,
      targetNodeId: declarationScopeNode.id,
      targets: [focusNode.id],
      usageNodeId: usageScopeNodeId,
    });

    // Collect nodes for visualisation
    if (
      !referencedNodes.some(
        (sn: ScopeNode) => sn.id === declarationScopeNode.id
      )
    ) {
      referencedNodes.push(declarationScopeNode);
    }

    if (
      usageScopeNodeId &&
      !referencedNodes.some((sn: ScopeNode) => sn.id === usageScopeNodeId)
    ) {
      const usageScopeNode = findInnermostNodeByOffset(rootNode, ref.offset);
      if (usageScopeNode) {
        referencedNodes.push(usageScopeNode);
      }
    }
  }

  // If no edges could be resolved, fall back to minimal visualization
  if (resolvedReferences.length === 0) {
    return {
      nodes: referencedNodes,
      references: [],
      hierarchicalRoot: focusNode, // Use focus node as root for simple case
    };
  }

  // Build hierarchical structure for all nodes
  const hierarchicalRoot = buildHierarchicalStructure(
    referencedNodes,
    rootNode
  );

  return {
    nodes: referencedNodes,
    references: resolvedReferences,
    hierarchicalRoot,
  };
}
