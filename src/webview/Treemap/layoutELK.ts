import ELK, {
  ElkNode,
  ElkExtendedEdge,
  LayoutOptions,
} from "elkjs/lib/elk.bundled.js";
import type { ScopeNode } from "../../types";
import * as ts from "typescript";

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
  labels?: Array<{ text: string; id: string }>;
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

// Semantic reference types
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
  isInternal: boolean; // true if declared within BOI scope
  direction: "outgoing" | "incoming" | "recursive";
}

interface VariableScope {
  declarations: Map<string, { node: ts.Node; name: string; line: number }>;
  parent?: VariableScope;
  level: number;
}

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

interface ReferenceGraph {
  outgoing: SemanticReference[]; // BOI uses external variables/functions
  incoming: SemanticReference[]; // External code references BOI variables
  recursive: SemanticReference[]; // BOI references itself
}

// Helper function to create TypeScript source file from code
function createSourceFile(source: string, fileName = "temp.ts"): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
}

// Helper function to get line and character from position
function getLineAndCharacter(
  sourceFile: ts.SourceFile,
  pos: number
): { line: number; character: number } {
  const lineChar = sourceFile.getLineAndCharacterOfPosition(pos);
  return { line: lineChar.line + 1, character: lineChar.character + 1 }; // 1-based
}

// Build variable scope from AST
function buildVariableScope(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  parent?: VariableScope
): VariableScope {
  const scope: VariableScope = {
    declarations: new Map(),
    parent,
    level: parent ? parent.level + 1 : 0,
  };

  function visitNode(n: ts.Node) {
    // Variable declarations
    if (
      ts.isVariableDeclaration(n) ||
      ts.isParameter(n) ||
      ts.isFunctionDeclaration(n)
    ) {
      if (n.name && ts.isIdentifier(n.name)) {
        const name = n.name.text;
        const position = getLineAndCharacter(sourceFile, n.name.pos);
        scope.declarations.set(name, { node: n, name, line: position.line });
      }
    }

    // Destructuring patterns
    if (ts.isVariableDeclaration(n) && n.name) {
      extractDestructuredNames(n.name).forEach((name) => {
        const position = getLineAndCharacter(sourceFile, n.name!.pos);
        scope.declarations.set(name, { node: n, name, line: position.line });
      });
    }

    ts.forEachChild(n, visitNode);
  }

  visitNode(node);
  return scope;
}

// Extract names from destructuring patterns
function extractDestructuredNames(bindingName: ts.BindingName): string[] {
  const names: string[] = [];

  function extract(name: ts.BindingName) {
    if (ts.isIdentifier(name)) {
      names.push(name.text);
    } else if (ts.isObjectBindingPattern(name)) {
      name.elements.forEach((element) => {
        if (element.name) {
          extract(element.name);
        }
      });
    } else if (ts.isArrayBindingPattern(name)) {
      name.elements.forEach((element) => {
        if (ts.isBindingElement(element) && element.name) {
          extract(element.name);
        }
      });
    }
  }

  extract(bindingName);
  return names;
}

// Check if a variable is declared within a scope (including parent scopes)
function isVariableDeclaredInScope(
  varName: string,
  scope: VariableScope
): boolean {
  let currentScope: VariableScope | undefined = scope;
  while (currentScope) {
    if (currentScope.declarations.has(varName)) {
      return true;
    }
    currentScope = currentScope.parent;
  }
  return false;
}

