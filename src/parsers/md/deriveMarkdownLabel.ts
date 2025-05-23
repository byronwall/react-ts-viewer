// Helper to derive label from mdast node
export function deriveMarkdownLabel(mdastNode: any, fileText: string): string {
  switch (mdastNode.type) {
    case "heading":
      // Concatenate text content of heading children
      return (
        mdastNode.children
          ?.map((child: any) => (child.type === "text" ? child.value : ""))
          .join("") || "Heading" // Default if no text, will be prefixed with Hx:
      );
    case "paragraph": {
      // First few words or characters
      const paragraphText = mdastNode.children
        ?.map((child: any) => (child.type === "text" ? child.value : ""))
        .join("");
      return paragraphText
        ? paragraphText.substring(0, 30) +
            (paragraphText.length > 30 ? "..." : "")
        : "Paragraph";
    }
    case "blockquote":
      return "Blockquote";
    case "code":
      return mdastNode.lang ? `Code (${mdastNode.lang})` : "Code Block";
    case "list":
      return mdastNode.ordered ? "Ordered List" : "Unordered List";
    case "listItem": {
      // For list items, attempt to concatenate text content from their children
      let itemTextContent = "";
      if (mdastNode.children && Array.isArray(mdastNode.children)) {
        for (const child of mdastNode.children) {
          // Typically, child is a paragraph node
          if (
            child.type === "paragraph" &&
            child.children &&
            Array.isArray(child.children)
          ) {
            for (const grandchild of child.children) {
              // grandchild is inline content like text, emphasis, etc.
              if (
                grandchild.type === "text" &&
                typeof grandchild.value === "string"
              ) {
                itemTextContent += grandchild.value;
              } else if (
                grandchild.type === "inlineCode" &&
                typeof grandchild.value === "string"
              ) {
                itemTextContent += grandchild.value;
              } else if (
                (grandchild.type === "emphasis" ||
                  grandchild.type === "strong") &&
                grandchild.children &&
                Array.isArray(grandchild.children)
              ) {
                // Concatenate text from children of emphasis/strong
                for (const formattedTextNode of grandchild.children) {
                  if (
                    formattedTextNode.type === "text" &&
                    typeof formattedTextNode.value === "string"
                  ) {
                    itemTextContent += formattedTextNode.value;
                  }
                }
              }
            }
          } else if (child.type === "text" && typeof child.value === "string") {
            // Case where list item might have text nodes directly (less common for complex items)
            itemTextContent += child.value;
          }
          // Add a space if joining content from multiple top-level children of the list item (e.g., multiple paragraphs)
          itemTextContent += " ";
        }
      }
      itemTextContent = itemTextContent.replace(/\s+/g, " ").trim(); // Consolidate spaces and trim
      return itemTextContent
        ? itemTextContent.substring(0, 30) +
            (itemTextContent.length > 30 ? "..." : "")
        : "List Item"; // Default if no text content found
    }
    case "table":
      return "Table";
    case "image":
      return mdastNode.alt || mdastNode.title || "Image";
    case "thematicBreak":
      return "---";
    default:
      return mdastNode.type;
  }
}
