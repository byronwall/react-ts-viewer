import * as fs from "fs";
import * as path from "path";
import {
  BuildScopeTreeOptions,
  ScopeNode,
  NodeCategory,
  Position,
} from "../../types";

// CSS/SCSS specific node categories
export enum CssNodeCategory {
  Variable = "CssVariable",
  Mixin = "CssMixin",
  Function = "CssFunction",
  Selector = "CssSelector",
  Rule = "CssRule",
  AtRule = "CssAtRule",
  MediaQuery = "CssMediaQuery",
  KeyframeRule = "CssKeyframeRule",
  Comment = "CssComment",
  Import = "CssImport",
  Extend = "CssExtend",
  Include = "CssInclude",
  ControlDirective = "CssControlDirective",
  Block = "CssBlock",
  Property = "CssProperty",
}

interface CssToken {
  type: string;
  value: string;
  start: number;
  end: number;
  line: number;
  column: number;
}

interface ParseContext {
  filePath: string;
  fileText: string;
  tokens: CssToken[];
  position: number;
  isScss: boolean;
}

export function buildScopeTreeCss(
  filePath: string,
  fileText: string = fs.readFileSync(filePath, "utf8"),
  options?: BuildScopeTreeOptions
): ScopeNode {
  console.log("####### buildScopeTreeCss EXECUTING #######", filePath);

  const isScss = path.extname(filePath).toLowerCase() === ".scss";

  const context: ParseContext = {
    filePath,
    fileText,
    tokens: tokenize(fileText),
    position: 0,
    isScss,
  };

  const root: ScopeNode = {
    id: filePath,
    kind: 0, // No specific kind for CSS root
    category: NodeCategory.Program,
    label: path.basename(filePath),
    loc: {
      start: { line: 1, column: 0 },
      end: getPositionFromOffset(fileText, fileText.length),
    },
    source: fileText,
    value: 1, // Changed from line count - will be calculated by aggregateValuesPostOrder
    children: [],
  };

  parseStylesheet(context, root);

  // Calculate parent node values as sum of children recursively
  aggregateValuesPostOrder(root);

  return root;
}

// Function to recursively calculate parent node values as sum of their children
function aggregateValuesPostOrder(node: ScopeNode): number {
  if (!node.children || node.children.length === 0) {
    // Leaf node - its value stays as 1
    return node.value;
  }

  // Recursively calculate children values first
  let totalChildrenValue = 0;
  for (const child of node.children) {
    totalChildrenValue += aggregateValuesPostOrder(child);
  }

  // Set parent's value to sum of all children
  node.value = totalChildrenValue;
  return node.value;
}

