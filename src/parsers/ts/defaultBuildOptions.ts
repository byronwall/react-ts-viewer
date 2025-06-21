import { type BuildScopeTreeOptions } from "../../types";

// Default options for buildScopeTree

export const defaultBuildOptions: Required<BuildScopeTreeOptions> = {
  flattenTree: true, // Enable overall flattening pass
  flattenBlocks: true,
  flattenArrowFunctions: true,
  createSyntheticGroups: true,
  includeImports: true,
  includeTypes: true,
  includeLiterals: false, // Literals often off by default due to volume
  includeComments: false, // Comments often off by default due to volume
};
