export interface TreemapSettings {
  tile: "squarify" | "binary" | "dice" | "slice" | "sliceDice";
  leavesOnly: boolean;
  innerPadding: number;
  outerPadding: number;
  enableLabel: boolean;
  labelSkipSize: number;
  nodeOpacity: number;
  borderWidth: number;
  enableTooltip: boolean;
  showTooltipId: boolean;
  showTooltipCategory: boolean;
  showTooltipValue: boolean;
  showTooltipLines: boolean;
  showTooltipSourceSnippet: boolean;
  tooltipSourceSnippetLength: number;
  enableNodeFlattening: boolean;
  flattenBlocks: boolean;
  flattenArrowFunctions: boolean;
  createSyntheticGroups: boolean;
  showImports: boolean;
  showTypes: boolean;
  showLiterals: boolean;
  showComments: boolean;
  minLabelHeight: number;
  truncateLabel: boolean;
  labelMaxChars: number;
  avgCharPixelWidth: number;
  enableDepthLimit: boolean;
  maxDepth: number;
}

export interface SettingConfigBase<T> {
  id: keyof TreemapSettings;
  label: string;
  type: "boolean" | "number" | "select";
  group: string;
  disabled?: (settings: TreemapSettings) => boolean;
  indent?: boolean;
}

export interface BooleanSettingConfig extends SettingConfigBase<boolean> {
  type: "boolean";
}

export interface NumberSettingConfig extends SettingConfigBase<number> {
  type: "number";
  min?: number;
  max?: number;
  step?: number;
}

export interface SelectSettingConfig<ValueType extends string>
  extends SettingConfigBase<ValueType> {
  type: "select";
  options: { value: ValueType; label: string }[];
}

export type SettingConfig =
  | BooleanSettingConfig
  | NumberSettingConfig
  | SelectSettingConfig<any>;

