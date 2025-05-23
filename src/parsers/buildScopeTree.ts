import * as fs from "fs";
import * as path from "path";
import { ScopeNode, BuildScopeTreeOptions } from "../types";
import { buildScopeTreeForMarkdown } from "./md/buildScopeTreeForMarkdown";
import { buildScopeTreeTs } from "./ts/buildScopeTreeTs";

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
  } else {
    return buildScopeTreeTs(filePath, fileText, options);
  }
}