function tokenize(text: string): CssToken[] {
  const tokens: CssToken[] = [];
  let position = 0;
  let line = 1;
  let column = 0;

  while (position < text.length) {
    const char = text[position];

    // Skip whitespace
    if (char && /\s/.test(char)) {
      if (char === "\n") {
        line++;
        column = 0;
      } else {
        column++;
      }
      position++;
      continue;
    }

    // Comments
    if (char === "/" && text[position + 1] === "*") {
      const start = position;
      const startLine = line;
      const startColumn = column;
      position += 2;
      column += 2;

      while (
        position < text.length - 1 &&
        !(text[position] === "*" && text[position + 1] === "/")
      ) {
        if (text[position] === "\n") {
          line++;
          column = 0;
        } else {
          column++;
        }
        position++;
      }

      if (position < text.length - 1) {
        position += 2;
        column += 2;
      }

      tokens.push({
        type: "comment",
        value: text.substring(start, position),
        start,
        end: position,
        line: startLine,
        column: startColumn,
      });
      continue;
    }

    // SCSS line comments
    if (char === "/" && text[position + 1] === "/") {
      const start = position;
      const startLine = line;
      const startColumn = column;

      while (position < text.length && text[position] !== "\n") {
        position++;
        column++;
      }

      tokens.push({
        type: "comment",
        value: text.substring(start, position),
        start,
        end: position,
        line: startLine,
        column: startColumn,
      });
      continue;
    }

    // Strings
    if (char === '"' || char === "'") {
      const quote = char;
      const start = position;
      const startLine = line;
      const startColumn = column;
      position++;
      column++;

      while (position < text.length && text[position] !== quote) {
        if (text[position] === "\\") {
          position += 2;
          column += 2;
        } else {
          if (text[position] === "\n") {
            line++;
            column = 0;
          } else {
            column++;
          }
          position++;
        }
      }

      if (position < text.length) {
        position++;
        column++;
      }

      tokens.push({
        type: "string",
        value: text.substring(start, position),
        start,
        end: position,
        line: startLine,
        column: startColumn,
      });
      continue;
    }

    // Numbers
    if (char && /\d/.test(char)) {
      const start = position;
      const startLine = line;
      const startColumn = column;

      while (
        position < text.length &&
        text[position] &&
        /[\d.%a-zA-Z]/.test(text[position]!)
      ) {
        position++;
        column++;
      }

      tokens.push({
        type: "number",
        value: text.substring(start, position),
        start,
        end: position,
        line: startLine,
        column: startColumn,
      });
      continue;
    }

    // Identifiers and keywords
    if (
      (char && /[a-zA-Z_$]/.test(char)) ||
      (char === "-" &&
        text[position + 1] &&
        /[a-zA-Z_]/.test(text[position + 1]!))
    ) {
      const start = position;
      const startLine = line;
      const startColumn = column;

      while (
        position < text.length &&
        text[position] &&
        /[a-zA-Z0-9_$-]/.test(text[position]!)
      ) {
        position++;
        column++;
      }

      const value = text.substring(start, position);
      const type = getIdentifierType(value);

      tokens.push({
        type,
        value,
        start,
        end: position,
        line: startLine,
        column: startColumn,
      });
      continue;
    }

    // SCSS variables
    if (char === "$") {
      const start = position;
      const startLine = line;
      const startColumn = column;
      position++;
      column++;

      while (
        position < text.length &&
        text[position] &&
        /[a-zA-Z0-9_-]/.test(text[position]!)
      ) {
        position++;
        column++;
      }

      tokens.push({
        type: "variable",
        value: text.substring(start, position),
        start,
        end: position,
        line: startLine,
        column: startColumn,
      });
      continue;
    }

    // CSS variables (custom properties)
    if (char === "-" && text[position + 1] === "-") {
      const start = position;
      const startLine = line;
      const startColumn = column;
      position += 2;
      column += 2;

      while (
        position < text.length &&
        text[position] &&
        /[a-zA-Z0-9_-]/.test(text[position]!)
      ) {
        position++;
        column++;
      }

      tokens.push({
        type: "css-variable",
        value: text.substring(start, position),
        start,
        end: position,
        line: startLine,
        column: startColumn,
      });
      continue;
    }

    // At-rules
    if (char === "@") {
      const start = position;
      const startLine = line;
      const startColumn = column;
      position++;
      column++;

      while (
        position < text.length &&
        text[position] &&
        /[a-zA-Z0-9_-]/.test(text[position]!)
      ) {
        position++;
        column++;
      }

      const value = text.substring(start, position);

      tokens.push({
        type: "at-rule",
        value,
        start,
        end: position,
        line: startLine,
        column: startColumn,
      });
      continue;
    }

    // Symbols
    const symbolMap: { [key: string]: string } = {
      "{": "lbrace",
      "}": "rbrace",
      "(": "lparen",
      ")": "rparen",
      "[": "lbracket",
      "]": "rbracket",
      ":": "colon",
      ";": "semicolon",
      ",": "comma",
      ".": "dot",
      "#": "hash",
      "&": "ampersand",
      "+": "plus",
      "~": "tilde",
      ">": "gt",
      "*": "asterisk",
      "=": "equals",
      "!": "exclamation",
    };

    if (char && symbolMap[char]) {
      tokens.push({
        type: symbolMap[char],
        value: char,
        start: position,
        end: position + 1,
        line,
        column,
      });
      position++;
      column++;
      continue;
    }

    // Default: single character
    if (char) {
      tokens.push({
        type: "unknown",
        value: char,
        start: position,
        end: position + 1,
        line,
        column,
      });
    }
    position++;
    column++;
  }

  return tokens;
}

