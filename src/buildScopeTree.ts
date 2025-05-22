import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import {
  Position,
  NodeCategory,
  ScopeNode,
  BuildScopeTreeOptions,
} from "./types";
import { buildScopeTreeForMarkdown } from "./buildScopeTreeForMarkdown";

// Default options for buildScopeTree
const defaultBuildOptions: Required<BuildScopeTreeOptions> = {
  flattenTree: true, // Enable overall flattening pass
  flattenBlocks: true,
  flattenArrowFunctions: true,
  createSyntheticGroups: true,
  includeImports: true,
  includeTypes: true,
  includeLiterals: false, // Literals often off by default due to volume
};

// Helper function to check for assignment operator kinds
function isAssignmentOperatorKind(kind: ts.SyntaxKind): boolean {
  return (
    kind === ts.SyntaxKind.EqualsToken ||
    kind === ts.SyntaxKind.PlusEqualsToken ||
    kind === ts.SyntaxKind.MinusEqualsToken ||
    kind === ts.SyntaxKind.AsteriskEqualsToken ||
    kind === ts.SyntaxKind.AsteriskAsteriskEqualsToken ||
    kind === ts.SyntaxKind.SlashEqualsToken ||
    kind === ts.SyntaxKind.PercentEqualsToken ||
    kind === ts.SyntaxKind.LessThanLessThanEqualsToken ||
    kind === ts.SyntaxKind.GreaterThanGreaterThanEqualsToken ||
    kind === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken ||
    kind === ts.SyntaxKind.AmpersandEqualsToken ||
    kind === ts.SyntaxKind.BarEqualsToken ||
    kind === ts.SyntaxKind.CaretEqualsToken ||
    kind === ts.SyntaxKind.BarBarEqualsToken || // Logical OR assignment
    kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken || // Logical AND assignment
    kind === ts.SyntaxKind.QuestionQuestionEqualsToken
  ); // Nullish coalescing
}

function isScopeBoundary(node: ts.Node): boolean {
  return (
    ts.isSourceFile(node) ||
    ts.isModuleBlock(node) ||
    ts.isClassLike(node) ||
    ts.isFunctionLike(node) || // Catches functions, methods, arrow functions, constructors
    ts.isBlock(node) || // Catches block statements {}
    ts.isCatchClause(node) || // catch (e) {}
    // ts.isCaseBlock(node) || // case clauses in a switch actually form a block -- REMOVED
    // ts.isCaseClause(node) || // case x: individual case, might be too granular
    // ts.isDefaultClause(node) || // default: individual default, might be too granular
    ts.isForStatement(node) || // for (;;) {}
    ts.isForInStatement(node) || // for (x in y) {}
    ts.isForOfStatement(node) || // for (x of y) {}
    ts.isWhileStatement(node) || // while (true) {}
    ts.isDoStatement(node) // do {} while (true)
  );
}

function mapKindToCategory(
  node: ts.Node,
  sourceFile?: ts.SourceFile
): NodeCategory {
  if (ts.isSourceFile(node)) return NodeCategory.Program;
  if (ts.isModuleDeclaration(node)) return NodeCategory.Module;
  if (ts.isClassLike(node)) return NodeCategory.Class; // Catches ClassDeclaration and ClassExpression
  if (ts.isArrowFunction(node)) {
    // Heuristic: arrow function returning JSX ⇒ React component
    if (
      node.body &&
      (ts.isJsxElement(node.body) ||
        ts.isJsxSelfClosingElement(node.body) ||
        (ts.isBlock(node.body) &&
          ts.forEachChild(node.body, (child) =>
            ts.isReturnStatement(child) &&
            child.expression &&
            (ts.isJsxElement(child.expression) ||
              ts.isJsxSelfClosingElement(child.expression))
              ? true
              : undefined
          )))
    ) {
      return NodeCategory.ReactComponent;
    }
    return NodeCategory.ArrowFunction;
  }
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  ) {
    // Heuristic: function returning JSX ⇒ React component
    if (
      node.body &&
      ts.forEachChild(node.body, (c) =>
        ts.isReturnStatement(c) &&
        c.expression &&
        (ts.isJsxElement(c.expression) ||
          ts.isJsxSelfClosingElement(c.expression))
          ? true
          : undefined
      )
    ) {
      return NodeCategory.ReactComponent;
    }
    return NodeCategory.Function;
  }
  if (ts.isBlock(node)) return NodeCategory.Block;
  if (ts.isVariableDeclaration(node)) return NodeCategory.Variable; // Note: ts.VariableDeclarationList is the parent for `const a=1,b=2`

  // IfStatement will be handled specially to create ConditionalBlock, IfClause, etc.
  // but its underlying kind can still be ControlFlow if categorized directly.
  if (
    ts.isIfStatement(node) || // Keep this for direct categorization if needed
    ts.isSwitchStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isTryStatement(node) || // try {} catch {} finally {}
    ts.isCatchClause(node) ||
    ts.isCaseClause(node) || // Added
    ts.isDefaultClause(node) // Added
  )
    return NodeCategory.ControlFlow;

  if (ts.isCallExpression(node)) {
    const identNode = ts.isPropertyAccessExpression(node.expression)
      ? node.expression.name
      : node.expression;
    if (ts.isIdentifier(identNode)) {
      const ident = identNode.getText(sourceFile);
      if (/^use[A-Z]/.test(ident)) return NodeCategory.ReactHook;
    }
    return NodeCategory.Call;
  }
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    const tagNameNode = ts.isJsxElement(node)
      ? node.openingElement.tagName
      : node.tagName;
    const tagName = tagNameNode.getText(sourceFile);
    if (tagName && /^[a-z]/.test(tagName)) {
      return NodeCategory.JSXElementDOM;
    } else {
      return NodeCategory.JSXElementCustom;
    }
  }
  if (ts.isJsxFragment(node)) return NodeCategory.JSX;

  // Add new mappings
  if (ts.isImportDeclaration(node)) return NodeCategory.Import;
  if (ts.isTypeAliasDeclaration(node)) return NodeCategory.TypeAlias;
  if (ts.isInterfaceDeclaration(node)) return NodeCategory.Interface;
  if (ts.isReturnStatement(node)) return NodeCategory.ReturnStatement;
  if (
    ts.isBinaryExpression(node) &&
    isAssignmentOperatorKind(node.operatorToken.kind)
  ) {
    return NodeCategory.Assignment;
  }
  if (
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    // ts.isBooleanLiteral(node) // ts.SyntaxKind.TrueKeyword / FalseKeyword
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword
  )
    return NodeCategory.Literal;

  return NodeCategory.Other;
}

