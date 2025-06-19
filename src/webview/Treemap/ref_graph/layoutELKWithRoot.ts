import { type ElkExtendedEdge, type ElkNode, type LayoutOptions } from "elkjs";
import ELK from "elkjs/lib/elk.bundled.js";
import type { ScopeNode } from "../../../types";
import { buildSemanticReferenceGraph } from "./buildSemanticReferenceGraph";
import { getNodeSize } from "./getNodeSize";
import {
  findNodeById,
  findNodesByName,
  getPathToNode,
  getRangeFromNodeId,
  nodeDestructuresIdentifier,
  nodeIsArrowFunctionWithParam,
  nodeUsesIdentifier,
} from "./graph_nodes";
import { hierarchicalScopeNodeToELK } from "./hierarchicalScopeNodeToELK";

const elk = new ELK();

export interface ELKLayoutNode {
  id: string;
  width: number;
  height: number;
  x?: number; // Set by ELK after layout
  y?: number; // Set by ELK after layout
  children?: ELKLayoutNode[];
  /** Optional pre-rendered label(s) coming from ELK */
  labels?: { text: string }[];
  layoutOptions?: { [key: string]: any };
}
export interface ELKGraph {
  id: string;
  children: ELKLayoutNode[];
  edges: ELKLayoutEdge[];
  layoutOptions: { [key: string]: any };
}
interface ELKLayoutOptions {
  algorithm: "layered" | "force" | "stress";
  direction: "DOWN" | "UP" | "LEFT" | "RIGHT";
  nodeSpacing: number;
  edgeSpacing: number;
  levelSpacing: number;
}
interface ELKLayoutEdge {
  id: string;
  sources: string[];
  targets: string[];
}

