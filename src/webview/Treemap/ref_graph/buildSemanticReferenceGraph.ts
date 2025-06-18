import type { ScopeNode } from "../../../types";
import { analyzeBOI } from "./analyzeBOI";
import { findInnermostNodeByOffset } from "./graph_nodes";
import { findNodeById } from "./graph_nodes";
import { buildHierarchicalStructure } from "./buildHierarchicalStructure";
import { findNodesByName } from "./graph_nodes";
import { getNodeSize } from "./getNodeSize";
import { nodeDeclaresIdentifier } from "./ts_ast";

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
  direction: "outgoing" | "incoming" | "recursive";
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
  const boiAnalysis = analyzeBOI(focusNode, rootNode);

  const allReferences = [
    ...boiAnalysis.externalReferences,
    ...boiAnalysis.incomingReferences,
    ...boiAnalysis.recursiveReferences,
  ];

  // MUCH more restrictive filtering for focused analysis
  const maxNodes = 20; // Increase to accommodate individual variable declarations
  const maxReferences = 20; // Allow more meaningful references

  const referencedNodes: ScopeNode[] = [focusNode]; // Always include the focus node
  const resolvedReferences: SemanticReference[] = [];

  // Filter to only the most relevant references with better filtering
  const prioritizedReferences = allReferences
    .filter((ref) => {
      // Focus on variable references and property access
      const isRelevantType =
        ref.type === "variable_reference" ||
        ref.type === "property_access" ||
        ref.type === "function_call";

      // ================================================================
      // Additional filtering to avoid bogus references that come from
      // ordinary text content (e.g. words inside a static <h2>) or from
      // partial substring matches inside longer identifiers.  For most
      // real variable / function names we expect either camelCase, snake,
      // or PascalCase identifiers *as-a-whole* – not a single English
      // word plucked out of the middle.  A quick heuristic is:
      //   1) Starts with an uppercase letter
      //   2) Followed by only lowercase letters (i.e. a single word)
      //   3) Not declared internally (so it would otherwise be treated as
      //      an external reference)
      // Such tokens frequently arise when plain JSX text like
      // "Request Admin Access" is parsed – we see the words "Request",
      // "Admin", "Access" even though they are not identifiers that are
      // used in code.  We'll treat those as *generic* so they are filtered
      // out just like "map", "length", etc.
      const isLikelyTextToken =
        /^[A-Z][a-z]+$/.test(ref.name) && !ref.isInternal;

      const isGenericName =
        [
          "map",
          "forEach",
          "filter",
          "length",
          "push",
          "pop",
          "shift",
          "unshift",
          "className",
          "style",
          "onClick",
          "onSubmit",
          "onChange",
          "onMouseEnter",
          "onMouseLeave",
          "value",
          "id",
          "key",
          "children",
          "props",
          "state",
          "ref",
          "refs",
          "type",
          "name",
          "title",
          "text",
          "data",
          "index",
          "item",
          "items",
          "e",
          "event",
          "target",
          "currentTarget", // Common event parameter names
          "undefined",
          "null",
          "true",
          "false", // Literals

          // JSX/HTML attribute names
          "disabled",
          "placeholder",
          "autoComplete",
          "form",
          "input",
          "button",
          "div",
          "span",
          // React/Next.js common names
          "React",
          "useState",
          "useEffect",
          "useCallback",
          "useMemo",
          "Component",
          // Treat likely text-only tokens as generic too
        ].includes(ref.name) || isLikelyTextToken;

      // Exclude very short names (likely not meaningful variables)
      const isTooShort = ref.name.length < 2;

      // Exclude single character variables unless they're likely meaningful
      const isSingleChar = ref.name.length === 1 && !/[a-z]/.test(ref.name);

      // Exclude common property names that appear in many contexts
      const isCommonProperty =
        ref.name.includes(".") &&
        ["e.preventDefault", "e.target", "event.target", "target.value"].some(
          (common) => ref.name.includes(common)
        );

      // Exclude references that are purely internal to the BOI (recursive)
      const isRecursive = ref.direction === "recursive";

      const shouldInclude =
        isRelevantType &&
        !isGenericName &&
        !isTooShort &&
        !isSingleChar &&
        !isCommonProperty &&
        !isRecursive;

      return shouldInclude;
    })
    // Sort by relevance - prioritize variables that are likely state or props
    .sort((a, b) => {
      // Prioritize state variables (containing 'set' or ending patterns)
      const aIsState =
        a.name.startsWith("set") ||
        a.name.includes("State") ||
        /^[a-z]+$/.test(a.name);
      const bIsState =
        b.name.startsWith("set") ||
        b.name.includes("State") ||
        /^[a-z]+$/.test(b.name);

      if (aIsState && !bIsState) return -1;
      if (!aIsState && bIsState) return 1;

      // Then prioritize by type - variables over property access
      if (a.type === "variable_reference" && b.type !== "variable_reference")
        return -1;
      if (a.type !== "variable_reference" && b.type === "variable_reference")
        return 1;

      return 0;
    })
    .slice(0, maxReferences); // Take only the most relevant ones

  // Resolve semantic references to actual nodes (with strict limits)
  for (const ref of prioritizedReferences) {
    // TODO: need to refactor this code out then write tests to verify it's working
    const matchingNodes = findNodesByName(rootNode, ref.name);

    if (matchingNodes.length > 0) {
      // Prefer real declaration nodes over incidental matches (e.g. an "if" clause that merely mentions the name)
      const declarationCategories = [
        "Variable",
        "Parameter",
        "Function",
        "Import",
        "Class",
      ];

      const declarationCandidates = matchingNodes.filter(
        (n) =>
          declarationCategories.includes(n.category) ||
          nodeDeclaresIdentifier(n, ref.name)
      );

      // ------------------------------------------------------------------
      // Prioritize candidates that ACTUALLY declare the identifier and whose
      // category suggests a real declaration site (e.g. Parameter, Variable,
      // Function).  If several such candidates exist, prefer the *smallest*
      // node slice (most specific).  Only if **none** declare the identifier
      // do we fall back to incidental matches (e.g. a JSX element that merely
      // references the variable).
      // ------------------------------------------------------------------
      const declPriorityOrder = [
        "Parameter",
        "Variable",
        "Function",
        "ArrowFunction",
        "Method",
        "Import",
        "Class",
      ];

      const categorize = (n: ScopeNode): number => {
        const idx = declPriorityOrder.findIndex((c) =>
          String(n.category).startsWith(c)
        );
        return idx === -1 ? declPriorityOrder.length : idx;
      };

      const poolToSort =
        declarationCandidates.length > 0
          ? declarationCandidates
          : matchingNodes;

      const sortedMatchingNodes = poolToSort.sort((a, b) => {
        // 1) Declaration category priority
        const catA = categorize(a);
        const catB = categorize(b);
        if (catA !== catB) return catA - catB;

        // 2) Slice size (smaller → more specific)
        return getNodeSize(a) - getNodeSize(b);
      });

      const specificDeclarationNode = sortedMatchingNodes[0];

      if (!specificDeclarationNode) {
        continue;
      }

      if (referencedNodes.length >= maxNodes) {
        break;
      }

      // For incoming references, the target should be the focus node
      if (ref.direction === "incoming") {
        const usageNodeId = ref.offset
          ? findInnermostNodeByOffset(rootNode, ref.offset)?.id || focusNode.id
          : focusNode.id;

        resolvedReferences.push({
          ...ref,
          targetNodeId: focusNode.id,
          targets: [focusNode.id],
          usageNodeId,
        });

        // Add the source node (the one containing the reference)
        const sourceNode = findNodeById(rootNode, ref.sourceNodeId);
        if (
          sourceNode &&
          !referencedNodes.some((sn: ScopeNode) => sn.id === sourceNode.id)
        ) {
          referencedNodes.push(sourceNode);
        }
      } else {
        // For outgoing and recursive references
        if (
          specificDeclarationNode.id !== focusNode.id ||
          ref.direction === "recursive"
        ) {
          const usageNodeId = ref.offset
            ? findInnermostNodeByOffset(rootNode, ref.offset)?.id ||
              focusNode.id
            : focusNode.id;

          resolvedReferences.push({
            ...ref,
            targetNodeId: specificDeclarationNode.id,
            targets: [focusNode.id],
            usageNodeId,
          });

          // Ensure both the declaration and usage nodes are included in the graph
          if (
            !referencedNodes.some(
              (sn: ScopeNode) => sn.id === specificDeclarationNode.id
            )
          ) {
            referencedNodes.push(specificDeclarationNode);
          }

          if (
            usageNodeId &&
            !referencedNodes.some((sn: ScopeNode) => sn.id === usageNodeId)
          ) {
            const usageNode = findInnermostNodeByOffset(rootNode, ref.offset);
            if (usageNode) {
              referencedNodes.push(usageNode);
            }
          }
        }
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
} // Semantic reference types