function getIdentifierType(value: string): string {
  const cssKeywords = [
    "important",
    "inherit",
    "initial",
    "unset",
    "auto",
    "none",
    "normal",
    "bold",
    "italic",
    "solid",
    "dotted",
    "dashed",
    "absolute",
    "relative",
    "fixed",
    "static",
    "block",
    "inline",
    "flex",
    "grid",
    "center",
    "left",
    "right",
    "top",
    "bottom",
    "hidden",
    "visible",
    "transparent",
  ];

  const scssKeywords = [
    "true",
    "false",
    "null",
    "and",
    "or",
    "not",
    "if",
    "else",
    "for",
    "while",
    "each",
    "in",
    "from",
    "through",
    "to",
  ];

  if (cssKeywords.includes(value) || scssKeywords.includes(value)) {
    return "keyword";
  }

  return "identifier";
}

function parseStylesheet(context: ParseContext, parent: ScopeNode): void {
  while (context.position < context.tokens.length) {
    const token = context.tokens[context.position];

    if (!token) break;

    // Skip stray closing braces
    if (token.type === "rbrace") {
      context.position++;
      continue;
    }

    // Skip comments at top level
    if (token.type === "comment") {
      const commentNode = createCommentNode(context, token);
      parent.children.push(commentNode);
      context.position++;
      continue;
    }

    // SCSS variables
    if (token.type === "variable") {
      const variableNode = parseVariable(context);
      if (variableNode) {
        parent.children.push(variableNode);
      }
      continue;
    }

    // CSS custom properties (variables)
    if (token.type === "css-variable") {
      const variableNode = parseCssVariable(context);
      if (variableNode) {
        parent.children.push(variableNode);
      }
      continue;
    }

    // At-rules
    if (token.type === "at-rule") {
      const atRuleNode = parseAtRule(context);
      if (atRuleNode) {
        parent.children.push(atRuleNode);
      }
      continue;
    }

    // Selectors and rules
    const ruleNode = parseRule(context);
    if (ruleNode) {
      parent.children.push(ruleNode);
    } else {
      context.position++;
    }
  }
}

function parseVariable(context: ParseContext): ScopeNode | null {
  const startToken = context.tokens[context.position];
  if (!startToken || startToken.type !== "variable") return null;

  const variableName = startToken.value;
  context.position++;

  // Skip whitespace and find colon
  skipWhitespace(context);

  const colonToken = context.tokens[context.position];
  if (!colonToken || colonToken.type !== "colon") {
    context.position--;
    return null;
  }
  context.position++;

  // Parse value until semicolon or end
  const valueStart = context.position;
  let value = "";

  while (context.position < context.tokens.length) {
    const token = context.tokens[context.position];
    if (token && token.type === "semicolon") {
      context.position++;
      break;
    }
    if (token) {
      value += token.value;
    }
    context.position++;
  }

  const lastToken = context.tokens[context.position - 1];
  const endPos = lastToken ? lastToken.end : startToken.end;

  return {
    id: `${context.filePath}:${startToken.start}-${endPos}`,
    kind: 0,
    category: CssNodeCategory.Variable as any,
    label: `${variableName}: ${value.trim()}`,
    loc: {
      start: { line: startToken.line, column: startToken.column },
      end: getPositionFromOffset(context.fileText, endPos),
    },
    source: context.fileText.substring(startToken.start, endPos),
    value: 1,
    children: [],
    meta: {
      variableName: variableName,
      variableValue: value.trim(),
    },
  };
}

