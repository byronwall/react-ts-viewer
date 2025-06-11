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

    // Property access expressions (not just calls)
    if (ts.isPropertyAccessExpression(n) && !ts.isCallExpression(n.parent)) {
      const objectName = ts.isIdentifier(n.expression)
        ? n.expression.text
        : "unknown";
      const propertyName = n.name.text;
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

      // Skip common keywords and JSX component names
      if (!isKeyword(name) && !isJSXComponentName(n)) {
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

    // JSX Expression containers - extract variables from {variable} expressions
    if (ts.isJsxExpression(n) && n.expression) {
      extractJSXExpressionReferences(
        n.expression,
        sourceNodeId,
        boiScope,
        references,
        sourceFile
      );
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

// Helper function to extract references from JSX expressions
function extractJSXExpressionReferences(
  expression: ts.Expression,
  sourceNodeId: string,
  boiScope: VariableScope,
  references: SemanticReference[],
  sourceFile: ts.SourceFile
) {
  function visitExpression(expr: ts.Expression) {
    const position = getLineAndCharacter(sourceFile, expr.pos);

    if (ts.isIdentifier(expr)) {
      const name = expr.text;
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
    } else if (ts.isPropertyAccessExpression(expr)) {
      const objectName = ts.isIdentifier(expr.expression)
        ? expr.expression.text
        : "unknown";
      const propertyName = expr.name.text;
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
    } else if (ts.isCallExpression(expr)) {
      if (ts.isIdentifier(expr.expression)) {
        const name = expr.expression.text;
        const isInternal = isVariableDeclaredInScope(name, boiScope);
        references.push({
          name,
          type: "function_call",
          sourceNodeId,
          position,
          isInternal,
          direction: isInternal ? "recursive" : "outgoing",
        });
      } else if (ts.isPropertyAccessExpression(expr.expression)) {
        const objectName = ts.isIdentifier(expr.expression.expression)
          ? expr.expression.expression.text
          : "unknown";
        const propertyName = expr.expression.name.text;
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

// Helper function to check if an identifier is a JSX component name
function isJSXComponentName(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  return (
    ts.isJsxOpeningElement(parent) ||
    ts.isJsxClosingElement(parent) ||
    ts.isJsxSelfClosingElement(parent)
  );
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

// Helper function to get node size from its ID
function getNodeSize(node: ScopeNode): number {
  if (!node || !node.id) return Infinity;
  const parts = node.id.split(":");
  if (parts.length > 1) {
    const range = parts[parts.length - 1];
    if (range) {
      const rangeParts = range.split("-");
      if (rangeParts.length === 2 && rangeParts[0] && rangeParts[1]) {
        const start = parseInt(rangeParts[0], 10);
        const end = parseInt(rangeParts[1], 10);
        if (!isNaN(start) && !isNaN(end)) {
          return end - start;
        }
      }
    }
  }
  return Infinity; // If no range, treat as largest
}

// Analyze Block of Interest (BOI) for semantic references
function analyzeBOI(focusNode: ScopeNode, rootNode: ScopeNode): BOIAnalysis {
  console.log("🔬 Analyzing semantic references for:", {
    id: focusNode.id,
    label: focusNode.label,
  });

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

    console.log(`📊 Found ${boiScope.declarations.size} internal declarations`);

    // Extract semantic references
    const allReferences = extractSemanticReferences(
      sourceFile,
      sourceFile,
      focusNode.id,
      boiScope
    );

    // Categorize references by direction
    const externalReferences = allReferences.filter((ref) => !ref.isInternal);
    const recursiveReferences = allReferences.filter((ref) => ref.isInternal);

    console.log(`📤 Found ${externalReferences.length} external references`);
    console.log(`🔄 Found ${recursiveReferences.length} internal references`);

    // Find incoming references by searching the root node for references to BOI variables
    const incomingReferences = findIncomingReferences(
      focusNode,
      rootNode,
      boiScope
    );
    console.log(`📥 Found ${incomingReferences.length} incoming references`);

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

// Helper function to build hierarchical path from root to node
function getPathToNode(rootNode: ScopeNode, targetNodeId: string): ScopeNode[] {
  const path: ScopeNode[] = [];

  function findPath(node: ScopeNode, currentPath: ScopeNode[]): boolean {
    const newPath = [...currentPath, node];

    if (node.id === targetNodeId) {
      path.splice(0, path.length, ...newPath);
      return true;
    }

    if (node.children) {
      for (const child of node.children) {
        if (findPath(child, newPath)) {
          return true;
        }
      }
    }

    return false;
  }

  findPath(rootNode, []);
  return path;
}

// Helper function to find common ancestor of multiple nodes
function findCommonAncestor(rootNode: ScopeNode, nodeIds: string[]): ScopeNode {
  if (nodeIds.length === 0) return rootNode;
  if (nodeIds.length === 1) {
    const nodeId = nodeIds[0];
    if (!nodeId) return rootNode;
    const path = getPathToNode(rootNode, nodeId);
    const parentNode = path.length > 1 ? path[path.length - 2] : undefined;
    return parentNode || rootNode;
  }

  // Get paths for all nodes
  const paths = nodeIds
    .filter((id) => id != null)
    .map((id) => getPathToNode(rootNode, id));

  // Filter out empty paths
  const validPaths = paths.filter((path) => path.length > 0);
  if (validPaths.length === 0) return rootNode;

  // Find the deepest common ancestor
  let commonAncestorIndex = 0;
  const minPathLength = Math.min(...validPaths.map((p) => p.length));

  for (let i = 0; i < minPathLength; i++) {
    const firstNodeAtLevel = validPaths[0]?.[i];
    if (!firstNodeAtLevel) break;

    const allMatch = validPaths.every(
      (path) => path[i]?.id === firstNodeAtLevel.id
    );

    if (allMatch) {
      commonAncestorIndex = i;
    } else {
      break;
    }
  }

  const commonAncestor = validPaths[0]?.[commonAncestorIndex];
  return commonAncestor || rootNode;
}

// Helper function to flatten ELK hierarchy while preserving positions
function flattenElkHierarchy(
  elkNode: ElkNode,
  offsetX = 0,
  offsetY = 0
): ELKLayoutNode[] {
  const result: ELKLayoutNode[] = [];

  const nodeWithPosition: ELKLayoutNode = {
    id: elkNode.id,
    width: elkNode.width || 0,
    height: elkNode.height || 0,
    x: (elkNode.x || 0) + offsetX,
    y: (elkNode.y || 0) + offsetY,
  };

  result.push(nodeWithPosition);

  if (elkNode.children) {
    const childOffsetX = (elkNode.x || 0) + offsetX;
    const childOffsetY = (elkNode.y || 0) + offsetY;

    elkNode.children.forEach((child) => {
      result.push(...flattenElkHierarchy(child, childOffsetX, childOffsetY));
    });
  }

  return result;
}

// Helper function to build hierarchical structure preserving parent-child relationships
function buildHierarchicalStructure(
  nodes: ScopeNode[],
  rootNode: ScopeNode
): ScopeNode {
  console.log("🏗️ Building hierarchical structure for layout");

  const nodeIds = nodes.map((n) => n.id);
  const commonAncestor = findCommonAncestor(rootNode, nodeIds);

  console.log("🔍 Common ancestor found:", {
    id: commonAncestor.id,
    label: commonAncestor.label,
    targetNodes: nodeIds.length,
  });

  // Build a tree that includes all necessary nodes and their hierarchical relationships
  function buildSubtree(node: ScopeNode): ScopeNode | null {
    // Check if this node should be included
    const shouldInclude = nodeIds.includes(node.id);

    // Process children recursively
    const includedChildren: ScopeNode[] = [];
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        const builtChild = buildSubtree(child);
        if (builtChild) {
          includedChildren.push(builtChild);
        }
      }
    }

    // Include this node if either:
    // 1. It's explicitly in our target nodes, OR
    // 2. It has children that need to be included (intermediate node)
    if (shouldInclude || includedChildren.length > 0) {
      console.log(`📦 Including node in hierarchy: ${node.id} (${node.label})`);
      const result: ScopeNode = {
        ...node,
        children: includedChildren, // Always use the array, even if empty
      };
      return result;
    }

    return null;
  }

  const hierarchicalTree = buildSubtree(commonAncestor);
  return hierarchicalTree || commonAncestor;
}

// Convert hierarchical ScopeNode structure to ELK format
function hierarchicalScopeNodeToELK(
  node: ScopeNode,
  targetNodeIds: Set<string>,
  minWidth = 120,
  minHeight = 60
): ElkNode {
  console.log("🔄 Converting hierarchical node to ELK format:", {
    id: node.id,
    label: node.label,
    isTarget: targetNodeIds.has(node.id),
    hasChildren: !!node.children?.length,
  });

  // Calculate dimensions based on whether this is a target node or container
  const isTargetNode = targetNodeIds.has(node.id);
  const labelLength = (node.label || node.id.split(":").pop() || "Node").length;

  let width: number;
  let height: number;

  if (isTargetNode && (!node.children || node.children.length === 0)) {
    // Target leaf nodes (actual referenced nodes) should be appropriately sized
    width = Math.max(minWidth, labelLength * 8 + 20);
    height = Math.max(minHeight, 60);
  } else {
    // Container nodes should be larger to accommodate children
    const childrenWidth = node.children?.length ? 200 : 120;
    const childrenHeight = node.children?.length ? 120 : 80;
    width = Math.max(childrenWidth, labelLength * 8 + 40);
    height = Math.max(childrenHeight, 80);
  }

  const elkNode: ElkNode = {
    id: node.id,
    width,
    height,
  };

  // Process children if they exist and maintain hierarchy
  if (node.children && node.children.length > 0) {
    elkNode.children = [];

    for (const child of node.children) {
      const childElkNode = hierarchicalScopeNodeToELK(
        child,
        targetNodeIds,
        minWidth,
        minHeight
      );
      elkNode.children.push(childElkNode);
    }

    console.log(
      `  📦 Node ${node.id} has ${elkNode.children.length} children in hierarchy`
    );

    // Set layout options for container nodes
    elkNode.layoutOptions = {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.spacing.nodeNode": "20",
      "elk.padding": "[top=30,left=10,bottom=10,right=10]", // Extra top padding for container header
    };
  }

  console.log(
    `  ✅ ELK hierarchical node created: ${node.id} (${width}x${height}, children: ${elkNode.children?.length || 0})`
  );
  return elkNode;
}

// Helper function to extract the primary variable reference from JSX content
function extractPrimaryVariableFromJSX(focusNode: ScopeNode): string | null {
  if (!focusNode.source || typeof focusNode.source !== "string") {
    return null;
  }

  // Look for patterns like {workspace.name} or {variableName}
  const jsxExpressionMatch = focusNode.source.match(/\{([^}]+)\}/);
  if (jsxExpressionMatch) {
    const expression = jsxExpressionMatch[1]?.trim();
    if (expression) {
      // Extract the primary variable name (before any property access)
      const primaryVar = expression.split(".")[0]?.trim();
      if (primaryVar && primaryVar.length > 1 && !isKeyword(primaryVar)) {
        console.log(`🎯 Extracted primary variable from JSX: ${primaryVar}`);
        return primaryVar;
      }
    }
  }

  return null;
}

// Helper function to build a simple variable-focused reference graph
function buildSimpleVariableGraph(
  focusNode: ScopeNode,
  rootNode: ScopeNode,
  targetVariable: string
): {
  nodes: ScopeNode[];
  references: SemanticReference[];
  hierarchicalRoot: ScopeNode;
} {
  console.log(`🎯 Building simple variable graph for: ${targetVariable}`);

  const referencedNodes: ScopeNode[] = [focusNode];
  const references: SemanticReference[] = [];

  // Find nodes that declare or use this variable
  const declarationNodes = findNodesByName(rootNode, targetVariable);

  console.log(
    `🔍 Found ${declarationNodes.length} potential declaration nodes for ${targetVariable}`
  );

  // Only include the most relevant declaration (likely the closest one)
  if (declarationNodes.length > 0) {
    // Prefer nodes that look like variable declarations
    const declarationNode =
      declarationNodes.find(
        (node) =>
          node.category === "Variable" ||
          node.label?.includes(targetVariable) ||
          node.source?.includes(`const ${targetVariable}`) ||
          node.source?.includes(`let ${targetVariable}`) ||
          node.source?.includes(`var ${targetVariable}`)
      ) || declarationNodes[0];

    if (declarationNode && declarationNode.id !== focusNode.id) {
      referencedNodes.push(declarationNode);

      references.push({
        name: targetVariable,
        type: "variable_reference",
        sourceNodeId: focusNode.id,
        targetNodeId: declarationNode.id,
        position: { line: 1, character: 1 },
        isInternal: false,
        direction: "outgoing",
      });

      console.log(
        `✅ Added variable declaration: ${declarationNode.id} (${declarationNode.label})`
      );
    }
  }

  console.log(
    `✅ Simple variable graph built: ${referencedNodes.length} nodes, ${references.length} references`
  );

  return {
    nodes: referencedNodes,
    references,
    hierarchicalRoot:
      referencedNodes.length > 1
        ? buildHierarchicalStructure(referencedNodes, rootNode)
        : focusNode,
  };
}

// Helper function to build a reference graph from a focus node using semantic analysis
function buildSemanticReferenceGraph(
  focusNode: ScopeNode,
  rootNode: ScopeNode
): {
  nodes: ScopeNode[];
  references: SemanticReference[];
  hierarchicalRoot: ScopeNode;
} {
  console.log("🔬 Building semantic reference graph for:", focusNode.label);

  // Check if focus node has meaningful source code for analysis
  if (
    !focusNode.source ||
    typeof focusNode.source !== "string" ||
    focusNode.source.trim().length < 10
  ) {
    console.log(
      "ℹ️ Focus node has no meaningful source code - using simple visualization"
    );
    return {
      nodes: [focusNode],
      references: [],
      hierarchicalRoot: focusNode,
    };
  }

  // Perform full BOI analysis for all cases (including JSX)
  console.log("🔬 Performing full semantic analysis on focus node");
  const boiAnalysis = analyzeBOI(focusNode, rootNode);

  const allReferences = [
    ...boiAnalysis.externalReferences,
    ...boiAnalysis.incomingReferences,
    ...boiAnalysis.recursiveReferences,
  ];

  console.log(
    `📊 Found ${allReferences.length} total references (${boiAnalysis.externalReferences.length} external, ${boiAnalysis.incomingReferences.length} incoming, ${boiAnalysis.recursiveReferences.length} recursive)`
  );

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

      // Exclude very common/generic names that aren't meaningful
      const isGenericName = [
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
      ].includes(ref.name);

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

      const shouldInclude =
        isRelevantType &&
        !isGenericName &&
        !isTooShort &&
        !isSingleChar &&
        !isCommonProperty;

      console.log(`🔍 Reference analysis: ${ref.name}`, {
        type: ref.type,
        isRelevantType,
        isGenericName,
        shouldInclude,
      });

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

  console.log(
    `🔍 Filtered to ${prioritizedReferences.length} most relevant references`
  );

  // Resolve semantic references to actual nodes (with strict limits)
  for (const ref of prioritizedReferences) {
    const matchingNodes = findNodesByName(rootNode, ref.name);

    if (matchingNodes.length > 0) {
      // Sort nodes by size to find the most specific match
      const sortedMatchingNodes = matchingNodes.sort(
        (a, b) => getNodeSize(a) - getNodeSize(b)
      );

      const specificDeclarationNode = sortedMatchingNodes[0];

      if (!specificDeclarationNode) {
        continue;
      }

      console.log(`🔍 Selected node for ${ref.name}:`, {
        id: specificDeclarationNode.id,
        label: specificDeclarationNode.label,
        category: specificDeclarationNode.category,
      });

      if (referencedNodes.length >= maxNodes) {
        console.log(`⚠️ Reached maximum node limit (${maxNodes}), stopping`);
        break;
      }

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
        }
      } else {
        // For outgoing and recursive references
        if (
          specificDeclarationNode.id !== focusNode.id ||
          ref.direction === "recursive"
        ) {
          resolvedReferences.push({
            ...ref,
            targetNodeId: specificDeclarationNode.id,
          });

          // Always add the specific declaration node as a separate node in the graph
          if (
            !referencedNodes.some((n) => n.id === specificDeclarationNode.id)
          ) {
            referencedNodes.push(specificDeclarationNode);
            console.log(
              `✅ Added specific declaration node: ${specificDeclarationNode.id} (${specificDeclarationNode.label}) for reference: ${ref.name}`
            );
          } else {
            console.log(
              `⚠️ Skipped duplicate node: ${specificDeclarationNode.id} (${specificDeclarationNode.label}) for reference: ${ref.name}`
            );
          }
        } else {
          console.log(
            `⚠️ Skipped self-reference: ${specificDeclarationNode.id} (${specificDeclarationNode.label}) for reference: ${ref.name}`
          );
        }
      }
    } else {
      console.log(`⚠️ No matching nodes found for reference: ${ref.name}`);
    }
  }

  console.log(
    `✅ Reference graph built: ${referencedNodes.length} nodes, ${resolvedReferences.length} references`
  );

  // Log all nodes that will be included
  console.log("📋 Nodes to be included in reference graph:");
  referencedNodes.forEach((node, index) => {
    console.log(`  ${index + 1}. ${node.id} (${node.label})`);
  });

  // If we only have the focus node, just return a simple structure
  if (referencedNodes.length === 1) {
    console.log("ℹ️ Only focus node found - creating minimal visualization");
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
  console.log("🎯 ELK Reference Layout starting for:", focusNode.label);

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

  console.log("📊 Reference graph:", {
    nodes: referenceNodes.length,
    references: references.length,
  });

  if (referenceNodes.length === 1) {
    console.log("ℹ️ Only focus node found - creating minimal visualization");
  }

  // Convert hierarchical structure to ELK format
  const targetNodeIds = new Set(referenceNodes.map((n) => n.id));
  const elkHierarchy = hierarchicalScopeNodeToELK(
    hierarchicalRoot,
    targetNodeIds
  );

  // Build edges from references with proper direction indicators
  // Create a set of valid node IDs for quick lookup (including all nodes in hierarchy)
  const allElkNodeIds = new Set<string>();
  function collectElkNodeIds(elkNode: ElkNode) {
    allElkNodeIds.add(elkNode.id);
    if (elkNode.children) {
      elkNode.children.forEach(collectElkNodeIds);
    }
  }
  collectElkNodeIds(elkHierarchy);

  const elkEdges: ElkExtendedEdge[] = references
    .map((ref, index) => {
      if (!ref.targetNodeId) {
        return null;
      }

      // Validate that both source and target exist in elkNodes
      const sourceExists = allElkNodeIds.has(ref.sourceNodeId);
      const targetExists = allElkNodeIds.has(ref.targetNodeId);

      if (!sourceExists || !targetExists) {
        return null;
      }

      // Create edge with direction-aware styling and arrows
      const edgeId = `edge_${index}_${ref.direction}_${ref.type}`;

      // Configure edge properties based on direction
      const edge: ElkExtendedEdge = {
        id: edgeId,
        sources: [ref.sourceNodeId],
        targets: [ref.targetNodeId],
        // Remove labels since we're not displaying them
        // Add arrow and direction properties
        layoutOptions: {
          // ELK edge routing and arrow configuration
          "elk.edge.type": "DEPENDENCY",
          ...(ref.direction === "incoming" && {
            // For incoming references, emphasize the arrow pointing TO the BOI
            "elk.port.anchor": "[INCOMING]",
            "elk.edge.routing": "SPLINES",
          }),
          ...(ref.direction === "outgoing" && {
            // For outgoing references, emphasize the arrow pointing FROM the BOI
            "elk.port.anchor": "[OUTGOING]",
            "elk.edge.routing": "SPLINES",
          }),
          ...(ref.direction === "recursive" && {
            // For recursive references, use a different style
            "elk.port.anchor": "[RECURSIVE]",
            "elk.edge.routing": "SPLINES",
          }),
        },
      };

      return edge;
    })
    .filter((edge): edge is ElkExtendedEdge => edge !== null);

  console.log(
    `🔗 Created ${elkEdges.length} edges out of ${references.length} references`
  );

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

  console.log("🚀 Running ELK layout algorithm...");

  try {
    const layoutedGraph = await elk.layout(elkGraph);
    console.log("✅ ELK layout completed successfully");

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

    console.log(
      "📍 Layout complete with",
      hierarchicalNodes.length,
      "top-level nodes"
    );

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

    console.log("🎉 ELK layout complete:", {
      nodes: result.children.length,
      edges: result.edges.length,
    });

    return result;
  } catch (error) {
    console.error("❌ ELK layout failed:", error);
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
