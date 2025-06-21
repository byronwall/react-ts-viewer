import * as fs from "fs";
import * as path from "path";

import { buildScopeTreeCss } from "./css/buildScopeTreeCss";
import { buildScopeTreeForMarkdown } from "./md/buildScopeTreeForMarkdown";
import { buildScopeTreeTs } from "./ts/buildScopeTreeTs";

import { type BuildScopeTreeOptions, type ScopeNode } from "../types";

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
  } else if (fileExtension === ".css" || fileExtension === ".scss") {
    return buildScopeTreeCss(filePath, fileText, options);
  } else {
    return buildScopeTreeTs(filePath, fileText, options);
  }
}