function parseCssVariable(context: ParseContext): ScopeNode | null {
  const startToken = context.tokens[context.position];
  if (!startToken || startToken.type !== "css-variable") return null;

  const variableName = startToken.value;
  context.position++;

  // Skip whitespace and find colon
  skipWhitespace(context);

  const colonToken = context.tokens[context.position];
  if (!colonToken || colonToken.type !== "colon") {
    context.position--;
    return null;
  }
  context.position++;

  // Parse value until semicolon or end
  let value = "";

  while (context.position < context.tokens.length) {
    const token = context.tokens[context.position];
    if (token && token.type === "semicolon") {
      context.position++;
      break;
    }
    if (token) {
      value += token.value;
    }
    context.position++;
  }

  const lastToken = context.tokens[context.position - 1];
  const endPos = lastToken ? lastToken.end : startToken.end;

  return {
    id: `${context.filePath}:${startToken.start}-${endPos}`,
    kind: 0,
    category: CssNodeCategory.Variable as any,
    label: `${variableName}: ${value.trim()}`,
    loc: {
      start: { line: startToken.line, column: startToken.column },
      end: getPositionFromOffset(context.fileText, endPos),
    },
    source: context.fileText.substring(startToken.start, endPos),
    value: 1,
    children: [],
    meta: {
      variableName: variableName,
      variableValue: value.trim(),
      isCssVariable: true,
    },
  };
}

function parseAtRule(context: ParseContext): ScopeNode | null {
  const startToken = context.tokens[context.position];
  if (!startToken || startToken.type !== "at-rule") return null;

  const atRuleName = startToken.value;
  context.position++;

  // Handle different types of at-rules
  switch (atRuleName) {
    case "@mixin":
      return parseMixin(context, startToken);
    case "@function":
      return parseFunction(context, startToken);
    case "@include":
      return parseInclude(context, startToken);
    case "@extend":
      return parseExtend(context, startToken);
    case "@media":
      return parseMediaQuery(context, startToken);
    case "@keyframes":
      return parseKeyframes(context, startToken);
    case "@import":
      return parseImport(context, startToken);
    case "@for":
    case "@each":
    case "@while":
    case "@if":
      return parseControlDirective(context, startToken);
    default:
      return parseGenericAtRule(context, startToken);
  }
}

function parseMixin(
  context: ParseContext,
  startToken: CssToken
): ScopeNode | null {
  // Parse mixin name
  skipWhitespace(context);
  const nameToken = context.tokens[context.position];
  if (!nameToken || nameToken.type !== "identifier") return null;

  const mixinName = nameToken.value;
  context.position++;

  // Parse parameters if present
  let parameters = "";
  const currentToken = context.tokens[context.position];
  if (currentToken && currentToken.type === "lparen") {
    let parenCount = 0;
    do {
      const token = context.tokens[context.position];
      if (!token) break;
      if (token.type === "lparen") parenCount++;
      if (token.type === "rparen") parenCount--;
      parameters += token.value;
      context.position++;
    } while (parenCount > 0 && context.position < context.tokens.length);
  }

  // Parse body
  skipWhitespace(context);
  const bodyNode = parseBlock(context);

  const endPos = bodyNode
    ? bodyNode.loc.end
    : getPositionFromOffset(context.fileText, startToken.end);
  const bodyLength = bodyNode ? bodyNode.source.length : 0;
  const sourceEnd =
    bodyLength > 0 ? startToken.start + bodyLength : startToken.end;

  const mixinNode: ScopeNode = {
    id: `${context.filePath}:${startToken.start}-${sourceEnd}`,
    kind: 0,
    category: CssNodeCategory.Mixin as any,
    label: `@mixin ${mixinName}${parameters}`,
    loc: {
      start: { line: startToken.line, column: startToken.column },
      end: endPos,
    },
    source: context.fileText.substring(startToken.start, sourceEnd),
    value: 1,
    children: bodyNode ? bodyNode.children : [],
    meta: {
      mixinName,
      parameters,
    },
  };

  return mixinNode;
}

