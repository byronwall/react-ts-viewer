import ELK, {
  ElkNode,
  ElkExtendedEdge,
  LayoutOptions,
} from "elkjs/lib/elk.bundled.js";
import type { ScopeNode } from "../../types";

// ELK instance
const elk = new ELK();

// Data structures from the plan
export interface ELKLayoutNode {
  id: string;
  width: number;
  height: number;
  x?: number; // Set by ELK after layout
  y?: number; // Set by ELK after layout
  children?: ELKLayoutNode[];
  layoutOptions?: { [key: string]: any };
}

export interface ELKLayoutEdge {
  id: string;
  sources: string[];
  targets: string[];
}

export interface ELKGraph {
  id: string;
  children: ELKLayoutNode[];
  edges: ELKLayoutEdge[];
  layoutOptions: { [key: string]: any };
}

export interface ELKLayoutOptions {
  algorithm: "layered" | "force" | "stress";
  direction: "DOWN" | "UP" | "LEFT" | "RIGHT";
  nodeSpacing: number;
  edgeSpacing: number;
  levelSpacing: number;
}

// Reference types
interface CodeReference {
  name: string;
  type: "function_call" | "variable_reference" | "import" | "property_access";
  sourceNodeId: string;
  targetNodeId?: string; // Will be found during resolution
}