// New function to format the display label, incorporating logic previously in getNodeDisplayLabel.tsx
function formatScopeNodeLabel(node: ScopeNode): string {
  let displayLabel = node.label; // Initialize with baseLabel, which is node.label

  // Logic adapted from getNodeDisplayLabel.tsx
  // Only include cases that modify the base label.
  switch (node.category) {
    case NodeCategory.Module:
      displayLabel = `module ${displayLabel}`;
      break;
    case NodeCategory.Class:
      displayLabel = `class ${displayLabel}`;
      break;
    case NodeCategory.ReactComponent:
      displayLabel = `<${displayLabel}>`;
      break;
    case NodeCategory.ArrowFunction:
      if (node.meta?.collapsed === "arrowFunction") {
        if (node.meta?.call) {
          displayLabel = `() => ${node.meta.call}`;
        } else {
          displayLabel = `() => { ... }`; // Simple collapsed view
        }
      } else if (!displayLabel) {
        // Fallback if baseLabel (displayLabel here) was empty
        displayLabel = "Arrow Function";
      }
      // If displayLabel had a value (e.g. from variable assignment), it's used directly.
      break;
    case NodeCategory.Function:
      displayLabel = `${displayLabel}()`; // e.g., "myFunction()"
      break;
    case NodeCategory.Block:
      // For blocks that are not special (like 'finally', 'catch body')
      // and not collapsed. 'finally' label is already set by determineNodeLabel.
      // General blocks might not need a prefix, or could be "{ Block }"
      if (displayLabel === "Block") {
        // Only change if it's the generic "Block"
        displayLabel = "{ Block }";
      }
      // If displayLabel was specific (e.g., "finally"), it remains.
      break;
    case NodeCategory.Import:
      displayLabel = `import ${displayLabel}`; // baseLabel is usually the module name
      break;
    case NodeCategory.TypeAlias:
      displayLabel = `type ${displayLabel}`;
      break;
    case NodeCategory.Interface:
      displayLabel = `interface ${displayLabel}`;
      break;
    case NodeCategory.Literal:
      // determineNodeLabel now returns the literal's text.
      // Format it for display, e.g., strings in quotes.
      if (node.kind === ts.SyntaxKind.StringLiteral) {
        // If node.source is the full source text of the literal including quotes
        // and determineNodeLabel returns text without quotes, we might need to re-add them
        // For now, assume displayLabel (baseLabel) is the raw string content.
        // Let's refine to check if it *looks* like it needs quoting.
        // If determineNodeLabel for StringLiteral returns node.text, it won't have quotes.
        if (
          !(displayLabel.startsWith("'") && displayLabel.endsWith("'")) &&
          !(displayLabel.startsWith('"') && displayLabel.endsWith('"'))
        ) {
          displayLabel = `'${displayLabel}'`; // Add single quotes if not already quoted
        }
      }
      // For numbers, booleans, displayLabel (baseLabel) is already correct.
      break;
    case NodeCategory.SyntheticGroup:
      // Labels like "Imports", "Type defs" are set directly by determineNodeLabel for the group.
      displayLabel = `${displayLabel} (${node.children?.length || 0})`;
      break;
    default:
      // Handles NodeCategory.Program, Variable, ControlFlow, IfClause, etc., and Other.
      // If displayLabel (baseLabel) was "UnknownNode" or empty, set it to the category name.
      if (displayLabel === "UnknownNode" || !displayLabel) {
        displayLabel = node.category;
      }
      // Otherwise, displayLabel (baseLabel) is used as is.
      break;
  }

  // Add line numbers if not a synthetic group and not the program root
  if (
    node.category !== NodeCategory.SyntheticGroup &&
    node.category !== NodeCategory.Program
  ) {
    if (node.loc && node.loc.start && node.loc.end) {
      if (node.loc.start.line === node.loc.end.line) {
        displayLabel += ` [${node.loc.start.line}]`;
      } else {
        displayLabel += ` [${node.loc.start.line}-${node.loc.end.line}]`;
      }
    }
  }
  return displayLabel;
}

