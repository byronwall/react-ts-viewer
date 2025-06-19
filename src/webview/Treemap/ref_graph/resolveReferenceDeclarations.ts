import * as ts from "typescript";
import type { ScopeNode } from "../../../types";
import type { SemanticReference } from "./buildSemanticReferenceGraph";
import {
  createSourceFile,
  getLineAndCharacter,
  extractDestructuredNames,
} from "./ts_ast";

/**
 * Information about a declaration corresponding to a {@link SemanticReference}.
 */
export interface ReferenceDeclarationInfo {
  /** Kind of declaration node that introduced the identifier */
  kind:
    | "import"
    | "variable"
    | "destructuring"
    | "parameter"
    | "function"
    | "class"
    | "enum"
    | "interface"
    | "type";
  /** Absolute offset (from beginning of file) where the declaration begins */
  offset: number;
  /** 1-based line/character for human consumption (matches other helpers) */
  position: { line: number; character: number };
}

/**
 * Combines an external {@link SemanticReference} with information about the
 * AST node that *declares* the referenced identifier (if resolvable).
 */
export interface ResolvedReferenceDeclaration {
  reference: SemanticReference;
  declaration: ReferenceDeclarationInfo | null;
}

/**
 * Attempts to resolve each external reference to the *closest* AST node that
 * declares the same identifier within the full source file.  Supported
 * declaration constructs include:
 *   • `import` specifiers (default & named)
 *   • variable declarations (`const foo = …`)
 *   • binding patterns in destructuring (`const { foo } = obj`)
 *   • parameters (`function bar(foo) {}` / `(foo) => {}`)
 *   • function / class / enum / interface / type-alias declarations
 *
 * If a declaration cannot be located, the `declaration` field is `null`.
 * The returned array preserves the original ordering and one-to-one length of
 * the provided `references` array.
 */
export function resolveReferenceDeclarations(
  references: SemanticReference[],
  rootNode: ScopeNode
): ResolvedReferenceDeclaration[] {
  // Bail out early if we have no source code to analyse
  if (!rootNode.source || typeof rootNode.source !== "string") {
    console.warn(
      "⚠️ resolveReferenceDeclarations – rootNode lacks source; unable to resolve declaration sites"
    );
    return references.map((r) => ({ reference: r, declaration: null }));
  }

  const sourceFile = createSourceFile(rootNode.source);

  // Build a map from identifier text → declaration info (first match wins)
  const declarations = new Map<
    string,
    { node: ts.Node; kind: ReferenceDeclarationInfo["kind"] }
  >();

  const addDeclaration = (
    name: string,
    node: ts.Node,
    kind: ReferenceDeclarationInfo["kind"]
  ): void => {
    if (!declarations.has(name)) {
      declarations.set(name, { node, kind });
    }
  };

  /**
   * Walk the AST and capture declaration sites.  We keep the *first* occurrence
   * for each identifier which generally corresponds to the tightest/nearest
   * declaration relative to the top of the file (import → variable, etc.).
   */
  const visit = (node: ts.Node): void => {
    // ---- IMPORT DECLARATIONS ----
    if (ts.isImportDeclaration(node) && node.importClause) {
      const { importClause } = node;
      // Default import → import foo from "…";
      if (importClause.name) {
        addDeclaration(importClause.name.text, importClause.name, "import");
      }
      // Named imports → import { foo, bar as baz } from "…";
      if (
        importClause.namedBindings &&
        ts.isNamedImports(importClause.namedBindings)
      ) {
        importClause.namedBindings.elements.forEach((el) => {
          addDeclaration(el.name.text, el.name, "import");
        });
      }
    }
    // ---- VARIABLE DECLARATIONS (including "const", "let", "var") ----
    else if (ts.isVariableDeclaration(node)) {
      if (ts.isIdentifier(node.name)) {
        addDeclaration(node.name.text, node.name, "variable");
      } else {
        // Handle destructuring patterns { foo } / [foo]
        extractDestructuredNames(node.name).forEach((n) => {
          addDeclaration(n, node.name, "destructuring");
        });
      }
    }
    // ---- PARAMETER DECLARATIONS ----
    else if (ts.isParameter(node)) {
      if (ts.isIdentifier(node.name)) {
        addDeclaration(node.name.text, node.name, "parameter");
      } else {
        extractDestructuredNames(node.name).forEach((n) => {
          addDeclaration(n, node.name, "parameter");
        });
      }
    }
    // ---- FUNCTION DECLARATION ----
    else if (ts.isFunctionDeclaration(node) && node.name) {
      addDeclaration(node.name.text, node.name, "function");
    }
    // ---- CLASS DECLARATION ----
    else if (ts.isClassDeclaration(node) && node.name) {
      addDeclaration(node.name.text, node.name, "class");
    }
    // ---- ENUM DECLARATION ----
    else if (ts.isEnumDeclaration(node) && node.name) {
      addDeclaration(node.name.text, node.name, "enum");
    }
    // ---- INTERFACE DECLARATION ----
    else if (ts.isInterfaceDeclaration(node) && node.name) {
      addDeclaration(node.name.text, node.name, "interface");
    }
    // ---- TYPE ALIAS DECLARATION ----
    else if (ts.isTypeAliasDeclaration(node) && node.name) {
      addDeclaration(node.name.text, node.name, "type");
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  // Map each reference to its declaration (if found)
  return references.map((ref) => {
    const decl = declarations.get(ref.name);
    if (!decl) {
      return {
        reference: ref,
        declaration: null,
      };
    }

    const offset = decl.node.getStart(sourceFile);
    const position = getLineAndCharacter(sourceFile, offset);

    return {
      reference: ref,
      declaration: {
        kind: decl.kind,
        offset,
        position,
      },
    };
  });
}
