import { NodeCategory } from "../../types";

// Helper to map mdast node types to NodeCategory
export function mapMdastTypeToCategory(mdastType: string): NodeCategory {
  switch (mdastType) {
    case "heading":
      return NodeCategory.MarkdownHeading;
    case "paragraph":
      return NodeCategory.MarkdownParagraph;
    case "blockquote":
      return NodeCategory.MarkdownBlockquote;
    case "code": // This is for code blocks
      return NodeCategory.MarkdownCodeBlock;
    case "list":
      return NodeCategory.MarkdownList;
    case "listItem":
      return NodeCategory.MarkdownListItem;
    case "table":
      return NodeCategory.MarkdownTable;
    case "image":
      return NodeCategory.MarkdownImage;
    case "thematicBreak":
      return NodeCategory.MarkdownThematicBreak;
    // mdast types not creating ScopeNodes:
    // 'text', 'emphasis', 'strong', 'inlineCode', 'link', 'linkReference', 'imageReference',
    // 'footnoteReference', 'footnoteDefinition', 'definition', 'html', 'yaml' (frontmatter)
    // 'tableRow', 'tableCell' (children of Table, not direct ScopeNodes for now)
    default:
      return NodeCategory.Other; // Or a more specific Markdown "Other" if needed
  }
}