function determineNodeLabel(
  item: ts.Node | ScopeNode, // Can be a TS AST node or a ScopeNode (for synthetic/post-processed nodes)
  sourceFile?: ts.SourceFile, // Required if item is ts.Node
  childrenForSyntheticNode?: ScopeNode[] // Optional: for nodes whose labels depend on children (e.g., ConditionalBlock)
): string {
  // Handle ScopeNode items (typically synthetic or already processed)
  if ("category" in item && "id" in item) {
    // Heuristic to check if it's a ScopeNode
    const scopeNode = item as ScopeNode;
    switch (scopeNode.category) {
      case NodeCategory.Program: // Root node
        return path.basename(scopeNode.id); // id is filePath for root
      case NodeCategory.ConditionalBlock:
        if (childrenForSyntheticNode && childrenForSyntheticNode.length > 0) {
          const clauseTypes: string[] = [];
          if (
            childrenForSyntheticNode.some(
              (c) => c.category === NodeCategory.IfClause
            )
          ) {
            clauseTypes.push("if");
          }
          if (
            childrenForSyntheticNode.some(
              (c) => c.category === NodeCategory.ElseIfClause
            )
          ) {
            if (!clauseTypes.includes("else if")) {
              clauseTypes.push("else if");
            }
          }
          if (
            childrenForSyntheticNode.some(
              (c) => c.category === NodeCategory.ElseClause
            )
          ) {
            clauseTypes.push("else");
          }
          if (clauseTypes.length > 0) {
            return clauseTypes.join("/");
          }
          return "Conditional"; // Fallback
        }
        return "Conditional Block"; // Default if no children info
      case NodeCategory.IfClause: // Should be derived from ts.Node, but as a fallback
      case NodeCategory.ElseIfClause:
      case NodeCategory.ElseClause: // Fallback if somehow called with ScopeNode
        return scopeNode.label || scopeNode.category; // Use pre-set label or category name
      case NodeCategory.Block: // E.g. a 'finally' block might be passed as a ScopeNode
        if (scopeNode.label === "finally") return "finally"; // If it was pre-labeled
        // General blocks usually don't have distinct labels unless they are special (like 'finally')
        return "Block"; // Or derive from its original kind if available in meta
      case NodeCategory.SyntheticGroup:
        return scopeNode.label; // Synthetic groups have their labels (e.g., "Imports") set directly
      default:
        // For other ScopeNodes, if they have a label, use it. Otherwise, fallback.
        return scopeNode.label || ts.SyntaxKind[scopeNode.kind] || "ScopeNode";
    }
  }

  // Handle ts.Node items
  const tsNode = item as ts.Node;
  if (!sourceFile) {
    // sourceFile is crucial for getText()
    // This case should ideally not be hit if called correctly from walk for ts.Node
    return ts.SyntaxKind[tsNode.kind] || "UnknownTSNode";
  }

  // --- Control Flow concise labeling ---
  if (ts.isTryStatement(tsNode)) return "try";
  if (ts.isCatchClause(tsNode)) return "catch"; // The block associated with catch
  if (ts.isForStatement(tsNode)) {
    const init = tsNode.initializer
      ? tsNode.initializer.getText(sourceFile).trim()
      : "";
    const cond = tsNode.condition
      ? tsNode.condition.getText(sourceFile).trim()
      : "";
    const incr = tsNode.incrementor
      ? tsNode.incrementor.getText(sourceFile).trim()
      : "";
    return `for (${init}; ${cond}; ${incr})`;
  }
  if (ts.isForOfStatement(tsNode)) {
    const init = tsNode.initializer.getText(sourceFile).trim();
    const expr = tsNode.expression.getText(sourceFile).trim();
    return `for (${init} of ${expr})`;
  }
  if (ts.isForInStatement(tsNode)) {
    const init = tsNode.initializer.getText(sourceFile).trim();
    const expr = tsNode.expression.getText(sourceFile).trim();
    return `for (${init} in ${expr})`;
  }
  if (ts.isWhileStatement(tsNode)) {
    // Label for the 'while' loop itself. Condition text could be added if desired.
    // Example: `while (${tsNode.expression.getText(sourceFile)})`
    return "while";
  }
  if (ts.isDoStatement(tsNode)) return "do";
  if (ts.isSwitchStatement(tsNode)) return "switch";
  if (ts.isCaseClause(tsNode)) {
    const expr = tsNode.expression?.getText(sourceFile);
    return expr ? `case ${expr}` : "case";
  }
  if (ts.isDefaultClause(tsNode)) return "default";

  // Labels for IfStatement clauses (called when creating IfClause, ElseIfClause nodes)
  if (ts.isIfStatement(tsNode)) {
    // This specific part is tricky because an IfStatement can be an IfClause or ElseIfClause
    // The caller (walk) determines its role.
    // For direct calls, this could be a generic "If Statement" or based on its expression.
    // Let's assume specific clauses are handled by their distinct node creation in walk.
    // If this function is called for the *whole* if statement that is NOT part of a chain handled by ConditionalBlock:
    return `if (${tsNode.expression.getText(sourceFile)})`;
  }

  // --- Declarations and Identifiers ---
  if (ts.isFunctionLike(tsNode) && tsNode.name && ts.isIdentifier(tsNode.name))
    return tsNode.name.text;
  if (ts.isArrowFunction(tsNode)) return "() => {}"; // Revised: Always return () => {} as base label
  if (ts.isClassLike(tsNode) && tsNode.name && ts.isIdentifier(tsNode.name))
    return tsNode.name.text;
  if (ts.isVariableDeclaration(tsNode))
    // Revised: Use getText() for full LHS
    return tsNode.name.getText(sourceFile);
  if (ts.isModuleDeclaration(tsNode))
    return tsNode.name.getText(sourceFile) || tsNode.name.text;
  if (ts.isPropertyAccessExpression(tsNode))
    return (
      tsNode.name.getText(sourceFile) || tsNode.name.escapedText.toString()
    );
  if (ts.isIdentifier(tsNode)) return tsNode.text; // General identifier

  // --- Expressions ---
  if (ts.isCallExpression(tsNode)) {
    const expressionText =
      tsNode.expression.getText(sourceFile)?.split("\n")[0] || "";
    return expressionText.length > 50
      ? expressionText.substring(0, 47) + "..."
      : expressionText ||
          ts.SyntaxKind[tsNode.expression.kind] ||
          "CallExpression";
  }

  // --- Imports ---
  if (ts.isImportDeclaration(tsNode)) {
    const moduleSpecifier = tsNode.moduleSpecifier;
    let rawImportPath: string | undefined = undefined;
    if (ts.isStringLiteral(moduleSpecifier)) {
      rawImportPath = moduleSpecifier.text;
    } else {
      const text = moduleSpecifier.getText(sourceFile)?.trim();
      if (text) {
        if (
          (text.startsWith("'") && text.endsWith("'")) ||
          (text.startsWith('"') && text.endsWith('"'))
        ) {
          rawImportPath = text.substring(1, text.length - 1);
        } else {
          rawImportPath = text;
        }
      }
    }
    if (rawImportPath) {
      return path.basename(rawImportPath);
    }
    return "Import"; // Fallback
  }

  // --- JSX ---
  if (ts.isJsxElement(tsNode)) {
    const tagNameNode = tsNode.openingElement.tagName;
    let tagNameString = tagNameNode.getText(sourceFile);
    if (tagNameString === "" && ts.isIdentifier(tagNameNode))
      tagNameString = tagNameNode.text;
    return tagNameString ? `<${tagNameString}>` : "<JSXElement>";
  }
  if (ts.isJsxSelfClosingElement(tsNode)) {
    const tagNameNode = tsNode.tagName;
    let tagNameString = tagNameNode.getText(sourceFile);
    if (tagNameString === "" && ts.isIdentifier(tagNameNode))
      tagNameString = tagNameNode.text;
    return tagNameString ? `<${tagNameString}>` : "<JSXElement>";
  }
  if (ts.isJsxFragment(tsNode)) return " "; // Results in < >

  // --- Return Statements ---
  if (ts.isReturnStatement(tsNode)) {
    const exprText = tsNode.expression?.getText(sourceFile) || "";
    const truncatedExpr = exprText.substring(0, 30);
    return exprText
      ? `return ${truncatedExpr}${exprText.length > 30 ? "..." : ""}`
      : "return";
  }

  // --- Assignment Expressions ---
  if (
    ts.isBinaryExpression(tsNode) &&
    isAssignmentOperatorKind(tsNode.operatorToken.kind)
  ) {
    const leftText = tsNode.left.getText(sourceFile);
    const operatorText = tsNode.operatorToken.getText(sourceFile);
    const rightText = tsNode.right.getText(sourceFile);

    return `${leftText} ${operatorText} ${rightText}`;
  }

  // --- Type Nodes ---
  if (ts.isInterfaceDeclaration(tsNode) && tsNode.name) return tsNode.name.text;
  if (ts.isTypeAliasDeclaration(tsNode) && tsNode.name) return tsNode.name.text;

  // Fallback: If this is a ControlFlow node not handled by specific cases above, return its kind.
  // Or an empty string if that's preferred to avoid overly generic labels like "IfStatement" for already handled structures.
  // The mapKindToCategory check might be redundant if all control flow is handled above.
  // if (mapKindToCategory(tsNode, sourceFile) === NodeCategory.ControlFlow) {
  //   return ts.SyntaxKind[tsNode.kind] || "ControlFlow"; // Or ""
  // }

  // General Fallback
  return ts.SyntaxKind[tsNode.kind] || "UnknownNode";
}