function parseFunction(
  context: ParseContext,
  startToken: CssToken
): ScopeNode | null {
  // Parse function name
  skipWhitespace(context);
  const nameToken = context.tokens[context.position];
  if (!nameToken || nameToken.type !== "identifier") return null;

  const functionName = nameToken.value;
  context.position++;

  // Parse parameters if present
  let parameters = "";
  const currentToken = context.tokens[context.position];
  if (currentToken && currentToken.type === "lparen") {
    let parenCount = 0;
    do {
      const token = context.tokens[context.position];
      if (!token) break;
      if (token.type === "lparen") parenCount++;
      if (token.type === "rparen") parenCount--;
      parameters += token.value;
      context.position++;
    } while (parenCount > 0 && context.position < context.tokens.length);
  }

  // Parse body
  skipWhitespace(context);
  const bodyNode = parseBlock(context);

  const endPos = bodyNode
    ? bodyNode.loc.end
    : getPositionFromOffset(context.fileText, startToken.end);
  const bodyLength = bodyNode ? bodyNode.source.length : 0;
  const sourceEnd =
    bodyLength > 0 ? startToken.start + bodyLength : startToken.end;

  const functionNode: ScopeNode = {
    id: `${context.filePath}:${startToken.start}-${sourceEnd}`,
    kind: 0,
    category: CssNodeCategory.Function as any,
    label: `@function ${functionName}${parameters}`,
    loc: {
      start: { line: startToken.line, column: startToken.column },
      end: endPos,
    },
    source: context.fileText.substring(startToken.start, sourceEnd),
    value: 1,
    children: bodyNode ? bodyNode.children : [],
    meta: {
      functionName,
      parameters,
    },
  };

  return functionNode;
}

function parseInclude(
  context: ParseContext,
  startToken: CssToken
): ScopeNode | null {
  // Parse everything until semicolon
  let content = startToken.value;
  let endPos = startToken.end;

  while (context.position < context.tokens.length) {
    const token = context.tokens[context.position];
    if (!token) break;
    content += token.value;
    endPos = token.end;
    context.position++;

    if (token.type === "semicolon") {
      break;
    }
  }

  return {
    id: `${context.filePath}:${startToken.start}-${endPos}`,
    kind: 0,
    category: CssNodeCategory.Include as any,
    label: content.trim(),
    loc: {
      start: { line: startToken.line, column: startToken.column },
      end: getPositionFromOffset(context.fileText, endPos),
    },
    source: context.fileText.substring(startToken.start, endPos),
    value: 1,
    children: [],
  };
}

function parseExtend(
  context: ParseContext,
  startToken: CssToken
): ScopeNode | null {
  // Parse everything until semicolon
  let content = startToken.value;
  let endPos = startToken.end;

  while (context.position < context.tokens.length) {
    const token = context.tokens[context.position];
    if (!token) break;
    content += token.value;
    endPos = token.end;
    context.position++;

    if (token.type === "semicolon") {
      break;
    }
  }

  return {
    id: `${context.filePath}:${startToken.start}-${endPos}`,
    kind: 0,
    category: CssNodeCategory.Extend as any,
    label: content.trim(),
    loc: {
      start: { line: startToken.line, column: startToken.column },
      end: getPositionFromOffset(context.fileText, endPos),
    },
    source: context.fileText.substring(startToken.start, endPos),
    value: 1,
    children: [],
  };
}

function parseMediaQuery(
  context: ParseContext,
  startToken: CssToken
): ScopeNode | null {
  // Parse condition until opening brace
  let condition = "";

  while (context.position < context.tokens.length) {
    const token = context.tokens[context.position];
    if (!token || token.type === "lbrace") {
      break;
    }
    condition += token.value;
    context.position++;
  }

  // Parse body
  const bodyNode = parseBlock(context);

  const endPos = bodyNode
    ? bodyNode.loc.end
    : getPositionFromOffset(context.fileText, startToken.end);
  const bodyLength = bodyNode ? bodyNode.source.length : 0;
  const sourceEnd =
    bodyLength > 0 ? startToken.start + bodyLength : startToken.end;

  return {
    id: `${context.filePath}:${startToken.start}-${sourceEnd}`,
    kind: 0,
    category: CssNodeCategory.MediaQuery as any,
    label: `@media ${condition.trim()}`,
    loc: {
      start: { line: startToken.line, column: startToken.column },
      end: endPos,
    },
    source: context.fileText.substring(startToken.start, sourceEnd),
    value: 1,
    children: bodyNode ? bodyNode.children : [],
    meta: {
      condition: condition.trim(),
    },
  };
}