// Extract semantic references from AST
function extractSemanticReferences(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  sourceNodeId: string,
  boiScope: VariableScope
): SemanticReference[] {
  const references: SemanticReference[] = [];

  function visitNode(n: ts.Node) {
    const position = getLineAndCharacter(sourceFile, n.pos);

    // Function calls
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const name = n.expression.text;
      const isInternal = isVariableDeclaredInScope(name, boiScope);

      references.push({
        name,
        type: "function_call",
        sourceNodeId,
        position,
        isInternal,
        direction: isInternal ? "recursive" : "outgoing",
      });
    }

    // Property access calls
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const objectName = ts.isIdentifier(n.expression.expression)
        ? n.expression.expression.text
        : "unknown";
      const propertyName = n.expression.name.text;
      const name = `${objectName}.${propertyName}`;
      const isInternal = isVariableDeclaredInScope(objectName, boiScope);

      references.push({
        name,
        type: "property_access",
        sourceNodeId,
        position,
        isInternal,
        direction: isInternal ? "recursive" : "outgoing",
      });
    }

    // Variable references (not in declarations)
    if (ts.isIdentifier(n) && !isPartOfDeclaration(n)) {
      const name = n.text;

      // Skip common keywords
      if (!isKeyword(name)) {
        const isInternal = isVariableDeclaredInScope(name, boiScope);

        references.push({
          name,
          type: "variable_reference",
          sourceNodeId,
          position,
          isInternal,
          direction: isInternal ? "recursive" : "outgoing",
        });
      }
    }

    // Import declarations
    if (ts.isImportDeclaration(n) && n.importClause) {
      if (n.importClause.name) {
        // Default import
        const name = n.importClause.name.text;
        references.push({
          name,
          type: "import",
          sourceNodeId,
          position,
          isInternal: false,
          direction: "outgoing",
        });
      }

      if (n.importClause.namedBindings) {
        if (ts.isNamedImports(n.importClause.namedBindings)) {
          // Named imports
          n.importClause.namedBindings.elements.forEach((element) => {
            const name = element.name.text;
            references.push({
              name,
              type: "import",
              sourceNodeId,
              position,
              isInternal: false,
              direction: "outgoing",
            });
          });
        }
      }
    }

    ts.forEachChild(n, visitNode);
  }

  visitNode(node);
  return references;
}

// Helper function to check if an identifier is part of a declaration
function isPartOfDeclaration(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  return (
    ts.isVariableDeclaration(parent) ||
    ts.isFunctionDeclaration(parent) ||
    ts.isParameter(parent) ||
    ts.isPropertySignature(parent) ||
    ts.isMethodSignature(parent) ||
    ts.isBindingElement(parent)
  );
}

// Helper function to check if a name is a keyword
function isKeyword(name: string): boolean {
  const keywords = new Set([
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
    "import",
    "export",
    "from",
    "as",
    "default",
    "async",
    "await",
    "try",
    "catch",
    "finally",
    "throw",
    "switch",
    "case",
    "break",
    "continue",
  ]);
  return keywords.has(name);
}