function collectMeta(
  node: ts.Node,
  category: NodeCategory,
  sourceFile?: ts.SourceFile
): Record<string, any> | undefined {
  if (category === NodeCategory.ReactHook && ts.isCallExpression(node)) {
    const expression = ts.isPropertyAccessExpression(node.expression)
      ? node.expression.name
      : node.expression;
    return { hookName: expression.getText(sourceFile) };
  }
  if (category === NodeCategory.ReactComponent && ts.isFunctionLike(node)) {
    return {
      props: node.parameters?.map((p) => p.name.getText(sourceFile)) ?? [],
    };
  }
  if (category === NodeCategory.Variable && ts.isVariableDeclaration(node)) {
    return {
      initializer: node.initializer
        ? node.initializer.getText(sourceFile)
        : undefined,
    };
  }
  return undefined;
}

function lineColOfPos(sourceFile: ts.SourceFile, pos: number): Position {
  const lc = sourceFile.getLineAndCharacterOfPosition(pos);
  return { line: lc.line + 1, column: lc.character }; // TS is 0-indexed for line
}

export function buildScopeTree(
  filePath: string,
  fileText: string = fs.readFileSync(filePath, "utf8"),
  options?: BuildScopeTreeOptions
): ScopeNode {
  console.log("####### buildScopeTree EXECUTING - VERSION X #######", filePath); // Add a version number

  const fileExtension = path.extname(filePath).toLowerCase();

  if (fileExtension === ".md" || fileExtension === ".mdx") {
    // TODO: add options back in
    return buildScopeTreeForMarkdown(filePath, fileText);
  } else {
    return buildScopeTreeTs(filePath, fileText, options);
  }
}