export const treemapSettingsConfig: SettingConfig[] = [
  // Treemap Display Settings
  {
    id: "tile",
    label: "Tiling Algorithm",
    type: "select",
    group: "Treemap Display",
    options: [
      { value: "squarify", label: "Squarify" },
      { value: "binary", label: "Binary" },
      { value: "dice", label: "Dice" },
      { value: "slice", label: "Slice" },
      { value: "sliceDice", label: "SliceDice" },
    ],
  },
  {
    id: "leavesOnly",
    label: "Show Leaves Only",
    type: "boolean",
    group: "Treemap Display",
  },
  {
    id: "innerPadding",
    label: "Inner Padding (px)",
    type: "number",
    group: "Treemap Display",
    min: 0,
  },
  {
    id: "outerPadding",
    label: "Outer Padding (px)",
    type: "number",
    group: "Treemap Display",
    min: 0,
  },
  {
    id: "nodeOpacity",
    label: "Node Opacity (0-1)",
    type: "number",
    group: "Treemap Display",
    min: 0,
    max: 1,
    step: 0.1,
  },
  {
    id: "borderWidth",
    label: "Border Width (px)",
    type: "number",
    group: "Treemap Display",
    min: 0,
  },

  // Label Rendering Settings
  {
    id: "enableLabel",
    label: "Enable Labels",
    type: "boolean",
    group: "Label Rendering",
  },
  {
    id: "labelSkipSize",
    label: "Label Skip Size (px)",
    type: "number",
    group: "Label Rendering",
    min: 0,
    disabled: (s) => !s.enableLabel,
  },
  {
    id: "minLabelHeight",
    label: "Min Label Height (px)",
    type: "number",
    group: "Label Rendering",
    min: 0,
    disabled: (s) => !s.enableLabel,
  },
  {
    id: "truncateLabel",
    label: "Truncate Long Labels",
    type: "boolean",
    group: "Label Rendering",
    disabled: (s) => !s.enableLabel,
  },
  {
    id: "labelMaxChars",
    label: "Max Chars (if truncating)",
    type: "number",
    group: "Label Rendering",
    min: 3,
    disabled: (s) => !s.enableLabel || !s.truncateLabel,
  },
  {
    id: "avgCharPixelWidth",
    label: "Avg Char Width (px for truncation)",
    type: "number",
    group: "Label Rendering",
    min: 1,
    disabled: (s) => !s.enableLabel || !s.truncateLabel,
  },

  // Depth Limiting Settings
  {
    id: "enableDepthLimit",
    label: "Enable Depth Limit",
    type: "boolean",
    group: "Depth Limiting",
  },
  {
    id: "maxDepth",
    label: "Max Depth (0 for root)",
    type: "number",
    group: "Depth Limiting",
    min: 0,
    disabled: (s) => !s.enableDepthLimit,
  },

  // Node Structure Settings
  {
    id: "enableNodeFlattening",
    label: "Enable Node Optimizations",
    type: "boolean",
    group: "Node Structure",
  },
  {
    id: "flattenBlocks",
    label: "Optimize Simple Blocks",
    type: "boolean",
    group: "Node Structure",
    indent: true,
    disabled: (s) => !s.enableNodeFlattening,
  },
  {
    id: "flattenArrowFunctions",
    label: "Optimize Arrow Functions",
    type: "boolean",
    group: "Node Structure",
    indent: true,
    disabled: (s) => !s.enableNodeFlattening,
  },
  {
    id: "createSyntheticGroups",
    label: "Group Related Nodes",
    type: "boolean",
    group: "Node Structure",
    indent: true,
    disabled: (s) => !s.enableNodeFlattening,
  },

  // Node Visibility Settings
  {
    id: "showImports",
    label: "Show Imports",
    type: "boolean",
    group: "Node Visibility",
  },
  {
    id: "showTypes",
    label: "Show Type Definitions",
    type: "boolean",
    group: "Node Visibility",
  },
  {
    id: "showLiterals",
    label: "Show Literals",
    type: "boolean",
    group: "Node Visibility",
  },
  {
    id: "showComments",
    label: "Show Comments",
    type: "boolean",
    group: "Node Visibility",
  },

  // Tooltip Settings
  {
    id: "enableTooltip",
    label: "Enable Tooltip",
    type: "boolean",
    group: "Tooltip",
  },
  {
    id: "showTooltipId",
    label: "Show ID",
    type: "boolean",
    group: "Tooltip",
    indent: true,
    disabled: (s) => !s.enableTooltip,
  },
  {
    id: "showTooltipCategory",
    label: "Show Category",
    type: "boolean",
    group: "Tooltip",
    indent: true,
    disabled: (s) => !s.enableTooltip,
  },
  {
    id: "showTooltipValue",
    label: "Show Value",
    type: "boolean",
    group: "Tooltip",
    indent: true,
    disabled: (s) => !s.enableTooltip,
  },
  {
    id: "showTooltipLines",
    label: "Show Lines",
    type: "boolean",
    group: "Tooltip",
    indent: true,
    disabled: (s) => !s.enableTooltip,
  },
  {
    id: "showTooltipSourceSnippet",
    label: "Show Source Snippet",
    type: "boolean",
    group: "Tooltip",
    indent: true,
    disabled: (s) => !s.enableTooltip,
  },
  {
    id: "tooltipSourceSnippetLength",
    label: "Snippet Length",
    type: "number",
    group: "Tooltip",
    min: 0,
    max: 1000,
    indent: true,
    disabled: (s) => !s.enableTooltip || !s.showTooltipSourceSnippet,
  },
];

export const settingGroupOrder: string[] = [
  "Treemap Display",
  "Label Rendering",
  "Depth Limiting",
  "Node Structure",
  "Node Visibility",
  "Tooltip",
];

// Default Treemap settings, aligned with the interface
export const defaultTreemapSettings: TreemapSettings = {
  tile: "binary",
  leavesOnly: false,
  innerPadding: 2,
  outerPadding: 1,
  enableLabel: true,
  labelSkipSize: 12,
  nodeOpacity: 0.9,
  borderWidth: 1.5,
  enableTooltip: true,
  showTooltipId: true,
  showTooltipCategory: true,
  showTooltipValue: true,
  showTooltipLines: true,
  showTooltipSourceSnippet: true,
  tooltipSourceSnippetLength: 250,
  enableNodeFlattening: true,
  flattenBlocks: true,
  flattenArrowFunctions: true,
  createSyntheticGroups: true,
  showImports: true,
  showTypes: true,
  showLiterals: false,
  showComments: false,
  minLabelHeight: 15,
  truncateLabel: true,
  labelMaxChars: 200,
  avgCharPixelWidth: 5,
  enableDepthLimit: false,
  maxDepth: 5,
};