export async function layoutELKWithRoot(
  focusNode: ScopeNode,
  rootNode: ScopeNode,
  width: number,
  height: number,
  options: Partial<ELKLayoutOptions> = {}
): Promise<ELKGraph> {
  const defaultOptions: ELKLayoutOptions = {
    algorithm: "layered", // Use layered algorithm for hierarchical layouts
    direction: "DOWN",
    nodeSpacing: 40,
    edgeSpacing: 20,
    levelSpacing: 80,
    ...options,
  };

  // Build the reference graph using proper root for searching
  const {
    nodes: referenceNodes,
    references,
    hierarchicalRoot,
  } = buildSemanticReferenceGraph(focusNode, rootNode);

  // ---------------- NEW: create synthetic Parameter and Argument nodes ----------------
  // For *declarations* that correspond to function parameters / destructured
  // bindings we create **parameter** boxes under the declaration node.
  // For *usages* inside CallExpression nodes we create **argument** boxes
  // under the Call node so that edges can land on a dedicated target rather
  // than the whole call container.
  type SyntheticLeafInfo = { id: string; name: string; parentId: string };
  const syntheticParams: SyntheticLeafInfo[] = [];
  const syntheticArgs: SyntheticLeafInfo[] = [];

  const nodeById = new Map(referenceNodes.map((n) => [n.id, n]));

  references.forEach((ref) => {
    // ---------------- Parameter INJECTION ----------------
    if (
      ref.direction === "outgoing" &&
      (ref.type === "variable_reference" || ref.type === "function_call") &&
      ref.targetNodeId
    ) {
      const targetNode = nodeById.get(ref.targetNodeId!);
      if (targetNode) {
        const cat = String(targetNode.category);

        const shouldTreatAsParam = (() => {
          if (
            cat === "ArrowFunction" ||
            cat === "Function" ||
            cat === "Method" ||
            cat.endsWith("Function")
          ) {
            return true;
          }
          if (cat === "Variable") {
            const isDestructured = nodeDestructuresIdentifier(
              targetNode,
              ref.name
            );
            const isArrowParam = nodeIsArrowFunctionWithParam(
              targetNode,
              ref.name
            );
            return isDestructured || isArrowParam;
          }
          return false;
        })();

        if (shouldTreatAsParam) {
          const paramId = `${targetNode.id}::param:${ref.name}`;
          ref.targetNodeId = paramId; // Edge will originate from this param box

          if (!syntheticParams.some((p) => p.id === paramId)) {
            syntheticParams.push({
              id: paramId,
              name: ref.name,
              parentId: targetNode.id,
            });
          }
        }
      }
    }

    // ---------------- Argument INJECTION (variables & calls) ----------------
    if (
      ref.direction === "outgoing" &&
      (ref.type === "variable_reference" || ref.type === "function_call") &&
      ref.usageNodeId
    ) {
      let usageNode = nodeById.get(ref.usageNodeId);

      // If the detected usage node isn't a Call, try to find a descendant Call node that encloses the offset
      if (!usageNode || String(usageNode.category) !== "Call") {
        const callCandidates = findNodesByName(rootNode, ref.name).filter(
          (n: ScopeNode) => String(n.category) === "Call"
        );
        const enclosing = callCandidates
          .filter((n: ScopeNode) => {
            const range = getRangeFromNodeId(n.id);
            return (
              range && ref.offset >= range.start && ref.offset <= range.end
            );
          })
          .sort((a, b) => getNodeSize(a) - getNodeSize(b))[0];
        if (enclosing) {
          usageNode = enclosing;
          ref.usageNodeId = enclosing.id;
          if (!referenceNodes.some((sn: ScopeNode) => sn.id === enclosing.id)) {
            referenceNodes.push(enclosing);
          }
          // Update nodeById for new node
          nodeById.set(enclosing.id, enclosing);
        }
      }

      if (usageNode && String(usageNode.category) === "Call") {
        const argId = `${usageNode.id}::arg:${ref.name}`;
        ref.usageNodeId = argId;

        if (!syntheticArgs.some((a) => a.id === argId)) {
          syntheticArgs.push({
            id: argId,
            name: ref.name,
            parentId: usageNode.id,
          });
        }
      }
    }

    // ---------------- Ensure FUNCTION_CALL targets the actual Call node ----------------
    if (
      ref.type === "function_call" &&
      ref.direction === "outgoing" &&
      ref.usageNodeId
    ) {
      const usageNode = nodeById.get(ref.usageNodeId);
      if (!usageNode || String(usageNode.category) !== "Call") {
        // Try to locate a better Call node for this function
        const candidateCalls = findNodesByName(rootNode, ref.name).filter(
          (n: ScopeNode) => String(n.category) === "Call"
        );

        if (candidateCalls.length > 0) {
          // Prefer the smallest slice that encloses the offset
          const suitable = candidateCalls
            .filter((n: ScopeNode) => {
              const range = getRangeFromNodeId(n.id);
              return (
                range && ref.offset >= range.start && ref.offset <= range.end
              );
            })
            .sort((a, b) => getNodeSize(a) - getNodeSize(b));

          const chosen = suitable.length > 0 ? suitable[0] : candidateCalls[0];
          if (chosen) {
            ref.usageNodeId = chosen.id;
            if (!referenceNodes.some((sn: ScopeNode) => sn.id === chosen.id)) {
              referenceNodes.push(chosen);
            }
          }
        }
      }
    }

    // ---------------- After processing, optionally re-route usage to nearest control-flow wrapper (If/Else) for clearer visuals ----------
    if (
      ref.direction === "outgoing" &&
      ref.usageNodeId // ensure we have a usage anchor
    ) {
      const path = getPathToNode(rootNode, ref.usageNodeId);
      for (let i = path.length - 2; i >= 0; i--) {
        const anc = path[i];
        if (anc && /If|Else/.test(String(anc.category))) {
          ref.usageNodeId = anc.id;
          break;
        }
      }
    }

    // 🔎  Emit a simple diagnostic for each resolved reference
    console.log(
      `🔎 ref ${ref.name} (${ref.type}/${ref.direction}) – target=${ref.targetNodeId ?? "?"} usage=${ref.usageNodeId ?? "?"}`
    );
  });

  // ----------------------------------------------------------------------
  // Convert hierarchical structure to ELK format
  const targetNodeIds = new Set(referenceNodes.map((n) => n.id));
  const elkHierarchy = hierarchicalScopeNodeToELK(
    hierarchicalRoot,
    targetNodeIds
  );

  // ---------------- Inject synthetic Parameter and Argument nodes into ELK hierarchy ----------------
  if (syntheticParams.length > 0 || syntheticArgs.length > 0) {
    // Helper to find a node in the ELK hierarchy by id
    const findElkNodeById = (n: ElkNode, id: string): ElkNode | null => {
      if (n.id === id) return n;
      if (n.children) {
        for (const child of n.children) {
          const found = findElkNodeById(child, id);
          if (found) return found;
        }
      }
      return null;
    };

    const inject = (
      leaf: SyntheticLeafInfo,
      kind: "parameter" | "argument"
    ) => {
      const parentElk = findElkNodeById(elkHierarchy, leaf.parentId);
      if (!parentElk) return;
      if (!parentElk.children) parentElk.children = [];
      if (parentElk.children.some((c) => c.id === leaf.id)) return;

      parentElk.children.push({
        id: leaf.id,
        width: 120,
        height: 60,
        labels: [{ text: leaf.name } as any],
      });
    };

    syntheticParams.forEach((p) => inject(p, "parameter"));
    syntheticArgs.forEach((a) => inject(a, "argument"));
  }

  // ----------------------------------------------------------------------
  // Build edges from references with proper direction indicators
  // Now that synthetic nodes are in the hierarchy, gather IDs.
  const allElkNodeIds = new Set<string>();
  const collectElkNodeIds = (elkNode: ElkNode) => {
    allElkNodeIds.add(elkNode.id);
    if (elkNode.children) {
      elkNode.children.forEach(collectElkNodeIds);
    }
  };
  collectElkNodeIds(elkHierarchy);

  const elkEdges: ElkExtendedEdge[] = references
    .map((ref, index) => {
      if (!ref.targetNodeId) {
        return null;
      }

      // Determine actual endpoints based on direction and usage node
      let sourceId: string | undefined;
      let targetId: string | undefined;

      if (ref.direction === "outgoing") {
        // External declaration (param) -> usage inside BOI
        sourceId = ref.targetNodeId;
        targetId = ref.usageNodeId || ref.sourceNodeId;
      } else if (ref.direction === "incoming") {
        // External usage -> declaration inside BOI (already mapped)
        sourceId = ref.sourceNodeId;
        targetId = ref.targetNodeId;
      } else {
        // recursive
        sourceId = ref.sourceNodeId;
        targetId = ref.targetNodeId;
      }

      if (!sourceId || !targetId) {
        return null;
      }

      // Filter: avoid edges that land on control-flow wrappers UNLESS the variable really appears inside that node
      const tgtScope = findNodeById(rootNode, targetId);
      if (tgtScope) {
        const cat = String(tgtScope.category);
        // Treat any category that mentions "If" or "Else" as a control-flow wrapper
        const isControlFlow = /If|Else/.test(cat);
        if (isControlFlow) {
          const actuallyUsed = nodeUsesIdentifier(tgtScope, ref.name);

          // Hard-skip edges that end on a *plain* Else wrapper – they never make good visual anchors
          if (cat.includes("Else") && !cat.includes("If")) {
            return null;
          }

          if (!actuallyUsed) {
            return null;
          }

          // If the wrapper *does* use the identifier, try to re-route the edge to a more specific child node
          const findBestChild = (function search(
            n: ScopeNode
          ): ScopeNode | null {
            let best: ScopeNode | null = null;
            if (n === tgtScope) {
              // skip the wrapper itself – we only want descendants
            } else if (nodeUsesIdentifier(n, ref.name)) {
              const catLower = String(n.category).toLowerCase();
              if (!/if|else/.test(catLower)) {
                best = n; // candidate
              }
            }
            if (n.children) {
              for (const child of n.children) {
                const cand = search(child);
                if (!cand) continue;
                if (!best || getNodeSize(cand) < getNodeSize(best)) {
                  best = cand; // prefer the most specific (smallest slice)
                }
              }
            }
            return best;
          })(tgtScope);

          if (findBestChild) {
            targetId = findBestChild.id;
          } else {
            // Lastly, check for Call nodes whose label starts with the identifier
            const hasChildCall = (function check(n: ScopeNode): boolean {
              const catLower = String(n.category).toLowerCase();
              if (catLower.includes("call") && n.label?.startsWith(ref.name)) {
                return true;
              }
              if (n.children) return n.children.some(check);
              return false;
            })(tgtScope);

            if (hasChildCall) {
              return null; // let the separate edge to the Call node cover this
            }
          }
        }
      }

      // Skip edges that reference nodes not in the hierarchy
      if (!allElkNodeIds.has(sourceId) || !allElkNodeIds.has(targetId)) {
        return null;
      }

      const edgeId = `edge_${index}_${ref.direction}_${ref.type}`;

      // 🔗  Diagnostic log for each created edge
      console.log(`🔗 edge ${sourceId} ➡️ ${targetId} (${ref.name})`);

      return {
        id: edgeId,
        sources: [sourceId],
        targets: [targetId],
        layoutOptions: {
          "elk.edge.type": "DEPENDENCY",
        },
      } as ElkExtendedEdge;
    })
    .filter((edge): edge is ElkExtendedEdge => edge !== null);

  // ----------------------------------------------------------------------
  const elkGraph = {
    id: "reference_graph",
    children: [elkHierarchy], // Use hierarchical structure as children
    edges: elkEdges,
    layoutOptions: {
      "elk.algorithm": defaultOptions.algorithm,
      "elk.direction": defaultOptions.direction,
      "elk.hierarchyHandling": "INCLUDE_CHILDREN", // Enable hierarchical layout
      "elk.spacing.nodeNode": defaultOptions.nodeSpacing.toString(),
      "elk.layered.spacing.nodeNodeBetweenLayers":
        defaultOptions.levelSpacing.toString(),
      "elk.spacing.edgeNode": defaultOptions.edgeSpacing.toString(),
      // Additional layered algorithm specific options
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.nodePlacement.strategy": "SIMPLE",
      // Enable proper hierarchical handling
      "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
      "elk.spacing.componentComponent": "20",
      "elk.spacing.portPort": "10",
    } as LayoutOptions,
  };

  try {
    const layoutedGraph = await elk.layout(elkGraph);

    // Instead of flattening, preserve the hierarchical structure
    const preserveHierarchicalNodes = (
      elkNodes: ElkNode[]
    ): ELKLayoutNode[] => {
      const result: ELKLayoutNode[] = [];

      elkNodes.forEach((elkNode) => {
        const layoutNode: ELKLayoutNode = {
          id: elkNode.id,
          width: elkNode.width || 0,
          height: elkNode.height || 0,
          x: elkNode.x || 0,
          y: elkNode.y || 0,
          // Preserve ELK "labels" array so the renderer can derive a short name
          labels: (elkNode as any).labels,
        };

        // Preserve children hierarchy
        if (elkNode.children && elkNode.children.length > 0) {
          layoutNode.children = preserveHierarchicalNodes(elkNode.children);
        }

        result.push(layoutNode);
      });

      return result;
    };

    const hierarchicalNodes = layoutedGraph.children
      ? preserveHierarchicalNodes(layoutedGraph.children)
      : [];

    const result: ELKGraph = {
      id: layoutedGraph.id!,
      children: hierarchicalNodes, // Use hierarchical structure
      edges:
        layoutedGraph.edges?.map((edge) => ({
          id: edge.id!,
          sources: edge.sources || [],
          targets: edge.targets || [],
        })) || [],
      layoutOptions: elkGraph.layoutOptions,
    };

    return result;
  } catch (error) {
    console.error("❌ ELK layout failed:", error);
    throw error;
  }
}