function parseKeyframes(
  context: ParseContext,
  startToken: CssToken
): ScopeNode | null {
  // Parse animation name
  let animationName = "";

  while (context.position < context.tokens.length) {
    const token = context.tokens[context.position];
    if (!token || token.type === "lbrace") {
      break;
    }
    animationName += token.value;
    context.position++;
  }

  // Parse body
  const bodyNode = parseBlock(context);

  const endPos = bodyNode
    ? bodyNode.loc.end
    : getPositionFromOffset(context.fileText, startToken.end);
  const bodyLength = bodyNode ? bodyNode.source.length : 0;
  const sourceEnd =
    bodyLength > 0 ? startToken.start + bodyLength : startToken.end;

  return {
    id: `${context.filePath}:${startToken.start}-${sourceEnd}`,
    kind: 0,
    category: CssNodeCategory.KeyframeRule as any,
    label: `@keyframes ${animationName.trim()}`,
    loc: {
      start: { line: startToken.line, column: startToken.column },
      end: endPos,
    },
    source: context.fileText.substring(startToken.start, sourceEnd),
    value: 1,
    children: bodyNode ? bodyNode.children : [],
    meta: {
      animationName: animationName.trim(),
    },
  };
}

function parseImport(
  context: ParseContext,
  startToken: CssToken
): ScopeNode | null {
  // Parse everything until semicolon
  let content = startToken.value;
  let endPos = startToken.end;

  while (context.position < context.tokens.length) {
    const token = context.tokens[context.position];
    if (!token) break;
    content += token.value;
    endPos = token.end;
    context.position++;

    if (token.type === "semicolon") {
      break;
    }
  }

  return {
    id: `${context.filePath}:${startToken.start}-${endPos}`,
    kind: 0,
    category: CssNodeCategory.Import as any,
    label: content.trim(),
    loc: {
      start: { line: startToken.line, column: startToken.column },
      end: getPositionFromOffset(context.fileText, endPos),
    },
    source: context.fileText.substring(startToken.start, endPos),
    value: 1,
    children: [],
  };
}

function parseControlDirective(
  context: ParseContext,
  startToken: CssToken
): ScopeNode | null {
  // Parse condition/expression until opening brace
  let expression = startToken.value;

  while (context.position < context.tokens.length) {
    const token = context.tokens[context.position];
    if (!token || token.type === "lbrace") {
      break;
    }
    expression += token.value;
    context.position++;
  }

  // Parse body
  const bodyNode = parseBlock(context);

  const endPos = bodyNode
    ? bodyNode.loc.end
    : getPositionFromOffset(context.fileText, startToken.end);
  const bodyLength = bodyNode ? bodyNode.source.length : 0;
  const sourceEnd =
    bodyLength > 0 ? startToken.start + bodyLength : startToken.end;

  return {
    id: `${context.filePath}:${startToken.start}-${sourceEnd}`,
    kind: 0,
    category: CssNodeCategory.ControlDirective as any,
    label: expression.trim(),
    loc: {
      start: { line: startToken.line, column: startToken.column },
      end: endPos,
    },
    source: context.fileText.substring(startToken.start, sourceEnd),
    value: 1,
    children: bodyNode ? bodyNode.children : [],
    meta: {
      directive: startToken.value,
      expression: expression.trim(),
    },
  };
}

function parseGenericAtRule(
  context: ParseContext,
  startToken: CssToken
): ScopeNode | null {
  // Parse everything until semicolon or block
  let content = startToken.value;
  let endPos = startToken.end;
  let hasBlock = false;

  while (context.position < context.tokens.length) {
    const token = context.tokens[context.position];
    if (!token) break;

    if (token.type === "semicolon") {
      content += token.value;
      endPos = token.end;
      context.position++;
      break;
    } else if (token.type === "lbrace") {
      hasBlock = true;
      break;
    }

    content += token.value;
    endPos = token.end;
    context.position++;
  }

  // Parse body if there's a block
  let bodyNode: ScopeNode | null = null;
  if (hasBlock) {
    bodyNode = parseBlock(context);
  }

  const finalEndPos = bodyNode
    ? bodyNode.loc.end
    : getPositionFromOffset(context.fileText, endPos);
  const bodyLength = bodyNode ? bodyNode.source.length : 0;
  const sourceEnd = bodyLength > 0 ? startToken.start + bodyLength : endPos;

  // Use source text directly for the label instead of concatenated tokens
  // This preserves original formatting and spacing
  const sourceText = context.fileText.substring(startToken.start, endPos);

  return {
    id: `${context.filePath}:${startToken.start}-${sourceEnd}`,
    kind: 0,
    category: CssNodeCategory.AtRule as any,
    label: sourceText.trim(),
    loc: {
      start: { line: startToken.line, column: startToken.column },
      end: finalEndPos,
    },
    source: context.fileText.substring(startToken.start, sourceEnd),
    value: 1,
    children: bodyNode ? bodyNode.children : [],
  };
}