export function buildScopeTreeTs(
  filePath: string,
  fileText: string = fs.readFileSync(filePath, "utf8"),
  options?: BuildScopeTreeOptions
): ScopeNode {
  console.log("####### buildScopeTree EXECUTING - VERSION X #######", filePath); // Add a version number
  const mergedOptions: Required<BuildScopeTreeOptions> = {
    ...defaultBuildOptions,
    ...(options || {}),
  };

  const sourceFile = ts.createSourceFile(
    path.basename(filePath), // Use basename for the source file name in AST
    fileText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX // Assume TSX, adjust if needed
  );

  const rootLocEnd = lineColOfPos(sourceFile, fileText.length);
  const root: ScopeNode = {
    id: filePath, // Use full path for root ID for uniqueness
    kind: sourceFile.kind,
    category: NodeCategory.Program,
    label: "", // Initialize and let determineNodeLabel set it
    loc: {
      start: { line: 1, column: 0 },
      end: rootLocEnd,
    },
    source: fileText,
    value: 1, // Changed from fileText.length
    children: [],
  };
  root.label = determineNodeLabel(root, sourceFile); // Set root label
  root.label = formatScopeNodeLabel(root); // Format the label

  function walk(node: ts.Node, parentNodeInTree: ScopeNode, sf: ts.SourceFile) {
    // --- START: Special handling for IfStatement chains ---
    if (ts.isIfStatement(node)) {
      const conditionalBlockStartPos = node.getStart(sf);

      let lastKnownStatementInChain: ts.Node = node.thenStatement;
      let currentChainLink: ts.IfStatement | undefined = node;
      while (currentChainLink) {
        const thenStatementForCurrentLink = currentChainLink.thenStatement;
        if (thenStatementForCurrentLink) {
          lastKnownStatementInChain = thenStatementForCurrentLink;
        }

        if (currentChainLink.elseStatement) {
          lastKnownStatementInChain = currentChainLink.elseStatement;
          if (ts.isIfStatement(currentChainLink.elseStatement)) {
            currentChainLink = currentChainLink.elseStatement;
            if (currentChainLink.thenStatement) {
              lastKnownStatementInChain = currentChainLink.thenStatement;
            }
          } else {
            currentChainLink = undefined;
          }
        } else {
          currentChainLink = undefined;
        }
      }
      const conditionalBlockEndPos = lastKnownStatementInChain.getEnd();

      const conditionalBlockId = `${filePath}:${conditionalBlockStartPos}-${conditionalBlockEndPos}`;
      const conditionalBlockNode: ScopeNode = {
        id: conditionalBlockId,
        kind: ts.SyntaxKind.Unknown,
        category: NodeCategory.ConditionalBlock,
        label: "", // Placeholder, will be updated after children by determineNodeLabel
        loc: {
          start: lineColOfPos(sf, conditionalBlockStartPos),
          end: lineColOfPos(sf, conditionalBlockEndPos),
        },
        source: fileText.substring(
          conditionalBlockStartPos,
          conditionalBlockEndPos
        ),
        value: 1,
        children: [],
        meta: {},
      };

      let currentIfStmtNode: ts.IfStatement | undefined = node;
      let clauseCategory = NodeCategory.IfClause; // Initial category for the first clause

      while (currentIfStmtNode) {
        const conditionText = currentIfStmtNode.expression.getText(sf);
        const thenStatement = currentIfStmtNode.thenStatement;

        const clauseStartPos = currentIfStmtNode.getStart(sf);
        const clauseEndPos = thenStatement.getEnd();
        const clauseNodeId = `${filePath}:${clauseStartPos}-${clauseEndPos}`;

        // Determine label for IfClause and ElseIfClause here based on their condition
        let clauseLabelText = "";
        if (clauseCategory === NodeCategory.IfClause) {
          clauseLabelText = `if (${conditionText})`;
        } else if (clauseCategory === NodeCategory.ElseIfClause) {
          clauseLabelText = `else if (${conditionText})`;
        }
        // ElseClause label is handled separately below or by determineNodeLabel for the 'else' keyword

        const clauseNode: ScopeNode = {
          id: clauseNodeId,
          kind: currentIfStmtNode.kind,
          category: clauseCategory,
          label: clauseLabelText, // Set specific label for if/else if clause
          loc: {
            start: lineColOfPos(sf, clauseStartPos),
            end: lineColOfPos(sf, clauseEndPos),
          },
          source: fileText.substring(clauseStartPos, clauseEndPos),
          value: 1,
          children: [],
          meta: { condition: conditionText },
        };
        conditionalBlockNode.children.push(clauseNode);

        walk(thenStatement, clauseNode, sf);

        const elseStatement: ts.Statement | undefined =
          currentIfStmtNode.elseStatement;
        if (elseStatement) {
          if (ts.isIfStatement(elseStatement)) {
            currentIfStmtNode = elseStatement;
            clauseCategory = NodeCategory.ElseIfClause; // Update category for the next iteration
          } else {
            const elseNodeStartPos = elseStatement.getStart(sf);
            const elseNodeEndPos = elseStatement.getEnd();
            const elseNodeId = `${filePath}:${elseNodeStartPos}-${elseNodeEndPos}`;
            const elseClauseNode: ScopeNode = {
              id: elseNodeId,
              kind: elseStatement.kind,
              category: NodeCategory.ElseClause,
              label: "else", // Directly set "else" label
              loc: {
                start: lineColOfPos(sf, elseNodeStartPos),
                end: lineColOfPos(sf, elseNodeEndPos),
              },
              source: fileText.substring(elseNodeStartPos, elseNodeEndPos),
              value: 1,
              children: [],
              meta: {},
            };
            conditionalBlockNode.children.push(elseClauseNode);
            walk(elseStatement, elseClauseNode, sf);
            currentIfStmtNode = undefined;
          }
        } else {
          currentIfStmtNode = undefined;
        }
      }

      // Update ConditionalBlock label based on its children using determineNodeLabel
      conditionalBlockNode.label = determineNodeLabel(
        conditionalBlockNode,
        sf,
        conditionalBlockNode.children
      );
      conditionalBlockNode.label = formatScopeNodeLabel(conditionalBlockNode);

      if (
        conditionalBlockNode.children.length === 1 &&
        conditionalBlockNode.children[0] &&
        conditionalBlockNode.children[0].category === NodeCategory.IfClause
      ) {
        parentNodeInTree.children.push(conditionalBlockNode.children[0]);
      } else {
        parentNodeInTree.children.push(conditionalBlockNode);
      }

      return;
    }
    // --- END: Special handling for IfStatement chains ---

    // --- START: Special handling for TryStatement ---
    if (ts.isTryStatement(node)) {
      const startPos = node.getStart(sf, false);
      const endPos = node.getEnd();
      const category = NodeCategory.ControlFlow;

      const tryNode: ScopeNode = {
        id: `${filePath}:${startPos}-${endPos}`,
        kind: node.kind,
        category: category,
        label: determineNodeLabel(node, sf), // Use central labeler
        loc: {
          start: lineColOfPos(sf, startPos),
          end: lineColOfPos(sf, endPos),
        },
        source: fileText.substring(startPos, endPos),
        value: 1,
        meta: collectMeta(node, category, sf),
        children: [],
      };
      parentNodeInTree.children.push(tryNode);

      if (node.tryBlock) {
        node.tryBlock.statements.forEach((statement) =>
          walk(statement, tryNode, sf)
        );
      }

      if (node.catchClause) {
        walk(node.catchClause, tryNode, sf);
      }

      if (node.finallyBlock) {
        const finallyBlock = node.finallyBlock;
        const finallyStartPos = finallyBlock.getStart(sf);
        const finallyEndPos = finallyBlock.getEnd();
        const finallyNodeId = `${filePath}:${finallyStartPos}-${finallyEndPos}`;

        const finallyScopeNode: ScopeNode = {
          id: finallyNodeId,
          kind: finallyBlock.kind,
          category: NodeCategory.Block, // Could be a more specific FinallyBlockCategory
          label: "finally", // Specific label for finally block
          loc: {
            start: lineColOfPos(sf, finallyStartPos),
            end: lineColOfPos(sf, finallyEndPos),
          },
          source: fileText.substring(finallyStartPos, finallyEndPos),
          value: 1,
          children: [],
        };
        // ensure label for finallyScopeNode is set via determineNodeLabel if it has its own entry
        // or confirm "finally" is the desired final string. For now, it's hardcoded.
        // If using determineNodeLabel:
        // finallyScopeNode.label = determineNodeLabel(finallyScopeNode, sf);
        // This would require determineNodeLabel to recognize a 'finally' ScopeNode.
        // Simpler to keep "finally" hardcoded here or ensure determineNodeLabel handles it if passed the ts.Block of finally.
        // The current determineNodeLabel for ScopeNode with category Block and label "finally" will return "finally".
        finallyScopeNode.label = formatScopeNodeLabel(finallyScopeNode); // Format label

        tryNode.children.push(finallyScopeNode);
        finallyBlock.statements.forEach((statement) =>
          walk(statement, finallyScopeNode, sf)
        );
      }
      tryNode.label = formatScopeNodeLabel(tryNode); // Format label
      return;
    }
    // --- END: Special handling for TryStatement ---

    // --- START: Special handling for ForStatement, ForOfStatement, ForInStatement ---
    if (
      ts.isForStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isForInStatement(node)
    ) {
      const startPos = node.getStart(sf, false);
      const endPos = node.getEnd();
      const category = NodeCategory.ControlFlow;

      const loopNode: ScopeNode = {
        id: `${filePath}:${startPos}-${endPos}`,
        kind: node.kind,
        category: category,
        label: determineNodeLabel(node, sf), // Use central labeler
        loc: {
          start: lineColOfPos(sf, startPos),
          end: lineColOfPos(sf, endPos),
        },
        source: fileText.substring(startPos, endPos),
        value: 1,
        meta: collectMeta(node, category, sf),
        children: [],
      };
      parentNodeInTree.children.push(loopNode);

      const statement = node.statement;
      if (ts.isBlock(statement)) {
        statement.statements.forEach((childStmt) =>
          walk(childStmt, loopNode, sf)
        );
      } else {
        walk(statement, loopNode, sf);
      }
      loopNode.label = formatScopeNodeLabel(loopNode); // Format label
      return;
    }
    // --- END: Special handling for ForStatement, ForOfStatement, ForInStatement ---

    let currentContainer = parentNodeInTree;
    const category = mapKindToCategory(node, sf);

    if (
      isScopeBoundary(node) ||
      category === NodeCategory.Variable ||
      category === NodeCategory.ReactHook ||
      category === NodeCategory.Call ||
      category === NodeCategory.JSX ||
      category === NodeCategory.JSXElementDOM ||
      category === NodeCategory.JSXElementCustom ||
      category === NodeCategory.Import ||
      category === NodeCategory.TypeAlias ||
      category === NodeCategory.Interface ||
      category === NodeCategory.ReturnStatement ||
      category === NodeCategory.Assignment ||
      (category === NodeCategory.ControlFlow &&
        !ts.isIfStatement(node) &&
        !ts.isTryStatement(node) &&
        !ts.isForStatement(node) &&
        !ts.isForOfStatement(node) &&
        !ts.isForInStatement(node) &&
        !ts.isCatchClause(node))
    ) {
      if (ts.isCatchClause(node)) {
        const startPos = node.getStart(sf, false);
        const endPos = node.getEnd();
        if (endPos === startPos) {
          ts.forEachChild(node, (child) => walk(child, currentContainer, sf));
          return;
        }
        const startLoc = lineColOfPos(sf, startPos);
        const endLoc = lineColOfPos(sf, endPos);
        const nodeSourceText = fileText.substring(startPos, endPos);
        const nodeId = `${filePath}:${startPos}-${endPos}`;
        const newNode: ScopeNode = {
          id: nodeId,
          kind: node.kind,
          category: category, // This is NodeCategory.ControlFlow for CatchClause
          label: determineNodeLabel(node, sf), // Use central labeler (will return "catch")
          loc: { start: startLoc, end: endLoc },
          source: nodeSourceText,
          value: 1,
          meta: collectMeta(node, category, sf),
          children: [],
        };
        if (node.block) {
          node.block.statements.forEach((stmt) => walk(stmt, newNode, sf));
        }
        newNode.label = formatScopeNodeLabel(newNode);
        parentNodeInTree.children.push(newNode);
        return;
      }
      const startPos = node.getStart(sf, false);
      const endPos = node.getEnd();

      if (endPos === startPos) {
        ts.forEachChild(node, (child) => walk(child, currentContainer, sf));
        return;
      }

      const startLoc = lineColOfPos(sf, startPos);
      const endLoc = lineColOfPos(sf, endPos);

      const nodeSourceText = fileText.substring(startPos, endPos);
      const nodeId = `${filePath}:${startPos}-${endPos}`;

      const newNode: ScopeNode = {
        id: nodeId,
        kind: node.kind,
        category: category,
        label: determineNodeLabel(node, sf), // Use central labeler
        loc: { start: startLoc, end: endLoc },
        source: nodeSourceText,
        value: 1,
        meta: collectMeta(node, category, sf),
        children: [],
      };

      newNode.label = formatScopeNodeLabel(newNode);
      parentNodeInTree.children.push(newNode);
      currentContainer = newNode;
    }

    ts.forEachChild(node, (child) => walk(child, currentContainer, sf));
  }

  ts.forEachChild(sourceFile, (child) => walk(child, root, sourceFile));

  let processedTree = root;

  processedTree = filterNodesByOptions(processedTree, mergedOptions);

  if (mergedOptions.flattenTree) {
    processedTree = flattenTree(processedTree, mergedOptions);
  }
  if (mergedOptions.createSyntheticGroups) {
    // Pass the sourceFile to createSyntheticGroups if determineNodeLabel might need it for labels of synthetic groups,
    // though currently synthetic group labels are hardcoded ("Imports", "Type defs").
    // If determineNodeLabel is enhanced for synthetic groups needing sourceFile context, this would be relevant.
    processedTree = createSyntheticGroups(processedTree, true, sourceFile);
  }

  return processedTree;
}

