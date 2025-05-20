import { NodeCategory } from "../../types";

export const pastelSet: Record<NodeCategory, string> = {
  [NodeCategory.Program]: "#8dd3c7",
  [NodeCategory.Module]: "#ffffb3",
  [NodeCategory.Class]: "#bebada",
  [NodeCategory.Function]: "#fb8072", // Coral pink
  [NodeCategory.ArrowFunction]: "#80b1d3",
  [NodeCategory.Block]: "#fdb462",
  [NodeCategory.ControlFlow]: "#b3de69",
  [NodeCategory.Variable]: "#fccde5",
  [NodeCategory.Call]: "#d9d9d9", // Dull gray, good for console
  [NodeCategory.ReactComponent]: "#bc80bd",
  [NodeCategory.ReactHook]: "#ccebc5",
  [NodeCategory.JSX]: "#ffed6f",
  [NodeCategory.JSXElementDOM]: "#d4e157",
  [NodeCategory.JSXElementCustom]: "#bde4e8", // Was #ffc0cb (pink), changed to light blue/teal
  [NodeCategory.Import]: "#c1e7ff",
  [NodeCategory.TypeAlias]: "#ffe8b3",
  [NodeCategory.Interface]: "#f0e68c",
  [NodeCategory.Literal]: "#dcdcdc",
  [NodeCategory.SyntheticGroup]: "#e6e6fa",
  [NodeCategory.ConditionalBlock]: "#b3e2cd", // Mint green (base for conditionals)
  [NodeCategory.IfClause]: "#c6f0e0", // Lighter mint
  [NodeCategory.ElseIfClause]: "#a0d8c0", // Medium mint
  [NodeCategory.ElseClause]: "#8ccbad", // Darker mint
  [NodeCategory.Other]: "#a6cee3",
  [NodeCategory.ReturnStatement]: "#66c2a5",
  [NodeCategory.Assignment]: "#ffd92f",

  // Markdown specific colors
  [NodeCategory.MarkdownHeading]: "#f4a261", // Sandy Brown
  [NodeCategory.MarkdownParagraph]: "#e9c46a", // Saffron
  [NodeCategory.MarkdownBlockquote]: "#2a9d8f", // Persian Green
  [NodeCategory.MarkdownCodeBlock]: "#264653", // Charcoal
  [NodeCategory.MarkdownList]: "#e76f51", // Burnt Sienna
  [NodeCategory.MarkdownListItem]: "#f4a261", // (Same as Heading, or choose another)
  [NodeCategory.MarkdownTable]: "#a2d2ff", // Light Blue
  [NodeCategory.MarkdownImage]: "#bde0fe", // Lighter Blue
  [NodeCategory.MarkdownThematicBreak]: "#ced4da", // Light Gray
};
