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
  /*
  ============================================================
   buildSemanticReferenceGraph – High-Level Summary & Review
  ============================================================
  Purpose
  -------
  Given a `focusNode` (the slice of AST the user clicked on) and the
  `rootNode` (the full parsed file), this routine:
  1. Runs a "Breadth-Of-Interest" analysis (`analyzeBOI`) to collect
     external, incoming, and recursive identifier references relative to the
     focus node.
  2. Heuristically filters that raw reference list down to a *small* set of
     the "most interesting" references (`maxReferences` ≤ 20) and the nodes
     that declare / use them (`maxNodes` ≤ 20).
  3. Attempts to resolve every kept reference to a concrete declaration
     node via `findNodesByName`, `nodeDeclaresIdentifier`, and custom
     category sorting.
  4. Produces three artefacts for visualisation:
      • `nodes`               – all ScopeNodes we decided are relevant
      • `references`          – the resolved semantic edges (outgoing ↔ incoming)
      • `hierarchicalRoot`    – a trimmed AST suitable for a tree-view

  Where Things Get Hokey / Fragile
  --------------------------------
  • **Hard-coded magic numbers** – `maxNodes = 20`, `maxReferences = 20`.
    These caps are baked-in; any dataset that legitimately needs more will
    simply be truncated.

  • **Brittle identifier filtering** – The `prioritizedReferences` filter:
    – Maintains a *hand-written* list (`isGenericName`) of hundreds of common
      words.  Easy to miss cases and creates maintenance burden.
    – "LikelyTextToken" regex assumes English and specific casing.
    – Length & single-character heuristics silently drop legitimate code
      (e.g. loop indices `i`, `j`).

  • **Ad-hoc declaration ranking** – Declaration categories are compared
    by `String(n.category).startsWith(c)` instead of enums.  Ordering is
    guessed, not documented.

  • **Monolithic function** – ~300 lines mixing data collection, filtering,
    resolution, and tree construction.  Hard to test & reason about.

  • **TODO without follow-up** – Comment says "need to refactor this code
    out then write tests to verify it's working" – but it never happens.

  Quick Wins / Cleanup Ideas
  --------------------------
  1. **Extract Helpers**
      • `filterRelevantReferences(allRefs): SemanticReference[]`
      • `rankDeclarationCandidates(candidates): ScopeNode[]`
      • `resolveReference(ref, rootNode): ResolvedReference | undefined`
      Each isolated piece gets unit tests.

  2. **Parameterise Caps**
     Accept optional `{ maxNodes, maxReferences }` args so callers can tune
     behaviour instead of editing source.

  3. **Replace magic lists with Sets & config**
     Move `genericIdentifiers` and `htmlAttributeNames` into a JSON / util
     file.  Use `new Set([...])` for O(1) lookups.

  4. **Introduce TypeScript enums** for `SemanticReference.type` and
     declaration categories to avoid typo bugs and improve readability.

  5. **Leverage real AST checks**
     Instead of regex-based `isLikelyTextToken`, walk the parent JSX/Text
     nodes to know if a token originated from plain text.

  6. **Early exits for performance**
     Short-circuit inside the `for` loop once `referencedNodes` hits
     `maxNodes` *and* every remaining reference would only add more nodes.

  Testing Strategy
  ----------------
  • **Unit tests per helper** – Feed synthetic AST fragments to make sure
    filtering and ranking behave predictably (e.g. "i" is kept when inside
    a `for` loop but dropped in JSX text).

  • **Golden-file snapshots** – For a handful of real components, snapshot
    the `{ nodes, references }` JSON and ensure it stays stable.

  • **Property-based tests** – Randomly generate variable names to verify
    generic-identifier filter never drops legal identifiers of varying
    lengths/cases.

  Refactor Roadmap
  ----------------
  Phase 1: Extract helpers & add tests (no behaviour change).
  Phase 2: Replace hard-coded lists with injectable config.
  Phase 3: Split semantic-graph building and hierarchical-tree building
           into two discrete public functions.
  Phase 4: Re-introduce smarter text-token detection using real AST info.

  ============================================================
   End of meta commentary – original source follows ↓
  ============================================================
  */
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
    focusNode.id) as string; // Extract file path (portion before first colon)
  const project = new Project({
    useInMemoryFileSystem: false,
    skipAddingFilesFromTsConfig: true,
  });

  let sourceFile;
  try {
    sourceFile = project.addSourceFileAtPath(sourceFilePath as string);
  } catch (err) {
    // On any failure (e.g. the file no longer exists), bail out and just
    // return the minimal result so we don't crash the UI.
    console.warn(
      "⚠️ buildSemanticReferenceGraph – could not addSourceFile:",
      err
    );
    return {
      nodes: [focusNode],
      references: [],
      hierarchicalRoot: focusNode,
    };
  }

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