// Example Usage (for testing - remove or comment out in production extension code):
// if (require.main === module) {
//   const exampleFilePath = path.join(__dirname, '../../src/__tests__/__fixtures__/controlFlows.ts'); // Adjust path as needed
//   if (fs.existsSync(exampleFilePath)) {
//     const tree = buildScopeTree(exampleFilePath);
//     fs.writeFileSync(path.join(__dirname, 'scopeTreeOutput_controlFlows.json'), JSON.stringify(tree, null, 2));
//     console.log('Scope tree generated to scopeTreeOutput_controlFlows.json');
//   } else {
//     console.error('Example file not found:', exampleFilePath);
//   }
// }

// --- START: Node Flattening and Grouping Logic ---
function flattenTree(
  rootNode: ScopeNode,
  options: Required<BuildScopeTreeOptions>
): ScopeNode {
  // Deep clone the root to avoid modifying the original
  // A proper deep clone might be needed if ScopeNode has complex nested objects not handled by spread
  const result = {
    ...rootNode,
    // Ensure children array exists before mapping, and clone children
    children: (rootNode.children || []).map((child) => ({ ...child })),
  };

  // Process each child recursively
  result.children = result.children.map((child) => flattenNode(child, options)); // Pass a copy to flattenNode

  return result;
}

