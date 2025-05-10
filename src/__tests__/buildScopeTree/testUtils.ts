import * as fs from "node:fs";
import * as path from "node:path";
import { expect } from "vitest";
import { buildScopeTree } from "../../buildScopeTree";

export const getFixturePath = (fileName: string) =>
  path.join(__dirname, "..", "__fixtures__", fileName);

export const runScopeTreeSnapshotTest = (options: {
  snapshotIdentifier: string;
  filePath: string; // For fixture: fixture name. For inline: mock file path.
  isFixture?: boolean;
  inlineContent?: string;
}) => {
  const {
    snapshotIdentifier,
    filePath,
    isFixture = false,
    inlineContent,
  } = options;

  let actualFilePathUsedInBuild: string;
  let fileContentValue: string;

  if (isFixture) {
    actualFilePathUsedInBuild = getFixturePath(filePath);
    fileContentValue = fs.readFileSync(actualFilePathUsedInBuild, "utf-8");
  } else {
    if (inlineContent === undefined) {
      throw new Error(
        "inlineContent must be provided if isFixture is false or not set."
      );
    }
    actualFilePathUsedInBuild = filePath; // Use the provided filePath for buildScopeTree
    fileContentValue = inlineContent;
  }

  const tree = buildScopeTree(actualFilePathUsedInBuild, fileContentValue);
  expect(tree).toMatchSnapshot(snapshotIdentifier);
};