function parseRule(context: ParseContext): ScopeNode | null {
  const startPos = context.position;
  const startToken = context.tokens[context.position];
  if (!startToken) return null;

  // Parse selector until opening brace
  let selector = "";
  const selectorStartPos = startToken.start;

  while (context.position < context.tokens.length) {
    const token = context.tokens[context.position];
    if (!token || token.type === "lbrace") {
      break;
    }
    if (token.type === "comment") {
      context.position++;
      continue;
    }
    // Skip stray closing braces in selector
    if (token.type === "rbrace") {
      context.position++;
      continue;
    }
    selector += token.value;
    context.position++;
  }

  if (context.position >= context.tokens.length) {
    return null;
  }

  // Parse block
  const bodyNode = parseBlock(context);
  if (!bodyNode) {
    context.position = startPos;
    return null;
  }

  const endPos = bodyNode.loc.end;
  const totalLength = selector.length + bodyNode.source.length;
  const sourceEnd =
    totalLength > 0
      ? selectorStartPos + totalLength
      : bodyNode.source.length || selectorStartPos;

  // Flatten block children directly into this rule instead of having a Block node
  return {
    id: `${context.filePath}:${selectorStartPos}-${sourceEnd}`,
    kind: 0,
    category: CssNodeCategory.Rule as any,
    label: selector.trim() || "Anonymous Rule",
    loc: {
      start: { line: startToken.line, column: startToken.column },
      end: endPos,
    },
    source: context.fileText.substring(selectorStartPos, sourceEnd),
    value: 1,
    children: bodyNode.children, // Use block's children directly instead of the block itself
    meta: {
      selector: selector.trim(),
    },
  };
}

function parseBlock(context: ParseContext): ScopeNode | null {
  const openBraceToken = context.tokens[context.position];
  if (!openBraceToken || openBraceToken.type !== "lbrace") {
    return null;
  }

  const blockStartPos = openBraceToken.start;
  context.position++; // Skip opening brace

  const blockNode: ScopeNode = {
    id: `${context.filePath}:${blockStartPos}-block`,
    kind: 0,
    category: CssNodeCategory.Block as any,
    label: "Block",
    loc: {
      start: { line: openBraceToken.line, column: openBraceToken.column },
      end: { line: openBraceToken.line, column: openBraceToken.column }, // Will be updated
    },
    source: "",
    value: 1,
    children: [],
  };

  let braceCount = 1;
  let blockEndPos = blockStartPos;

  while (context.position < context.tokens.length && braceCount > 0) {
    const token = context.tokens[context.position];
    if (!token) break;

    if (token.type === "lbrace") {
      braceCount++;
    } else if (token.type === "rbrace") {
      braceCount--;
      if (braceCount === 0) {
        blockEndPos = token.end;
        context.position++;
        break;
      }
    }

    // Parse declarations and nested rules within the block
    if (token.type === "comment") {
      const commentNode = createCommentNode(context, token);
      blockNode.children.push(commentNode);
      context.position++;
    } else if (token.type === "variable" && context.isScss) {
      const variableNode = parseVariable(context);
      if (variableNode) {
        blockNode.children.push(variableNode);
      }
    } else if (token.type === "at-rule") {
      const atRuleNode = parseAtRule(context);
      if (atRuleNode) {
        blockNode.children.push(atRuleNode);
      }
    } else {
      // Try to parse as declaration or nested rule
      const declOrRule = parseDeclarationOrNestedRule(context);
      if (declOrRule) {
        blockNode.children.push(declOrRule);
      } else {
        context.position++;
      }
    }
  }

  // Update block node with final position
  blockNode.loc.end = getPositionFromOffset(context.fileText, blockEndPos);
  blockNode.source = context.fileText.substring(blockStartPos, blockEndPos);
  blockNode.id = `${context.filePath}:${blockStartPos}-${blockEndPos}`;

  return blockNode;
}