// Analyze Block of Interest (BOI) for semantic references
function analyzeBOI(focusNode: ScopeNode, rootNode: ScopeNode): BOIAnalysis {
  console.log("🔬 === SEMANTIC BOI ANALYSIS STARTING ===");
  console.log("🎯 Focus Node:", { id: focusNode.id, label: focusNode.label });

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
    console.log("✅ Created TypeScript AST for analysis");

    // Build variable scope for the BOI
    const boiScope = buildVariableScope(sourceFile, sourceFile);
    console.log(
      `📊 BOI scope analysis: ${boiScope.declarations.size} declarations found`
    );

    // Log internal declarations
    console.log("🔍 Internal declarations in BOI:");
    Array.from(boiScope.declarations.entries()).forEach(([name, info]) => {
      console.log(`  📝 ${name} (line ${info.line})`);
    });

    // Extract semantic references
    const allReferences = extractSemanticReferences(
      sourceFile,
      sourceFile,
      focusNode.id,
      boiScope
    );

    console.log(`🔗 Found ${allReferences.length} total references`);

    // Categorize references by direction
    const externalReferences = allReferences.filter((ref) => !ref.isInternal);
    const recursiveReferences = allReferences.filter((ref) => ref.isInternal);

    console.log(
      `📤 Outgoing external references: ${externalReferences.length}`
    );
    externalReferences.forEach((ref) => {
      console.log(
        `  🔗 ${ref.name} (${ref.type}) at line ${ref.position.line}`
      );
    });

    console.log(`🔄 Recursive references: ${recursiveReferences.length}`);
    recursiveReferences.forEach((ref) => {
      console.log(
        `  🔗 ${ref.name} (${ref.type}) at line ${ref.position.line}`
      );
    });

    // Find incoming references by searching the root node for references to BOI variables
    const incomingReferences = findIncomingReferences(
      focusNode,
      rootNode,
      boiScope
    );
    console.log(`📥 Incoming references: ${incomingReferences.length}`);

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

// Find incoming references to the BOI from other nodes
function findIncomingReferences(
  focusNode: ScopeNode,
  rootNode: ScopeNode,
  boiScope: VariableScope
): SemanticReference[] {
  const incomingRefs: SemanticReference[] = [];
  const boiVariableNames = Array.from(boiScope.declarations.keys());

  if (boiVariableNames.length === 0) {
    return incomingRefs;
  }

  console.log(
    "🔍 Searching for incoming references to BOI variables:",
    boiVariableNames
  );

  function searchNode(node: ScopeNode) {
    // Skip the focus node itself
    if (node.id === focusNode.id) {
      return;
    }

    if (node.source && typeof node.source === "string") {
      try {
        const sourceFile = createSourceFile(node.source);
        const nodeScope = buildVariableScope(sourceFile, sourceFile);

        // Extract references from this node
        const nodeReferences = extractSemanticReferences(
          sourceFile,
          sourceFile,
          node.id,
          nodeScope
        );

        // Check if any references point to BOI variables
        nodeReferences.forEach((ref) => {
          if (boiVariableNames.includes(ref.name) && !ref.isInternal) {
            incomingRefs.push({
              ...ref,
              direction: "incoming",
              targetNodeId: focusNode.id,
            });
          }
        });
      } catch (error) {
        console.warn(
          `⚠️ Error analyzing node ${node.id} for incoming references:`,
          error
        );
      }
    }

    // Recursively search children
    if (node.children) {
      node.children.forEach(searchNode);
    }
  }

  searchNode(rootNode);
  return incomingRefs;
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

// Helper function to build a reference graph from a focus node using semantic analysis
function buildSemanticReferenceGraph(
  focusNode: ScopeNode,
  rootNode: ScopeNode
): {
  nodes: ScopeNode[];
  references: SemanticReference[];
} {
  console.log("🔬 === BUILDING SEMANTIC REFERENCE GRAPH ===");
  console.log("🎯 Focus node:", { id: focusNode.id, label: focusNode.label });

  // Perform BOI analysis
  const boiAnalysis = analyzeBOI(focusNode, rootNode);

  const allReferences = [
    ...boiAnalysis.externalReferences,
    ...boiAnalysis.incomingReferences,
    ...boiAnalysis.recursiveReferences,
  ];

  console.log(`📊 Total semantic references found: ${allReferences.length}`);
  console.log(`  📤 Outgoing: ${boiAnalysis.externalReferences.length}`);
  console.log(`  📥 Incoming: ${boiAnalysis.incomingReferences.length}`);
  console.log(`  🔄 Recursive: ${boiAnalysis.recursiveReferences.length}`);

  const referencedNodes: ScopeNode[] = [focusNode]; // Always include the focus node
  const resolvedReferences: SemanticReference[] = [];

  // Resolve semantic references to actual nodes
  for (const ref of allReferences) {
    console.log(
      `🔍 Resolving semantic reference: ${ref.name} (${ref.type}, ${ref.direction})`
    );

    const matchingNodes = findNodesByName(rootNode, ref.name);
    console.log(
      `   Found ${matchingNodes.length} matching nodes for "${ref.name}"`
    );

    if (matchingNodes.length > 0) {
      for (const matchingNode of matchingNodes) {
        // For incoming references, the target should be the focus node
        if (ref.direction === "incoming") {
          resolvedReferences.push({
            ...ref,
            targetNodeId: focusNode.id,
          });

          // Add the source node (the one containing the reference)
          const sourceNode = findNodeById(rootNode, ref.sourceNodeId);
          if (
            sourceNode &&
            !referencedNodes.some((n) => n.id === sourceNode.id)
          ) {
            referencedNodes.push(sourceNode);
            console.log(
              `  ➕ Added source node for incoming ref: ${sourceNode.id} (${sourceNode.label})`
            );
          }
        } else {
          // For outgoing and recursive references
          if (
            matchingNode.id !== focusNode.id ||
            ref.direction === "recursive"
          ) {
            resolvedReferences.push({
              ...ref,
              targetNodeId: matchingNode.id,
            });

            // Add to referenced nodes if not already included
            if (!referencedNodes.some((n) => n.id === matchingNode.id)) {
              referencedNodes.push(matchingNode);
              console.log(
                `  ➕ Added target node: ${matchingNode.id} (${matchingNode.label})`
              );
            }
          }
        }
      }
    } else {
      console.log(`  ❓ Could not resolve reference: ${ref.name}`);
    }
  }

  console.log(
    `✅ Semantic reference graph built: ${referencedNodes.length} nodes, ${resolvedReferences.length} references`
  );

  // Limit the number of nodes to prevent ELK from hanging
  const maxNodes = 8; // Conservative limit for fast layout
  if (referencedNodes.length > maxNodes) {
    console.log(
      `⚠️  Too many nodes (${referencedNodes.length}), limiting to ${maxNodes} for performance`
    );

    // Keep the focus node plus the most referenced nodes
    const focusNodeFromList = referencedNodes.find(
      (n) => n.id === focusNode.id
    )!;
    const otherNodes = referencedNodes.filter((n) => n.id !== focusNode.id);

    // Count references for each node to prioritize the most connected ones
    const nodeRefCounts = new Map<string, number>();
    resolvedReferences.forEach((ref) => {
      if (ref.targetNodeId) {
        nodeRefCounts.set(
          ref.targetNodeId,
          (nodeRefCounts.get(ref.targetNodeId) || 0) + 1
        );
      }
      // Also count source nodes for incoming references
      nodeRefCounts.set(
        ref.sourceNodeId,
        (nodeRefCounts.get(ref.sourceNodeId) || 0) + 1
      );
    });

    // Sort other nodes by reference count (most referenced first)
    const sortedOtherNodes = otherNodes.sort((a, b) => {
      const aCount = nodeRefCounts.get(a.id) || 0;
      const bCount = nodeRefCounts.get(b.id) || 0;
      return bCount - aCount;
    });

    // Take top nodes
    const limitedNodes: ScopeNode[] = [
      focusNodeFromList,
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
      `📊 Limited semantic graph: ${limitedNodes.length} nodes, ${limitedReferences.length} references`
    );

    return {
      nodes: limitedNodes,
      references: limitedReferences,
    };
  }

  console.log("📊 Semantic referenced nodes summary:");
  referencedNodes.forEach((node, index) => {
    console.log(`   ${index + 1}. ${node.id} (${node.label})`);
  });

  return {
    nodes: referencedNodes,
    references: resolvedReferences,
  };
}

// Helper function to find a node by ID
function findNodeById(rootNode: ScopeNode, nodeId: string): ScopeNode | null {
  function searchRecursively(node: ScopeNode): ScopeNode | null {
    if (node.id === nodeId) {
      return node;
    }

    if (node.children) {
      for (const child of node.children) {
        const found = searchRecursively(child);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }

  return searchRecursively(rootNode);
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
    algorithm: "layered", // Use layered algorithm for hierarchical layouts
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
  const { nodes: referenceNodes, references } = buildSemanticReferenceGraph(
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
  console.log("🔗 === BUILDING SEMANTIC REFERENCE EDGES ===");

  // Create a set of valid node IDs for quick lookup
  const validNodeIds = new Set(elkNodes.map((node) => node.id));
  console.log("📝 Valid node IDs:", Array.from(validNodeIds));

  const elkEdges: ElkExtendedEdge[] = references
    .map((ref, index) => {
      console.log(
        `🔗 Processing semantic reference: ${ref.name} (${ref.type}, ${ref.direction})`
      );
      console.log(
        `   Source: ${ref.sourceNodeId} -> Target: ${ref.targetNodeId}`
      );

      if (!ref.targetNodeId) {
        console.warn(`⚠️ Skipping reference without target: ${ref.name}`);
        return null;
      }

      // Validate that both source and target exist in elkNodes
      const sourceExists = validNodeIds.has(ref.sourceNodeId);
      const targetExists = validNodeIds.has(ref.targetNodeId);

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

      // Create edge with direction-aware labeling
      const edgeId = `edge_${index}_${ref.direction}_${ref.type}`;
      const edge: ElkExtendedEdge = {
        id: edgeId,
        sources: [ref.sourceNodeId],
        targets: [ref.targetNodeId],
        // Add semantic information as labels for better debugging
        labels: [
          {
            text: `${ref.name} (${ref.direction})`,
            id: `${edgeId}_label`,
          },
        ],
      };

      console.log(
        `✅ Valid semantic edge created: ${ref.sourceNodeId} -> ${ref.targetNodeId} (${ref.direction}, ${ref.type})`
      );
      return edge;
    })
    .filter((edge): edge is ElkExtendedEdge => edge !== null);

  console.log(
    `🔗 Semantic edge validation complete: ${elkEdges.length} valid edges out of ${references.length} total references`
  );

  const elkGraph = {
    id: "reference_graph",
    children: elkNodes,
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
          labels:
            edge.labels?.map((label) => ({
              text: label.text || "",
              id: label.id || "",
            })) || [],
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