function flattenNode(
  node: ScopeNode,
  options: Required<BuildScopeTreeOptions>
): ScopeNode {
  // Recursively process the children of the current node first.
  let processedChildren = (node.children || []).map(
    (
      child // Use 'let' to allow reassignment
    ) => flattenNode({ ...child }, options) // Creates a copy of child for processing
  );

  // New logic: If the current node `node` has exactly one processed child,
  // and that child is a Block, then "hoist" the Block's children to become direct children of `node`.
  // This is controlled by the flattenBlocks option.
  if (
    options.flattenBlocks &&
    processedChildren.length === 1 &&
    processedChildren[0] && // Ensure the child exists
    processedChildren[0].category === NodeCategory.Block
  ) {
    // The new children for the current `node` are the children of its single Block child.
    // Ensure the Block's children array exists, defaulting to an empty array if not.
    processedChildren = processedChildren[0].children || [];
  }

  // Now, apply existing collapse logic for the current `node` itself,
  // using the potentially modified list of its children (`processedChildren`).
  if (shouldCollapseBlock(node, processedChildren, options)) {
    return collapseBlockNode({ ...node }, processedChildren); // Options not passed to collapse*Node directly
  }

  if (shouldCollapseArrowFunction(node, processedChildren, options)) {
    return collapseArrowFunction({ ...node }, processedChildren); // Options not passed to collapse*Node directly
  }

  return { ...node, children: processedChildren };
}

function shouldCollapseBlock(
  node: ScopeNode,
  children: ScopeNode[],
  options: Required<BuildScopeTreeOptions>
): boolean {
  if (!options.flattenBlocks) {
    return false;
  }
  return (
    node.category === NodeCategory.Block &&
    children.every(
      (child) =>
        child.category === NodeCategory.Variable ||
        child.kind === ts.SyntaxKind.ReturnStatement
    ) &&
    children.filter((child) => child.kind === ts.SyntaxKind.ReturnStatement)
      .length <= 1
  );
}

function collapseBlockNode(node: ScopeNode, children: ScopeNode[]): ScopeNode {
  // Removed options from signature
  return {
    ...node,
    children,
    meta: {
      ...(node.meta || {}),
      collapsed: "block",
      originalCategory: node.category,
    },
  };
}

function shouldCollapseArrowFunction(
  node: ScopeNode,
  children: ScopeNode[],
  options: Required<BuildScopeTreeOptions>
): boolean {
  if (!options.flattenArrowFunctions) {
    return false;
  }
  if (node.category !== NodeCategory.ArrowFunction) return false;

  // If the arrow function's direct body resulted in no significant children ScopeNodes (e.g. direct expression `() => x`)
  if (children.length === 0) return true;

  // If it has one child, and that child is a simple block (e.g. `() => { /* simple stuff */ }`)
  // Safely access children[0] and its children property
  if (children.length === 1 && children[0]?.category === NodeCategory.Block) {
    // Consider the block's children (statements within the arrow function block)
    const blockChildren = children[0]?.children || [];
    return blockChildren.length <= 3; // As per plan: ≤ 3 statements in the block
  }

  // Otherwise, if children are directly from a more complex body (not a single block that was processed)
  // This case might be less common if ArrowFunction's body is always a Block or an expression.
  // For now, stick to the plan's spirit: simple body implies few statements.
  return children.length <= 1; // Heuristic: few direct structural children means simple.
}

function collapseArrowFunction(
  node: ScopeNode,
  children: ScopeNode[]
  // options: Required<BuildScopeTreeOptions> // Options removed from signature
): ScopeNode {
  let callNodeLabel: string | undefined = undefined;

  function findCallLabelRecursive(nodes: ScopeNode[]): string | undefined {
    for (const child of nodes) {
      if (child.category === NodeCategory.Call) {
        return child.label;
      }
      if (child.children && child.children.length > 0) {
        const found = findCallLabelRecursive(child.children);
        if (found) return found;
      }
    }
    return undefined;
  }

  callNodeLabel = findCallLabelRecursive(children);

  return {
    ...node,
    // Children are kept, but visualizer might hide them or represent the node differently.
    children,
    meta: {
      ...(node.meta || {}),
      collapsed: "arrowFunction",
      originalCategory: node.category,
      call: callNodeLabel, // Store the label of the found call
    },
  };
}