function parseDeclarationOrNestedRule(context: ParseContext): ScopeNode | null {
  const startPos = context.position;
  const startToken = context.tokens[context.position];
  if (!startToken) return null;

  // Look ahead to see if this is a declaration (property: value) or nested rule
  let lookahead = context.position;
  let foundColon = false;
  let foundBrace = false;
  let isAtStart = true; // Track if we're at the start of the token sequence

  while (lookahead < context.tokens.length) {
    const token = context.tokens[lookahead];
    if (!token) break;

    if (token.type === "colon") {
      // If colon is at the start (or after only whitespace), it's likely a pseudo-selector
      if (isAtStart) {
        // Continue looking for a brace to confirm it's a rule
        foundColon = false; // Reset this since it's a pseudo-selector, not a property
      } else {
        // Colon found after other tokens, likely a property declaration
        if (!foundBrace) {
          foundColon = true;
          break;
        }
      }
    } else if (token.type === "lbrace") {
      foundBrace = true;
      break;
    } else if (token.type === "semicolon" || token.type === "rbrace") {
      break;
    }

    // Update isAtStart - only whitespace tokens should keep us at "start"
    if (token.type !== "unknown" || !/\s/.test(token.value)) {
      isAtStart = false;
    }

    lookahead++;
  }

  if (foundColon && !foundBrace) {
    // Parse as declaration
    return parseDeclaration(context);
  } else if (foundBrace) {
    // Parse as nested rule
    return parseRule(context);
  } else {
    // Skip unknown token
    context.position++;
    return null;
  }
}

function parseDeclaration(context: ParseContext): ScopeNode | null {
  const startToken = context.tokens[context.position];
  if (!startToken) return null;

  // Parse property name
  let property = "";
  while (context.position < context.tokens.length) {
    const token = context.tokens[context.position];
    if (!token || token.type === "colon") {
      context.position++;
      break;
    }
    property += token.value;
    context.position++;
  }

  // Parse value
  let value = "";
  let endPos = startToken.end;

  while (context.position < context.tokens.length) {
    const token = context.tokens[context.position];
    if (!token) break;

    if (token.type === "semicolon") {
      endPos = token.end;
      context.position++;
      break;
    } else if (token.type === "rbrace") {
      // Declaration without semicolon
      const prevToken = context.tokens[context.position - 1];
      endPos = prevToken ? prevToken.end : token.start;
      break;
    }
    value += token.value;
    endPos = token.end;
    context.position++;
  }

  return {
    id: `${context.filePath}:${startToken.start}-${endPos}`,
    kind: 0,
    category: CssNodeCategory.Property as any,
    label: `${property.trim()}: ${value.trim()}`,
    loc: {
      start: { line: startToken.line, column: startToken.column },
      end: getPositionFromOffset(context.fileText, endPos),
    },
    source: context.fileText.substring(startToken.start, endPos),
    value: 1,
    children: [],
    meta: {
      property: property.trim(),
      value: value.trim(),
    },
  };
}

function createCommentNode(context: ParseContext, token: CssToken): ScopeNode {
  return {
    id: `${context.filePath}:${token.start}-${token.end}`,
    kind: 0,
    category: CssNodeCategory.Comment as any,
    label: token.value.trim(),
    loc: {
      start: { line: token.line, column: token.column },
      end: getPositionFromOffset(context.fileText, token.end),
    },
    source: token.value,
    value: 1,
    children: [],
  };
}

function skipWhitespace(context: ParseContext): void {
  while (context.position < context.tokens.length) {
    const token = context.tokens[context.position];
    if (!token || token.type !== "unknown" || !/\s/.test(token.value)) {
      break;
    }
    context.position++;
  }
}

function getPositionFromOffset(text: string, offset: number): Position {
  const lines = text.substring(0, offset).split("\n");
  return {
    line: lines.length,
    column: lines[lines.length - 1]?.length || 0,
  };
}
