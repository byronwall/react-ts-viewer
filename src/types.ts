export interface Position {
  line: number; // 1-based
  column: number; // 0-based
}

export enum NodeCategory {
  Program = "Program",
  Module = "Module",
  Class = "Class",
  Function = "Function",
  ArrowFunction = "ArrowFunction",
  Block = "Block",
  ControlFlow = "ControlFlow",
  Variable = "Variable",
  Call = "Call",
  ReactComponent = "ReactComponent",
  ReactHook = "ReactHook",
  JSX = "JSX",
  JSXElementDOM = "JSXElementDOM",
  JSXElementCustom = "JSXElementCustom",
  Import = "Import",
  TypeAlias = "TypeAlias",
  Interface = "Interface",
  Literal = "Literal",
  SyntheticGroup = "SyntheticGroup",

  // Add these new categories:
  ConditionalBlock = "ConditionalBlock",
  IfClause = "IfClause",
  ElseIfClause = "ElseIfClause",
  ElseClause = "ElseClause",
  ReturnStatement = "ReturnStatement",
  Assignment = "Assignment",
  Other = "Other", // Ensure 'Other' is still present

  // Markdown specific categories
  MarkdownHeading = "MarkdownHeading",
  MarkdownParagraph = "MarkdownParagraph",
  MarkdownBlockquote = "MarkdownBlockquote",
  MarkdownCodeBlock = "MarkdownCodeBlock",
  MarkdownList = "MarkdownList",
  MarkdownListItem = "MarkdownListItem",
  MarkdownTable = "MarkdownTable",
  MarkdownImage = "MarkdownImage",
  MarkdownThematicBreak = "MarkdownThematicBreak", // for horizontal rules
}

export interface ScopeNode {
  id: string; // `${file}:${start}-${end}`
  kind: number; // raw TypeScript ts.SyntaxKind
  category: NodeCategory; // high-level bucket
  label: string; // human-readable (e.g. function name)
  loc: { start: Position; end: Position };
  source: string; // exact slice of original text
  value: number; // #chars or LOC — used by treemap layout
  meta?: Record<string, any>; // hooks, props, anything extra
  children: ScopeNode[];
}

// Options for buildScopeTree function
export interface BuildScopeTreeOptions {
  flattenTree?: boolean;
  flattenBlocks?: boolean;
  flattenArrowFunctions?: boolean;
  createSyntheticGroups?: boolean;
  includeImports?: boolean;
  includeTypes?: boolean;
  includeLiterals?: boolean;
  includeComments?: boolean;
}

// Add more types as needed for tracing, etc.