// Helper function to create a synthetic group
function createActualSyntheticGroup(
  groupNodes: ScopeNode[],
  groupName: string, // This is the label
  parentId: string
): ScopeNode | null {
  if (groupNodes.length <= 1) return null;

  const firstNode = groupNodes[0];
  if (!firstNode) return null;

  const groupValue = 1;
  const groupId = `synthetic:${parentId}:${groupName}:${firstNode.id}`;
  const firstNodeLoc = firstNode.loc;
  const combinedSource = groupNodes.map((node) => node.source).join("\n\n");

  return {
    id: groupId,
    category: NodeCategory.SyntheticGroup,
    label: groupName, // Uses the passed groupName directly as the label
    kind: ts.SyntaxKind.Unknown,
    value: groupValue,
    loc: firstNodeLoc,
    source: combinedSource,
    children: groupNodes,
    meta: {
      syntheticGroup: true,
      contains: groupNodes.length,
      originalNodesCategories: groupNodes.map((n) => n.category),
    },
  };
}

function createSyntheticGroups(
  rootNode: ScopeNode,
  isTopLevelCall: boolean = false,
  sourceFile?: ts.SourceFile // Optional sourceFile if needed by labeler for synthetic nodes
): ScopeNode {
  const initialChildrenToProcess = rootNode.children
    ? rootNode.children.map((c) => ({ ...c }))
    : [];

  const result = {
    ...rootNode,
    children: initialChildrenToProcess,
  };

  if (result.children.length > 0) {
    const childrenAfterRecursiveCall = result.children.map(
      (child) => createSyntheticGroups(child, false, sourceFile) // Pass sf down
    );
    result.children = groupRelatedNodes(
      childrenAfterRecursiveCall,
      result.id,
      isTopLevelCall
      // No need to pass sourceFile to groupRelatedNodes if its synthetic groups get labels directly
    );
  }
  return result;
}

function groupRelatedNodes(
  nodes: ScopeNode[],
  parentId: string,
  isTopLevel: boolean
): ScopeNode[] {
  const collectedGroups: {
    Imports: ScopeNode[];
    "Type defs": ScopeNode[];
    // Hooks: ScopeNode[]; // Removed "Hooks" group
  } = {
    Imports: [],
    "Type defs": [],
    // Hooks: [], // Removed "Hooks" group
  };
  const remainingNodes: ScopeNode[] = [];

  for (const node of nodes) {
    let assignedToGroup = false;
    if (isTopLevel) {
      if (node.category === NodeCategory.Import) {
        collectedGroups["Imports"].push(node);
        assignedToGroup = true;
      } else if (
        node.category === NodeCategory.TypeAlias ||
        node.category === NodeCategory.Interface
      ) {
        if (!assignedToGroup) {
          // Should be redundant if Import/Type/Interface are mutually exclusive categories
          collectedGroups["Type defs"].push(node);
          assignedToGroup = true;
        }
      }
    }

    if (!assignedToGroup) {
      const label = node.label;
      let isHookLike = false;
      if (node.category === NodeCategory.ReactHook) {
        isHookLike = true;
      } else if (
        node.category === NodeCategory.Call &&
        typeof label === "string" &&
        label.startsWith("use") &&
        label.length > 3
      ) {
        const charAtIndex3 = label[3]; // Access character
        if (typeof charAtIndex3 === "string" && /[A-Z]/.test(charAtIndex3)) {
          // Check if char is string and test
          isHookLike = true;
        }
      }

      if (isHookLike) {
        // Instead of adding to a "Hooks" group, add directly to remainingNodes later
        // collectedGroups["Hooks"].push(node);
        // assignedToGroup = true;
        // No longer assigning to a group, so these lines are effectively replaced by pushing to remainingNodes later
      }
    }

    if (!assignedToGroup) {
      remainingNodes.push(node);
    }
  }

  const finalResultNodes: ScopeNode[] = [];
  // Now groupOrder keys will correctly map to ScopeNode[] types in collectedGroups
  const groupOrder: Array<keyof typeof collectedGroups> = [
    "Imports",
    "Type defs",
    // "Hooks", // Removed "Hooks" from groupOrder
  ];

  for (const groupName of groupOrder) {
    const groupNodes = collectedGroups[groupName]; // groupNodes is now ScopeNode[]
    if (groupNodes.length > 0) {
      const syntheticGroup = createActualSyntheticGroup(
        groupNodes,
        groupName,
        parentId
      );
      if (syntheticGroup) {
        finalResultNodes.push(syntheticGroup);
      } else {
        // If group creation failed (e.g. <=1 node), add original nodes back.
        // These nodes would have already had their labels formatted.
        remainingNodes.push(...groupNodes); // groupNodes is ScopeNode[], spreadable
      }
    }
  }

  finalResultNodes.push(...remainingNodes);
  return finalResultNodes;
}

// --- END: Node Flattening and Grouping Logic ---

// --- START: Node Filtering Logic ---
function filterNodesByOptionsRecursive(
  node: ScopeNode,
  options: Required<BuildScopeTreeOptions>
): ScopeNode | null {
  // First, filter children recursively
  if (node.children && node.children.length > 0) {
    node.children = node.children
      .map((child: ScopeNode) =>
        filterNodesByOptionsRecursive({ ...child }, options)
      ) // Process cloned children, child is ScopeNode
      .filter((child: ScopeNode | null) => child !== null) as ScopeNode[]; // child is ScopeNode | null before filter
  }

  // Then, decide if the current node itself should be filtered out
  if (!options.includeImports && node.category === NodeCategory.Import) {
    return null;
  }
  if (
    !options.includeTypes &&
    (node.category === NodeCategory.TypeAlias ||
      node.category === NodeCategory.Interface)
  ) {
    return null;
  }
  if (!options.includeLiterals && node.category === NodeCategory.Literal) {
    return null;
  }

  return node;
}

function filterNodesByOptions(
  rootNode: ScopeNode,
  options: Required<BuildScopeTreeOptions>
): ScopeNode {
  const clonedRoot = JSON.parse(JSON.stringify(rootNode)); // Simple deep clone for safety

  if (clonedRoot.children && clonedRoot.children.length > 0) {
    clonedRoot.children = clonedRoot.children
      .map((child: ScopeNode) =>
        filterNodesByOptionsRecursive({ ...child }, options)
      ) // child is ScopeNode
      .filter((child: ScopeNode | null) => child !== null) as ScopeNode[]; // child is ScopeNode | null
  }
  return clonedRoot;
}