// Helper function to extract references from source code
function extractReferencesFromSource(
  source: string | undefined,
  sourceNodeId: string
): CodeReference[] {
  const references: CodeReference[] = [];

  if (!source || typeof source !== "string") {
    return references;
  }

  // Extract function calls - look for patterns like "functionName("
  const functionCallRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  let match;
  while ((match = functionCallRegex.exec(source)) !== null) {
    const functionName = match[1];
    if (!functionName) continue; // Skip if undefined

    // Skip common language constructs
    if (
      ![
        "if",
        "for",
        "while",
        "switch",
        "catch",
        "typeof",
        "instanceof",
      ].includes(functionName)
    ) {
      references.push({
        name: functionName,
        type: "function_call",
        sourceNodeId,
      });
    }
  }

  // Extract variable references - look for identifiers that aren't followed by ( or =
  const variableRefRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b(?!\s*[=(])/g;
  const sourceLines = source.split("\n");
  for (const line of sourceLines) {
    let varMatch;
    while ((varMatch = variableRefRegex.exec(line)) !== null) {
      const varName = varMatch[1];
      if (!varName) continue; // Skip if undefined

      // Skip common keywords and already found function calls
      if (
        ![
          "const",
          "let",
          "var",
          "function",
          "class",
          "if",
          "else",
          "for",
          "while",
          "return",
          "true",
          "false",
          "null",
          "undefined",
          "this",
          "new",
          "typeof",
          "instanceof",
        ].includes(varName)
      ) {
        const alreadyFoundAsFunction = references.some(
          (ref) => ref.name === varName && ref.type === "function_call"
        );
        if (!alreadyFoundAsFunction) {
          references.push({
            name: varName,
            type: "variable_reference",
            sourceNodeId,
          });
        }
      }
    }
  }

  // Extract property access - look for patterns like "object.property"
  const propertyAccessRegex =
    /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\.\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  while ((match = propertyAccessRegex.exec(source)) !== null) {
    const objectName = match[1];
    const propertyName = match[2];
    references.push({
      name: `${objectName}.${propertyName}`,
      type: "property_access",
      sourceNodeId,
    });
  }

  return references;
}

// Helper function to find a node by name in the entire tree
function findNodesByName(rootNode: ScopeNode, targetName: string): ScopeNode[] {
  const matches: ScopeNode[] = [];

  function searchRecursively(node: ScopeNode) {
    // Check if this node matches the target name
    if (
      node.label &&
      (node.label.includes(targetName) ||
        node.label.startsWith(targetName + " ") ||
        node.label === targetName ||
        // Handle patterns like "functionName [line]"
        node.label.match(
          new RegExp(
            `^${targetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\[`
          )
        ))
    ) {
      matches.push(node);
      console.log(
        `  ✅ Found matching node: ${node.id} (${node.label}) for reference: ${targetName}`
      );
    }

    // Also check if the source contains the target name (for exact matches)
    if (node.source && node.source.includes(targetName)) {
      // Only add if not already found by label
      if (!matches.some((m) => m.id === node.id)) {
        matches.push(node);
        console.log(
          `  ✅ Found matching node by source: ${node.id} (${node.label}) for reference: ${targetName}`
        );
      }
    }

    // Recursively search children
    if (node.children) {
      for (const child of node.children) {
        searchRecursively(child);
      }
    }
  }

  searchRecursively(rootNode);
  return matches;
}

// Helper function to build a reference graph from a focus node
function buildReferenceGraph(
  focusNode: ScopeNode,
  rootNode: ScopeNode
): {
  nodes: ScopeNode[];
  references: CodeReference[];
} {
  // Extract all references from the focus node and its children
  const allReferences: CodeReference[] = [];
  const referencedNodes: ScopeNode[] = [focusNode]; // Always include the focus node

  function extractFromNode(node: ScopeNode) {
    if (node.source) {
      const refs = extractReferencesFromSource(node.source, node.id);
      allReferences.push(...refs);
    }

    // Also extract from children
    if (node.children) {
      for (const child of node.children) {
        extractFromNode(child);
      }
    }
  }

  console.log(
    "📋 Extracting references from focus node and its descendants..."
  );
  console.log(
    "🔍 Focus node source preview:",
    focusNode.source ? focusNode.source.substring(0, 100) + "..." : "NO SOURCE"
  );
  extractFromNode(focusNode);

  console.log(
    `🔍 Found ${allReferences.length} raw references, resolving to actual nodes...`
  );

  if (allReferences.length === 0) {
    console.warn("⚠️  No references found! This could mean:");
    console.warn("   - The focus node has no source code");
    console.warn("   - The source code has no recognizable patterns");
    console.warn("   - The extraction patterns need improvement");
    console.warn("🔍 Debug info:");
    console.warn(
      "   - Focus node source:",
      focusNode.source ? "HAS SOURCE" : "NO SOURCE"
    );
    console.warn("   - Focus node children:", focusNode.children?.length || 0);
  }

  // Resolve references to actual nodes
  const resolvedReferences: CodeReference[] = [];
  let resolutionProgress = 0;

  for (const ref of allReferences) {
    resolutionProgress++;
    console.log(
      `🔍 [${resolutionProgress}/${allReferences.length}] Resolving reference: ${ref.name} (${ref.type})`
    );

    const matchingNodes = findNodesByName(rootNode, ref.name);
    console.log(
      `   Found ${matchingNodes.length} matching nodes for "${ref.name}"`
    );

    if (matchingNodes.length > 0) {
      for (const matchingNode of matchingNodes) {
        // Don't include the focus node itself or its children as references
        if (
          matchingNode.id !== focusNode.id &&
          !isDescendantOf(matchingNode, focusNode)
        ) {
          resolvedReferences.push({
            ...ref,
            targetNodeId: matchingNode.id,
          });

          // Add to referenced nodes if not already included
          if (!referencedNodes.some((n) => n.id === matchingNode.id)) {
            referencedNodes.push(matchingNode);
            console.log(
              `  ➕ Added referenced node: ${matchingNode.id} (${matchingNode.label})`
            );
          } else {
            console.log(
              `  🔄 Node ${matchingNode.id} already in referenced nodes`
            );
          }
        } else {
          console.log(
            `  🚫 Skipping self-reference or descendant: ${matchingNode.id}`
          );
        }
      }
    } else {
      console.log(`  ❓ Could not resolve reference: ${ref.name}`);
    }
  }

  console.log(
    `✅ Reference graph built: ${referencedNodes.length} nodes, ${resolvedReferences.length} references`
  );

  // Limit the number of nodes to prevent ELK from hanging
  const maxNodes = 8; // Conservative limit for fast layout
  if (referencedNodes.length > maxNodes) {
    console.log(
      `⚠️  Too many nodes (${referencedNodes.length}), limiting to ${maxNodes} for performance`
    );

    // Keep the focus node plus the most referenced nodes
    const focusNode = referencedNodes[0]!; // Focus node is always first (we know referencedNodes has at least 1 element)
    const otherNodes = referencedNodes.slice(1);

    // Count references for each node to prioritize the most connected ones
    const nodeRefCounts = new Map<string, number>();
    resolvedReferences.forEach((ref) => {
      if (ref.targetNodeId) {
        nodeRefCounts.set(
          ref.targetNodeId,
          (nodeRefCounts.get(ref.targetNodeId) || 0) + 1
        );
      }
    });

    // Sort other nodes by reference count (most referenced first)
    const sortedOtherNodes = otherNodes.sort((a, b) => {
      const aCount = nodeRefCounts.get(a.id) || 0;
      const bCount = nodeRefCounts.get(b.id) || 0;
      return bCount - aCount;
    });

    // Take top nodes
    const limitedNodes: ScopeNode[] = [
      focusNode,
      ...sortedOtherNodes.slice(0, maxNodes - 1),
    ];
    const limitedNodeIds = new Set(limitedNodes.map((n) => n.id));

    // Filter references to only include those between limited nodes
    const limitedReferences = resolvedReferences.filter(
      (ref) =>
        limitedNodeIds.has(ref.sourceNodeId) &&
        ref.targetNodeId &&
        limitedNodeIds.has(ref.targetNodeId)
    );

    console.log(
      `📊 Limited graph: ${limitedNodes.length} nodes, ${limitedReferences.length} references`
    );

    return {
      nodes: limitedNodes,
      references: limitedReferences,
    };
  }

  console.log("📊 Referenced nodes summary:");
  referencedNodes.forEach((node, index) => {
    console.log(`   ${index + 1}. ${node.id} (${node.label})`);
  });

  return {
    nodes: referencedNodes,
    references: resolvedReferences,
  };
}

// Helper function to check if a node is a descendant of another
function isDescendantOf(
  node: ScopeNode,
  potentialAncestor: ScopeNode
): boolean {
  function checkRecursively(ancestor: ScopeNode): boolean {
    if (!ancestor.children) return false;

    for (const child of ancestor.children) {
      if (child.id === node.id) return true;
      if (checkRecursively(child)) return true;
    }
    return false;
  }

  return checkRecursively(potentialAncestor);
}

// Convert ScopeNode to ELK format for reference graph
function scopeNodeToELKNode(
  node: ScopeNode,
  minWidth = 120,
  minHeight = 60
): ElkNode {
  console.log("🔄 Converting reference node to ELK format:");
  console.log("  🆔 Node ID:", node.id);
  console.log("  🏷️  Node Label:", node.label);
  console.log("  📂 Node Category:", node.category);

  // Make nodes bigger for reference graph to show labels clearly
  const labelLength = (node.label || node.id.split(":").pop() || "Node").length;
  const calculatedWidth = Math.max(minWidth, labelLength * 8 + 20);
  const calculatedHeight = Math.max(minHeight, 60);

  console.log("  📏 Calculated dimensions:", {
    width: calculatedWidth,
    height: calculatedHeight,
    labelLength,
  });

  const elkNode: ElkNode = {
    id: node.id,
    width: calculatedWidth,
    height: calculatedHeight,
  };

  console.log("  ✅ ELK node conversion complete for:", node.id);
  return elkNode;
}

// Layout function signature compatible with existing system
export interface ELKLayoutFn {
  (
    focusNode: ScopeNode,
    width: number,
    height: number,
    options?: any
  ): Promise<ELKGraph>;
}

// Enhanced layout function that accepts both focus and root
export async function layoutELKWithRoot(
  focusNode: ScopeNode,
  rootNode: ScopeNode,
  width: number,
  height: number,
  options: Partial<ELKLayoutOptions> = {}
): Promise<ELKGraph> {
  console.log("🎯 === ELK REFERENCE LAYOUT PROCESS STARTING ===");
  console.log("🎯 Focus node analysis:");
  console.log("  🆔 Focus Node ID:", focusNode.id);
  console.log("  🏷️  Focus Node Label:", focusNode.label);
  console.log("  📂 Focus Node Category:", focusNode.category);
  console.log("  📐 Canvas Dimensions:", { width, height });

  console.log("🔍 Root node for reference search:");
  console.log("  🆔 Root Node ID:", rootNode.id);
  console.log("  🏷️  Root Node Label:", rootNode.label);
  console.log("  👥 Root Node Children:", rootNode.children?.length || 0);

  const defaultOptions: ELKLayoutOptions = {
    algorithm: "force", // Use force algorithm which is often faster for small graphs
    direction: "DOWN",
    nodeSpacing: 40,
    edgeSpacing: 20,
    levelSpacing: 80,
    ...options,
  };

  console.log("⚙️  ELK Layout options:", defaultOptions);

  // Build the reference graph using proper root for searching
  console.log("🚀 Starting reference graph building...");
  const startTime = Date.now();
  const { nodes: referenceNodes, references } = buildReferenceGraph(
    focusNode,
    rootNode
  );
  const endTime = Date.now();
  console.log(
    `✅ Reference graph building completed in ${endTime - startTime}ms`
  );

  console.log("📊 Reference graph summary:");
  console.log("  📦 Total nodes:", referenceNodes.length);
  console.log("  🔗 Total references:", references.length);

  if (referenceNodes.length === 1) {
    console.log("⚠️  Only focus node found, no external references detected");
    console.log("💡 This might be because:");
    console.log("   - The node doesn't reference external code");
    console.log("   - References are to nodes outside the current scope");
    console.log("   - The reference resolution logic needs improvement");
    console.log(
      "🔍 Debug: Focus node source:",
      focusNode.source
        ? focusNode.source.substring(0, 200) + "..."
        : "NO SOURCE"
    );
  }

  // Convert all reference nodes to ELK format
  console.log("🔄 === CONVERTING REFERENCE NODES TO ELK FORMAT ===");
  const elkNodes: ElkNode[] = referenceNodes.map((node) =>
    scopeNodeToELKNode(node)
  );

  // Build edges from references
  console.log("🔗 === BUILDING REFERENCE EDGES ===");

  // Create a set of valid node IDs for quick lookup
  const validNodeIds = new Set(elkNodes.map((node) => node.id));
  console.log("📝 Valid node IDs:", Array.from(validNodeIds));

  const elkEdges: ElkExtendedEdge[] = references
    .map((ref, index) => {
      const edge: ElkExtendedEdge = {
        id: `edge_${index}`,
        sources: [ref.sourceNodeId],
        targets: ref.targetNodeId ? [ref.targetNodeId] : [],
      };

      console.log(
        `🔗 Attempting edge: ${ref.sourceNodeId} -> ${ref.targetNodeId} (${ref.name})`
      );

      // Validate that both source and target exist in elkNodes
      const sourceExists = validNodeIds.has(ref.sourceNodeId);
      const targetExists = ref.targetNodeId
        ? validNodeIds.has(ref.targetNodeId)
        : false;

      console.log(`   Source "${ref.sourceNodeId}" exists: ${sourceExists}`);
      console.log(`   Target "${ref.targetNodeId}" exists: ${targetExists}`);

      if (!sourceExists) {
        console.warn(
          `⚠️  Skipping edge - source node not found: ${ref.sourceNodeId}`
        );
        return null;
      }

      if (!targetExists) {
        console.warn(
          `⚠️  Skipping edge - target node not found: ${ref.targetNodeId}`
        );
        return null;
      }

      console.log(
        `✅ Valid edge created: ${ref.sourceNodeId} -> ${ref.targetNodeId}`
      );
      return edge;
    })
    .filter(
      (edge): edge is ElkExtendedEdge =>
        edge !== null && edge.targets.length > 0
    ); // Only include valid edges

  console.log(
    `🔗 Edge validation complete: ${elkEdges.length} valid edges out of ${references.length} total references`
  );

  // Deduplicate edges to prevent ELK from taking too long
  const edgeMap = new Map<string, ElkExtendedEdge>();
  elkEdges.forEach((edge) => {
    // Create a unique key for the edge based on source and target
    const edgeKey = `${edge.sources[0]}->${edge.targets[0]}`;
    if (!edgeMap.has(edgeKey)) {
      edgeMap.set(edgeKey, edge);
    }
  });

  const deduplicatedEdges = Array.from(edgeMap.values());
  console.log(
    `🔗 Edge deduplication complete: ${deduplicatedEdges.length} unique edges (removed ${elkEdges.length - deduplicatedEdges.length} duplicates)`
  );

  const elkGraph = {
    id: "reference_graph",
    children: elkNodes,
    edges: deduplicatedEdges,
    layoutOptions: {
      "elk.algorithm": defaultOptions.algorithm,
      "elk.direction": defaultOptions.direction,
      "elk.spacing.nodeNode": defaultOptions.nodeSpacing.toString(),
      "elk.layered.spacing.nodeNodeBetweenLayers":
        defaultOptions.levelSpacing.toString(),
      "elk.spacing.edgeNode": defaultOptions.edgeSpacing.toString(),
    } as LayoutOptions,
  };

  console.log("📐 === ELK GRAPH STRUCTURE ANALYSIS ===");
  console.log("📐 ELK graph before layout:", {
    id: elkGraph.id,
    nodeCount: elkGraph.children.length,
    edgeCount: elkGraph.edges.length,
    algorithm: defaultOptions.algorithm,
    direction: defaultOptions.direction,
  });

  console.log("📐 Nodes to be laid out:");
  elkGraph.children.forEach((child, index) => {
    console.log(
      `  ${index + 1}. ID: ${child.id}, Size: ${child.width}x${child.height}`
    );
  });

  console.log("📐 Edges to be laid out:");
  elkGraph.edges.forEach((edge, index) => {
    console.log(
      `  ${index + 1}. ${edge.id}: ${edge.sources[0]} -> ${edge.targets[0]}`
    );
  });

  console.log("🚀 Running ELK layout algorithm...");
  console.log("⏰ About to call elk.layout() - this might take a moment...");

  // Add a progress indicator
  const progressInterval = setInterval(() => {
    console.log("⏳ ELK layout still running...");
  }, 1000); // Log every 1 second

  try {
    console.log("📞 Calling elk.layout() now...");
    const layoutedGraph = await elk.layout(elkGraph);
    clearInterval(progressInterval); // Stop progress logging
    console.log("✅ === ELK LAYOUT COMPLETED SUCCESSFULLY ===");

    console.log("📊 Layout results summary:");
    console.log("  🆔 Graph ID:", layoutedGraph.id);
    console.log("  📈 Nodes processed:", layoutedGraph.children?.length || 0);
    console.log("  🔗 Edges processed:", layoutedGraph.edges?.length || 0);

    if (layoutedGraph.children) {
      console.log("📍 Node positions after layout:");
      layoutedGraph.children.forEach((child, index) => {
        console.log(`  ${index + 1}. ${child.id}:`);
        console.log(`     📏 Size: ${child.width}x${child.height}`);
        console.log(`     📍 Position: (${child.x}, ${child.y})`);
      });
    }

    const result: ELKGraph = {
      id: layoutedGraph.id!,
      children:
        layoutedGraph.children?.map((child) => ({
          id: child.id!,
          width: child.width!,
          height: child.height!,
          x: child.x,
          y: child.y,
        })) || [],
      edges:
        layoutedGraph.edges?.map((edge) => ({
          id: edge.id!,
          sources: edge.sources || [],
          targets: edge.targets || [],
        })) || [],
      layoutOptions: elkGraph.layoutOptions,
    };

    console.log("🎉 === ELK REFERENCE LAYOUT PROCESS COMPLETE ===");
    console.log("🎉 Final graph structure:", {
      nodes: result.children.length,
      edges: result.edges.length,
      totalElements: result.children.length + result.edges.length,
    });

    return result;
  } catch (error) {
    clearInterval(progressInterval); // Stop progress logging on error
    console.error("❌ === ELK LAYOUT FAILED ===");
    console.error("❌ Error details:", error);
    console.error("❌ Focus node that caused failure:", {
      id: focusNode.id,
      label: focusNode.label,
    });
    console.error("❌ Graph structure that failed:", {
      nodeCount: elkGraph.children.length,
      edgeCount: elkGraph.edges.length,
      layoutOptions: elkGraph.layoutOptions,
    });
    throw error;
  }
}

// Build reference graph layout function (original - now just delegates to enhanced version)
export async function layoutWithELK(
  focusNode: ScopeNode,
  width: number,
  height: number,
  options: Partial<ELKLayoutOptions> = {}
): Promise<ELKGraph> {
  // For backward compatibility, when only focus node is provided,
  // we'll use it as both focus and root
  return layoutELKWithRoot(focusNode, focusNode, width, height, options);
}

export const layoutELKAsync: ELKLayoutFn = layoutWithELK;
