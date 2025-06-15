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
  /** Absolute character offset (from SourceFile) where this reference occurs */
  offset: number;
  /** ID of the innermost ScopeNode that contains the reference usage (filled later) */
  usageNodeId?: string;
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

  const walk = (n: ts.Node): void => {
    // Variable declarations (simple identifiers)
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

    // Destructuring patterns – capture each individual name
    if (ts.isVariableDeclaration(n) && n.name) {
      extractDestructuredNames(n.name).forEach((name) => {
        const position = getLineAndCharacter(sourceFile, n.name!.pos);
        scope.declarations.set(name, { node: n, name, line: position.line });
      });
    }

    ts.forEachChild(n, walk);
  };

  walk(node);
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
        offset: n.pos,
        isInternal,
        direction: isInternal ? "recursive" : "outgoing",
      });
    }

    // Property access (calls or plain) – capture ONLY the root object identifier
    const handlePropertyAccess = (pa: ts.PropertyAccessExpression) => {
      const root = pa.expression;
      if (ts.isIdentifier(root)) {
        const name = root.text;
        if (!isKeyword(name)) {
          const isInternal = isVariableDeclaredInScope(name, boiScope);
          references.push({
            name,
            type: "variable_reference",
            sourceNodeId,
            position,
            offset: pa.pos,
            isInternal,
            direction: isInternal ? "recursive" : "outgoing",
          });
        }
      }
    };

    // Property access in a call expression: foo.bar()
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      handlePropertyAccess(n.expression);
    }

    // Stand-alone property access: foo.bar
    if (
      ts.isPropertyAccessExpression(n) &&
      !ts.isCallExpression(n.parent) /* avoid double count */
    ) {
      handlePropertyAccess(n);
    }

    // Variable references (not in declarations)
    if (
      ts.isIdentifier(n) &&
      !isPartOfDeclaration(n) &&
      !isIdentifierTypePosition(n)
    ) {
      // Skip identifiers that are *property names* in a property access expression
      // e.g. the `includes` in `keysToTrack.includes`. We only want the root object
      // (handled separately by `handlePropertyAccess`).
      if (ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) {
        return; // ignore property name part
      }

      const name = n.text;

      // Skip common keywords and JSX component names
      if (!isKeyword(name) && !isJSXComponentName(n)) {
        const isInternal = isVariableDeclaredInScope(name, boiScope);

        references.push({
          name,
          type: "variable_reference",
          sourceNodeId,
          position,
          offset: n.pos,
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
          offset: n.pos,
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
              offset: n.pos,
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

  // Convert local offsets to absolute file offsets
  const focusStartOffset = getRangeFromNodeId(sourceNodeId)?.start ?? 0;
  references.forEach((r) => {
    r.offset = r.offset + focusStartOffset;
  });

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

    if (ts.isIdentifier(expr) && !isIdentifierTypePosition(expr)) {
      const name = expr.text;
      if (!isKeyword(name)) {
        const isInternal = isVariableDeclaredInScope(name, boiScope);
        references.push({
          name,
          type: "variable_reference",
          sourceNodeId,
          position,
          offset: expr.pos,
          isInternal,
          direction: isInternal ? "recursive" : "outgoing",
        });
      }
    } else if (ts.isPropertyAccessExpression(expr)) {
      // Capture only the root object identifier of the JSX property access
      const rootObj = expr.expression;
      if (ts.isIdentifier(rootObj)) {
        const name = rootObj.text;
        const isInternal = isVariableDeclaredInScope(name, boiScope);
        references.push({
          name,
          type: "variable_reference",
          sourceNodeId,
          position,
          offset: expr.pos,
          isInternal,
          direction: isInternal ? "recursive" : "outgoing",
        });
      }
    } else if (ts.isCallExpression(expr)) {
      if (ts.isIdentifier(expr.expression)) {
        const name = expr.expression.text;
        const isInternal = isVariableDeclaredInScope(name, boiScope);
        references.push({
          name,
          type: "function_call",
          sourceNodeId,
          position,
          offset: expr.pos,
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
          offset: expr.pos,
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

// INSERT: Add a helper that tells us whether an identifier occurs only in a type position
function isIdentifierTypePosition(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;

  // Directly inside a type node (e.g. foo: MyType or const x: Promise<string>)
  if (
    ts.isTypeReferenceNode(parent) ||
    ts.isQualifiedName(parent) ||
    ts.isTypeParameterDeclaration(parent) ||
    ts.isImportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isHeritageClause(parent) ||
    ts.isExpressionWithTypeArguments(parent) ||
    ts.isTypeAliasDeclaration(parent) ||
    ts.isInterfaceDeclaration(parent) ||
    ts.isTypeLiteralNode(parent)
  ) {
    return true;
  }

  // Inside an "as" assertion or angle-bracket cast (<MyType>value). The
  // identifier will appear within the type portion of these nodes, so we
  // treat it as a type-only position.
  if (ts.isAsExpression(parent) || ts.isTypeAssertionExpression(parent)) {
    return true;
  }

  return false;
}

// NEW: Cache declaration look-ups per node to avoid repeated AST parsing
const declarationCache: Map<
  string /*nodeId*/,
  Map<string /*ident*/, boolean>
> = new Map();

/** Returns true if the provided ScopeNode's source actually CONTAINS a real
 *  declaration (parameter, variable, function, import, class, enum, etc.) for
 *  the identifier.
 */
function nodeDeclaresIdentifier(node: ScopeNode, ident: string): boolean {
  if (!node.source || typeof node.source !== "string") return false;

  // Quick substring filter first – cheap rejection for most nodes
  if (!node.source.includes(ident)) return false;

  // Cache key per node
  let perNode = declarationCache.get(node.id);
  if (!perNode) {
    perNode = new Map();
    declarationCache.set(node.id, perNode);
  }
  if (perNode.has(ident)) {
    return perNode.get(ident)!;
  }

  let declares = false;
  try {
    const sf = createSourceFile(node.source);

    // Walk the file looking for identifier declarations
    const walk = (n: ts.Node): void => {
      if (declares) return; // early exit

      // Variable declarations (supports identifiers AND destructuring patterns)
      if (ts.isVariableDeclaration(n)) {
        if (ts.isIdentifier(n.name)) {
          if (n.name.text === ident) {
            declares = true;
            return;
          }
        } else {
          // Handle array/object binding patterns (destructuring)
          const names = extractDestructuredNames(n.name);
          if (names.includes(ident)) {
            declares = true;
            return;
          }
        }
      }

      // Parameter declarations (supports identifiers AND destructuring patterns)
      if (ts.isParameter(n)) {
        if (ts.isIdentifier(n.name)) {
          if (n.name.text === ident) {
            declares = true;
            return;
          }
        } else {
          const names = extractDestructuredNames(n.name);
          if (names.includes(ident)) {
            declares = true;
            return;
          }
        }
      }

      // Function / class / enum / type alias names
      if (
        (ts.isFunctionDeclaration(n) ||
          ts.isClassDeclaration(n) ||
          ts.isEnumDeclaration(n) ||
          ts.isTypeAliasDeclaration(n) ||
          ts.isInterfaceDeclaration(n)) &&
        n.name &&
        ts.isIdentifier(n.name) &&
        n.name.text === ident
      ) {
        declares = true;
        return;
      }

      // Import specifiers (named + default)
      if (ts.isImportDeclaration(n) && n.importClause) {
        if (n.importClause.name?.text === ident) {
          declares = true;
          return;
        }
        if (
          n.importClause.namedBindings &&
          ts.isNamedImports(n.importClause.namedBindings)
        ) {
          for (const el of n.importClause.namedBindings.elements) {
            if (el.name.text === ident) {
              declares = true;
              return;
            }
          }
        }
      }

      ts.forEachChild(n, walk);
    };

    walk(sf);
  } catch (err) {
    // parsing failed – treat as non-declaration
  }

  perNode.set(ident, declares);
  return declares;
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
    if (node.label) {
      // Escape any regex characters in the target name once so we can safely build patterns
      const escaped = targetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      // 1) Exact start (fast path – common for most declarations)
      const exactStartRegex = new RegExp(`^${escaped}\\b`);

      // 2) Anywhere within the label but on *word* boundaries so we still avoid
      //    partial matches (e.g. `key` inside `monkey`). This captures array /
      //    object destructuring labels like "[foo, bar]" or "{ foo, bar }".
      const wordBoundaryRegex = new RegExp(`\\b${escaped}\\b`);

      // ----------------------------------------------------------------
      // Matching heuristics
      // ----------------------------------------------------------------
      // We want to find *proper* identifier matches while avoiding partial
      // substring hits (e.g. the word "Access" inside "verifyAccess").  A
      // match is considered valid when ONE of the following is true:
      //   1) The label *starts* with the identifier followed by a word
      //      boundary.  This covers most declarations like "password" or
      //      "handleSubmit".
      //   2) The entire label *is exactly* the identifier (rare but simple).
      //   3) The identifier appears on its own word-boundary inside the
      //      label (useful for destructuring labels such as "[foo, bar]").
      //
      // NOTE: We purposely *exclude* previously-used heuristics like
      // `label.includes("${targetName}.")` because they allowed partial
      // matches such as "Access" -> "verifyAccess.mutate", which produced
      // spurious edges to unrelated nodes.

      const isMatch =
        exactStartRegex.test(node.label) ||
        node.label === targetName ||
        wordBoundaryRegex.test(node.label);

      const declaresHere = nodeDeclaresIdentifier(node, targetName);
      const matched = isMatch || declaresHere;

      if (matched) {
        console.log(`  🔎 candidate ➜`, {
          id: node.id,
          label: node.label,
          category: node.category,
          declares: declaresHere,
        });
        matches.push(node);
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

  // Build the path from root to the common ancestor so we can include higher-level context
  const ancestorPath = getPathToNode(rootNode, commonAncestor.id);

  // Helper to attach child into shallow copy
  const cloneNode = (n: ScopeNode): ScopeNode => ({
    ...n,
    children: n.children ? [] : [],
  });

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

  // Now graft this subtree under the ancestor chain to reach the root
  let current: ScopeNode = hierarchicalTree || commonAncestor;
  for (let i = ancestorPath.length - 2; i >= 0; i--) {
    const anc = ancestorPath[i];
    if (!anc) continue;
    const parent = cloneNode(anc);
    parent.children = [current];
    current = parent;
  }

  return current;
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

// Helper function to build a simple variable-focused reference graph

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
  console.log(
    `[REF_GRAPH] Prioritized references to resolve:`,
    prioritizedReferences.map((r) => r.name)
  );

  // Resolve semantic references to actual nodes (with strict limits)
  for (const ref of prioritizedReferences) {
    const isTargetRef =
      ref.name === "password" ||
      ref.name === "setPassword" ||
      ref.name === "Input";

    if (isTargetRef) {
      console.log(`[REF_GRAPH] Resolving reference: "${ref.name}"`);
    }
    const matchingNodes = findNodesByName(rootNode, ref.name);

    if (matchingNodes.length > 0) {
      if (isTargetRef) {
        console.log(
          `[REF_GRAPH] Found ${
            matchingNodes.length
          } candidates for "${ref.name}":`,
          matchingNodes.map((n) => ({
            id: n.id,
            label: n.label,
            category: n.category,
            size: getNodeSize(n),
          }))
        );
      }

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

      if (declarationCandidates.length > 0) {
        console.log(
          `[REF_GRAPH] Filtering to ${declarationCandidates.length} declaration candidates for "${ref.name}"`
        );
      }

      const sortedMatchingNodes = (
        declarationCandidates.length > 0 ? declarationCandidates : matchingNodes
      ).sort((a, b) => {
        // Smaller node size → more specific → higher priority
        return getNodeSize(a) - getNodeSize(b);
      });

      const specificDeclarationNode = sortedMatchingNodes[0];
      console.log(
        `[REF_GRAPH] Final chosen node for "${ref.name}":`,
        specificDeclarationNode
          ? {
              id: specificDeclarationNode.id,
              label: specificDeclarationNode.label,
              category: specificDeclarationNode.category,
              size: getNodeSize(specificDeclarationNode),
            }
          : "NONE"
      );

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
        const usageNodeId = ref.offset
          ? findInnermostNodeByOffset(rootNode, ref.offset)?.id || focusNode.id
          : focusNode.id;

        resolvedReferences.push({
          ...ref,
          targetNodeId: focusNode.id,
          usageNodeId,
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
          const usageNodeId = ref.offset
            ? findInnermostNodeByOffset(rootNode, ref.offset)?.id ||
              focusNode.id
            : focusNode.id;

          resolvedReferences.push({
            ...ref,
            targetNodeId: specificDeclarationNode.id,
            usageNodeId,
          });

          // Ensure both the declaration and usage nodes are included in the graph
          if (
            !referencedNodes.some((n) => n.id === specificDeclarationNode.id)
          ) {
            referencedNodes.push(specificDeclarationNode);
          }

          if (
            usageNodeId &&
            !referencedNodes.some((n) => n.id === usageNodeId)
          ) {
            const usageNode = findInnermostNodeByOffset(rootNode, ref.offset);
            if (usageNode) {
              referencedNodes.push(usageNode);
            }
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

  // If no edges could be resolved, fall back to minimal visualization
  if (resolvedReferences.length === 0) {
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

  // ---------------- NEW: create synthetic Parameter nodes ----------------
  // For variable references that ultimately resolved to a *function/arrow* node
  // (meaning the identifier is very likely a parameter), create a small leaf
  // node under that parent so the variable gets its own dedicated box.
  type SyntheticParamInfo = { id: string; name: string; parentId: string };
  const syntheticParams: SyntheticParamInfo[] = [];

  const nodeById = new Map(referenceNodes.map((n) => [n.id, n]));

  references.forEach((ref) => {
    if (
      ref.direction === "outgoing" &&
      ref.type === "variable_reference" &&
      ref.targetNodeId
    ) {
      const targetNode = nodeById.get(ref.targetNodeId);
      if (targetNode) {
        const cat = String(targetNode.category);
        const shouldTreatAsParam = (() => {
          if (
            cat === "ArrowFunction" ||
            cat === "Function" ||
            cat === "Method" ||
            cat.endsWith("Function")
          ) {
            // Likely a real function parameter – always true here
            return true;
          }

          if (cat === "Variable") {
            // Use AST inspection to see if the identifier is part of a binding
            // pattern (object / array destructuring) within this variable
            // declaration.
            const isDestructured = nodeDestructuresIdentifier(
              targetNode,
              ref.name
            );
            return isDestructured;
          }

          return false;
        })();

        if (shouldTreatAsParam) {
          const paramId = `${targetNode.id}::param:${ref.name}`;
          // Update the reference to point to the synthetic parameter node
          ref.targetNodeId = paramId;

          // Only add once per (parent,param)
          if (!syntheticParams.some((p) => p.id === paramId)) {
            syntheticParams.push({
              id: paramId,
              name: ref.name,
              parentId: targetNode.id,
            });
            console.log(`➕ Created synthetic param node for ${ref.name}`, {
              parent: targetNode.label,
              id: paramId,
            });
          }
        }

        // Final decision for param creation is logged for easier debugging
        console.log(
          `🔍 Param decision for ${ref.name}: cat=${cat} => ${shouldTreatAsParam ? "treat-as-param" : "skip"}`
        );
      }
    }
  });

  console.log("📊 Reference graph:", {
    nodes: referenceNodes.length,
    references: references.length,
    syntheticParams: syntheticParams.length,
  });

  if (referenceNodes.length === 1 && syntheticParams.length === 0) {
    console.log("ℹ️ Only focus node found - creating minimal visualization");
  }

  // ----------------------------------------------------------------------

  // Convert hierarchical structure to ELK format
  const targetNodeIds = new Set(referenceNodes.map((n) => n.id));
  const elkHierarchy = hierarchicalScopeNodeToELK(
    hierarchicalRoot,
    targetNodeIds
  );

  // ---------------- Inject synthetic Parameter nodes into ELK hierarchy ----------------
  if (syntheticParams.length > 0) {
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

    syntheticParams.forEach((param) => {
      const parentElk = findElkNodeById(elkHierarchy, param.parentId);
      if (!parentElk) return; // parent not in hierarchy – skip

      if (!parentElk.children) parentElk.children = [];

      // Avoid duplicates
      if (parentElk.children.some((c) => c.id === param.id)) return;

      parentElk.children.push({
        id: param.id,
        width: 120,
        height: 60,
        labels: [{ text: param.name } as any],
      });
      console.log(`🔧 Injected parameter node into ELK: ${param.name}`);
    });
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

      // Skip edges that reference nodes not in the hierarchy
      if (!allElkNodeIds.has(sourceId) || !allElkNodeIds.has(targetId)) {
        return null;
      }

      // Debug log
      console.log("[EDGE_BUILD]", {
        ref: ref.name,
        dir: ref.direction,
        src: sourceId,
        tgt: targetId,
      });

      const edgeId = `edge_${index}_${ref.direction}_${ref.type}`;

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

  console.log(
    `🔗 Created ${elkEdges.length} edges out of ${references.length} references`
  );

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

// -------- helper utilities for locating reference usage nodes --------

// Extract start/end character offsets from a ScopeNode.id (format: "...:start-end")
function getRangeFromNodeId(
  nodeId: string
): { start: number; end: number } | null {
  const m = nodeId.match(/:(\d+)-(\d+)$/);
  if (!m) return null;
  const start = parseInt(m[1]!, 10);
  const end = parseInt(m[2]!, 10);
  if (isNaN(start) || isNaN(end)) return null;
  return { start, end };
}

// Recursively find the smallest (innermost) ScopeNode that spans the given character offset
function findInnermostNodeByOffset(
  node: ScopeNode,
  offset: number
): ScopeNode | null {
  const range = getRangeFromNodeId(node.id);
  if (range && (offset < range.start || offset > range.end)) {
    // Range exists and offset outside – prune branch
    return null;
  }

  let bestMatch: ScopeNode | null = node;

  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      const candidate = findInnermostNodeByOffset(child, offset);
      if (candidate) {
        const candRange = getRangeFromNodeId(candidate.id);
        const bestRange = getRangeFromNodeId(bestMatch.id);
        if (candRange) {
          if (!bestRange) {
            // Current best has no range (likely the file root) – prefer any ranged child
            bestMatch = candidate;
          } else if (
            candRange.end - candRange.start <
            bestRange.end - bestRange.start
          ) {
            bestMatch = candidate;
          }
        }
      }
    }
  }

  // 🔍 Debug log to see which node the offset maps to
  if (bestMatch) {
    console.log("[OFFSET_MATCH]", {
      offset,
      matchedNodeId: bestMatch.id,
      matchedLabel: bestMatch.label,
    });
  }

  return bestMatch;
}

// ---------------------------------------------------------------------------
// Helper: detect if a ScopeNode declares the identifier as part of a *destructuring*
// binding rather than a plain identifier declaration (e.g. `const [foo] = ...` or
// `const { foo } = ...`).  This lets downstream logic know when to nest a tiny
// leaf parameter box under the Variable declaration node.

const destructuringCache: Map<
  string /*nodeId*/,
  Map<string /*ident*/, boolean>
> = new Map();

function nodeDestructuresIdentifier(node: ScopeNode, ident: string): boolean {
  if (!node.source || typeof node.source !== "string") return false;

  // Cheap reject – identifier not even present in source slice
  if (!node.source.includes(ident)) return false;

  let perNode = destructuringCache.get(node.id);
  if (!perNode) {
    perNode = new Map();
    destructuringCache.set(node.id, perNode);
  }
  if (perNode.has(ident)) return perNode.get(ident)!;

  let isDestructured = false;
  try {
    const sf = createSourceFile(node.source);

    const walk = (n: ts.Node): void => {
      if (isDestructured) return; // early exit once found

      if (ts.isVariableDeclaration(n) || ts.isParameter(n)) {
        const binding = n.name;
        // We only care about non-Identifier binding patterns
        if (!ts.isIdentifier(binding)) {
          const names = extractDestructuredNames(binding);
          if (names.includes(ident)) {
            isDestructured = true;
            return;
          }
        }
      }

      ts.forEachChild(n, walk);
    };

    walk(sf);
  } catch {
    // Ignore parse errors; fall back to false
  }

  perNode.set(ident, isDestructured);
  return isDestructured;
}
