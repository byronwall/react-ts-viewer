import * as ts from "typescript";
import type { ScopeNode } from "../../../types";

/** Returns true if the provided ScopeNode's source actually CONTAINS a real
 *  declaration (parameter, variable, function, import, class, enum, etc.) for
 *  the identifier.
 */
export function nodeDeclaresIdentifier(
  node: ScopeNode,
  ident: string
): boolean {
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
} // NEW: Cache declaration look-ups per node to avoid repeated AST parsing

const declarationCache: Map<
  string /*nodeId*/,
  Map<string /*ident*/, boolean>
> = new Map(); // Helper function to create TypeScript source file from code

export function createSourceFile(
  source: string,
  fileName = "temp.tsx"
): ts.SourceFile {
  // NOTE: We intentionally use `TSX` here because it is a superset of `TS`.
  // This allows us to safely parse regular TypeScript *and* any JSX fragments
  // that may appear inside a Block-Of-Interest (BOI) – for example when the
  // BOI is a JSX element like `<main>` or `<div>`. Using `TS` would cause the
  // parser to emit diagnostics or even fail when encountering raw JSX.
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
} // Extract names from destructuring patterns

export function extractDestructuredNames(
  bindingName: ts.BindingName
): string[] {
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
} // NEW: Helper – detect identifiers that originate from *plain JSX text* rather
// (e.g. the words "Request" "Admin" "Access" inside a <h2>).  Such tokens are
// *not* genuine variable references and should therefore be ignored.

export function isIdentifierInsideJsxText(identifier: ts.Identifier): boolean {
  let current: ts.Node | undefined = identifier.parent;

  // Traverse upwards until we either hit a JsxText (meaning the identifier is
  // embedded in raw text) or some JSX container/expression that proves it
  // lives inside `{}` interpolation (which we *do* want).
  while (current) {
    if (ts.isJsxText(current)) {
      return true; // inside raw text – skip
    }

    // If we encounter a JsxExpression, we know we are inside `{ ... }` and
    // should *not* skip.
    if (ts.isJsxExpression(current)) {
      return false;
    }

    // Stop climbing once we exit JSX context entirely
    if (
      ts.isSourceFile(current) ||
      ts.isFunctionLike(current) ||
      ts.isBlock(current)
    ) {
      break;
    }

    current = current.parent;
  }

  return false;
} // Helper function to check if an identifier is part of a declaration

export function isPartOfDeclaration(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  return (
    ts.isVariableDeclaration(parent) ||
    ts.isFunctionDeclaration(parent) ||
    ts.isParameter(parent) ||
    ts.isPropertySignature(parent) ||
    ts.isMethodSignature(parent) ||
    ts.isBindingElement(parent)
  );
} // Helper function to check if a name is a keyword

export function isKeyword(name: string): boolean {
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
} // INSERT: Add a helper that tells us whether an identifier occurs only in a type position

export function isIdentifierTypePosition(identifier: ts.Identifier): boolean {
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
} // Returns true if the identifier is part of the *name* of a JSX attribute
// (e.g. the segments "data", "time", "block" in `data-time-block`).
// We climb ancestors until we either find a JsxAttribute or exit JSX context.
export function isIdentifierPartOfJsxAttributeName(
  identifier: ts.Identifier
): boolean {
  let current: ts.Node | undefined = identifier;
  while (current) {
    if (ts.isJsxAttribute(current)) return true;

    if (
      ts.isJsxExpression(current) ||
      ts.isSourceFile(current) ||
      ts.isBlock(current) ||
      ts.isFunctionLike(current)
    ) {
      return false; // left JSX – not an attribute name
    }

    current = current.parent;
  }
  return false;
}

// Determines whether an identifier represents the tag *name* of a JSX element
// (opening, closing, or self-closing) **and** is all lowercase – i.e. the tag
// is an intrinsic/built-in HTML element such as <div>, <span>, etc.
export function isIntrinsicJsxElementName(identifier: ts.Identifier): boolean {
  // Ascend until we find the element node that owns this identifier, stopping
  // if we leave JSX context.
  let current: ts.Node | undefined = identifier.parent;
  while (current) {
    if (
      ts.isJsxOpeningElement(current) ||
      ts.isJsxClosingElement(current) ||
      ts.isJsxSelfClosingElement(current)
    ) {
      const first = identifier.text.charAt(0);
      return first === first.toLowerCase();
    }

    if (
      ts.isSourceFile(current) ||
      ts.isBlock(current) ||
      ts.isFunctionLike(current)
    ) {
      break; // left JSX context
    }

    current = current.parent;
  }
  return false;
}

// NOTE: isJSXComponentName previously served as a blanket skip-condition for
// *all* JSX tag names.  It remains useful elsewhere, but semantic-reference
// extraction should now call `isIntrinsicJsxElementName` to decide whether to
// ignore a tag name.
export function isJSXComponentName(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  return (
    ts.isJsxOpeningElement(parent) ||
    ts.isJsxClosingElement(parent) ||
    ts.isJsxSelfClosingElement(parent)
  );
} // Helper function to get line and character from position

export function getLineAndCharacter(
  sourceFile: ts.SourceFile,
  pos: number
): { line: number; character: number } {
  const lineChar = sourceFile.getLineAndCharacterOfPosition(pos);
  return { line: lineChar.line + 1, character: lineChar.character + 1 }; // 1-based
}
