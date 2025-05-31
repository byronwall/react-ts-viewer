import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import { BuildScopeTreeOptions, ScopeNode, NodeCategory } from "../../types";
import { defaultBuildOptions } from "./defaultBuildOptions";
import { mapKindToCategory } from "./mapKindToCategory";
import { formatScopeNodeLabel } from "./formatScopeNodeLabel";
import { determineNodeLabel } from "./determineNodeLabel";
import { collectMeta } from "./collectMeta";
import { lineColOfPos } from "./lineColOfPos";
import { filterNodesByOptions } from "./filterNodesByOptions";
import { createSyntheticGroups } from "./createSyntheticGroups";
import { flattenTree } from "./flattenTree";
import { isScopeBoundary } from "./isScopeBoundary";

export function buildScopeTreeTs(
  filePath: string,
  fileText: string = fs.readFileSync(filePath, "utf8"),
  options?: BuildScopeTreeOptions
): ScopeNode {
  console.log("####### buildScopeTree EXECUTING - VERSION X #######", filePath); // Add a version number
  const mergedOptions: Required<BuildScopeTreeOptions> = {
    ...defaultBuildOptions,
    ...(options || {}),
  };

  const sourceFile = ts.createSourceFile(
    path.basename(filePath), // Use basename for the source file name in AST
    fileText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX // Assume TSX, adjust if needed
  );

  const rootLocEnd = lineColOfPos(sourceFile, fileText.length);
  const root: ScopeNode = {
    id: filePath, // Use full path for root ID for uniqueness
    kind: sourceFile.kind,
    category: NodeCategory.Program,
    label: "", // Initialize and let determineNodeLabel set it
    loc: {
      start: { line: 1, column: 0 },
      end: rootLocEnd,
    },
    source: fileText,
    value: 1, // Changed from fileText.length
    children: [],
  };
  root.label = determineNodeLabel(root, sourceFile); // Set root label
  root.label = formatScopeNodeLabel(root); // Format the label

  function walk(node: ts.Node, parentNodeInTree: ScopeNode, sf: ts.SourceFile) {
    // --- START: Special handling for IfStatement chains ---
    if (ts.isIfStatement(node)) {
      const conditionalBlockStartPos = node.getStart(sf);

      let lastKnownStatementInChain: ts.Node = node.thenStatement;
      let currentChainLink: ts.IfStatement | undefined = node;
      while (currentChainLink) {
        const thenStatementForCurrentLink = currentChainLink.thenStatement;
        if (thenStatementForCurrentLink) {
          lastKnownStatementInChain = thenStatementForCurrentLink;
        }

        if (currentChainLink.elseStatement) {
          lastKnownStatementInChain = currentChainLink.elseStatement;
          if (ts.isIfStatement(currentChainLink.elseStatement)) {
            currentChainLink = currentChainLink.elseStatement;
            if (currentChainLink.thenStatement) {
              lastKnownStatementInChain = currentChainLink.thenStatement;
            }
          } else {
            currentChainLink = undefined;
          }
        } else {
          currentChainLink = undefined;
        }
      }
      const conditionalBlockEndPos = lastKnownStatementInChain.getEnd();

      const conditionalBlockId = `${filePath}:${conditionalBlockStartPos}-${conditionalBlockEndPos}`;
      const conditionalBlockNode: ScopeNode = {
        id: conditionalBlockId,
        kind: ts.SyntaxKind.Unknown,
        category: NodeCategory.ConditionalBlock,
        label: "", // Placeholder, will be updated after children by determineNodeLabel
        loc: {
          start: lineColOfPos(sf, conditionalBlockStartPos),
          end: lineColOfPos(sf, conditionalBlockEndPos),
        },
        source: fileText.substring(
          conditionalBlockStartPos,
          conditionalBlockEndPos
        ),
        value: 1,
        children: [],
        meta: {},
      };

      let currentIfStmtNode: ts.IfStatement | undefined = node;
      let clauseCategory = NodeCategory.IfClause; // Initial category for the first clause

      while (currentIfStmtNode) {
        const conditionText = currentIfStmtNode.expression.getText(sf);
        const thenStatement = currentIfStmtNode.thenStatement;

        const clauseStartPos = currentIfStmtNode.getStart(sf);
        const clauseEndPos = thenStatement.getEnd();
        const clauseNodeId = `${filePath}:${clauseStartPos}-${clauseEndPos}`;

        // Determine label for IfClause and ElseIfClause here based on their condition
        let clauseLabelText = "";
        if (clauseCategory === NodeCategory.IfClause) {
          clauseLabelText = `if (${conditionText})`;
        } else if (clauseCategory === NodeCategory.ElseIfClause) {
          clauseLabelText = `else if (${conditionText})`;
        }
        // ElseClause label is handled separately below or by determineNodeLabel for the 'else' keyword
        const clauseNode: ScopeNode = {
          id: clauseNodeId,
          kind: currentIfStmtNode.kind,
          category: clauseCategory,
          label: clauseLabelText, // Set specific label for if/else if clause
          loc: {
            start: lineColOfPos(sf, clauseStartPos),
            end: lineColOfPos(sf, clauseEndPos),
          },
          source: fileText.substring(clauseStartPos, clauseEndPos),
          value: 1,
          children: [],
          meta: { condition: conditionText },
        };
        conditionalBlockNode.children.push(clauseNode);

        walk(thenStatement, clauseNode, sf);

        const elseStatement: ts.Statement | undefined =
          currentIfStmtNode.elseStatement;
        if (elseStatement) {
          if (ts.isIfStatement(elseStatement)) {
            currentIfStmtNode = elseStatement;
            clauseCategory = NodeCategory.ElseIfClause; // Update category for the next iteration
          } else {
            const elseNodeStartPos = elseStatement.getStart(sf);
            const elseNodeEndPos = elseStatement.getEnd();
            const elseNodeId = `${filePath}:${elseNodeStartPos}-${elseNodeEndPos}`;
            const elseClauseNode: ScopeNode = {
              id: elseNodeId,
              kind: elseStatement.kind,
              category: NodeCategory.ElseClause,
              label: "else", // Directly set "else" label
              loc: {
                start: lineColOfPos(sf, elseNodeStartPos),
                end: lineColOfPos(sf, elseNodeEndPos),
              },
              source: fileText.substring(elseNodeStartPos, elseNodeEndPos),
              value: 1,
              children: [],
              meta: {},
            };
            conditionalBlockNode.children.push(elseClauseNode);
            walk(elseStatement, elseClauseNode, sf);
            currentIfStmtNode = undefined;
          }
        } else {
          currentIfStmtNode = undefined;
        }
      }

      // Update ConditionalBlock label based on its children using determineNodeLabel
      conditionalBlockNode.label = determineNodeLabel(
        conditionalBlockNode,
        sf,
        conditionalBlockNode.children
      );
      conditionalBlockNode.label = formatScopeNodeLabel(conditionalBlockNode);

      if (
        conditionalBlockNode.children.length === 1 &&
        conditionalBlockNode.children[0] &&
        conditionalBlockNode.children[0].category === NodeCategory.IfClause
      ) {
        parentNodeInTree.children.push(conditionalBlockNode.children[0]);
      } else {
        parentNodeInTree.children.push(conditionalBlockNode);
      }

      return;
    }
    // --- END: Special handling for IfStatement chains ---
    // --- START: Special handling for TryStatement ---
    if (ts.isTryStatement(node)) {
      const startPos = node.getStart(sf, false);
      const endPos = node.getEnd();
      const category = NodeCategory.ControlFlow;

      const tryNode: ScopeNode = {
        id: `${filePath}:${startPos}-${endPos}`,
        kind: node.kind,
        category: category,
        label: determineNodeLabel(node, sf), // Use central labeler
        loc: {
          start: lineColOfPos(sf, startPos),
          end: lineColOfPos(sf, endPos),
        },
        source: fileText.substring(startPos, endPos),
        value: 1,
        meta: collectMeta(node, category, sf),
        children: [],
      };
      parentNodeInTree.children.push(tryNode);

      if (node.tryBlock) {
        node.tryBlock.statements.forEach((statement) =>
          walk(statement, tryNode, sf)
        );
      }

      if (node.catchClause) {
        walk(node.catchClause, tryNode, sf);
      }

      if (node.finallyBlock) {
        const finallyBlock = node.finallyBlock;
        const finallyStartPos = finallyBlock.getStart(sf);
        const finallyEndPos = finallyBlock.getEnd();
        const finallyNodeId = `${filePath}:${finallyStartPos}-${finallyEndPos}`;

        const finallyScopeNode: ScopeNode = {
          id: finallyNodeId,
          kind: finallyBlock.kind,
          category: NodeCategory.Block, // Could be a more specific FinallyBlockCategory
          label: "finally", // Specific label for finally block
          loc: {
            start: lineColOfPos(sf, finallyStartPos),
            end: lineColOfPos(sf, finallyEndPos),
          },
          source: fileText.substring(finallyStartPos, finallyEndPos),
          value: 1,
          children: [],
        };
        // ensure label for finallyScopeNode is set via determineNodeLabel if it has its own entry
        // or confirm "finally" is the desired final string. For now, it's hardcoded.
        // If using determineNodeLabel:
        // finallyScopeNode.label = determineNodeLabel(finallyScopeNode, sf);
        // This would require determineNodeLabel to recognize a 'finally' ScopeNode.
        // Simpler to keep "finally" hardcoded here or ensure determineNodeLabel handles it if passed the ts.Block of finally.
        // The current determineNodeLabel for ScopeNode with category Block and label "finally" will return "finally".
        finallyScopeNode.label = formatScopeNodeLabel(finallyScopeNode); // Format label

        tryNode.children.push(finallyScopeNode);
        finallyBlock.statements.forEach((statement) =>
          walk(statement, finallyScopeNode, sf)
        );
      }
      tryNode.label = formatScopeNodeLabel(tryNode); // Format label
      return;
    }
    // --- END: Special handling for TryStatement ---
    // --- START: Special handling for ForStatement, ForOfStatement, ForInStatement ---
    if (
      ts.isForStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isForInStatement(node)
    ) {
      const startPos = node.getStart(sf, false);
      const endPos = node.getEnd();
      const category = NodeCategory.ControlFlow;

      const loopNode: ScopeNode = {
        id: `${filePath}:${startPos}-${endPos}`,
        kind: node.kind,
        category: category,
        label: determineNodeLabel(node, sf), // Use central labeler
        loc: {
          start: lineColOfPos(sf, startPos),
          end: lineColOfPos(sf, endPos),
        },
        source: fileText.substring(startPos, endPos),
        value: 1,
        meta: collectMeta(node, category, sf),
        children: [],
      };
      parentNodeInTree.children.push(loopNode);

      const statement = node.statement;
      if (ts.isBlock(statement)) {
        statement.statements.forEach((childStmt) =>
          walk(childStmt, loopNode, sf)
        );
      } else {
        walk(statement, loopNode, sf);
      }
      loopNode.label = formatScopeNodeLabel(loopNode); // Format label
      return;
    }
    // --- END: Special handling for ForStatement, ForOfStatement, ForInStatement ---
    let currentContainer = parentNodeInTree;
    const category = mapKindToCategory(node, sf);

    if (
      isScopeBoundary(node) ||
      category === NodeCategory.Variable ||
      category === NodeCategory.ReactHook ||
      category === NodeCategory.Call ||
      category === NodeCategory.JSX ||
      category === NodeCategory.JSXElementDOM ||
      category === NodeCategory.JSXElementCustom ||
      category === NodeCategory.Import ||
      category === NodeCategory.TypeAlias ||
      category === NodeCategory.Interface ||
      category === NodeCategory.ReturnStatement ||
      category === NodeCategory.Assignment ||
      (category === NodeCategory.ControlFlow &&
        !ts.isIfStatement(node) &&
        !ts.isTryStatement(node) &&
        !ts.isForStatement(node) &&
        !ts.isForOfStatement(node) &&
        !ts.isForInStatement(node) &&
        !ts.isCatchClause(node))
    ) {
      if (ts.isCatchClause(node)) {
        const startPos = node.getStart(sf, false);
        const endPos = node.getEnd();
        if (endPos === startPos) {
          ts.forEachChild(node, (child) => walk(child, currentContainer, sf));
          return;
        }
        const startLoc = lineColOfPos(sf, startPos);
        const endLoc = lineColOfPos(sf, endPos);
        const nodeSourceText = fileText.substring(startPos, endPos);
        const nodeId = `${filePath}:${startPos}-${endPos}`;
        const newNode: ScopeNode = {
          id: nodeId,
          kind: node.kind,
          category: category, // This is NodeCategory.ControlFlow for CatchClause
          label: determineNodeLabel(node, sf), // Use central labeler (will return "catch")
          loc: { start: startLoc, end: endLoc },
          source: nodeSourceText,
          value: 1,
          meta: collectMeta(node, category, sf),
          children: [],
        };
        if (node.block) {
          node.block.statements.forEach((stmt) => walk(stmt, newNode, sf));
        }
        newNode.label = formatScopeNodeLabel(newNode);
        parentNodeInTree.children.push(newNode);
        return;
      }
      const startPos = node.getStart(sf, false);
      const endPos = node.getEnd();

      if (endPos === startPos) {
        ts.forEachChild(node, (child) => walk(child, currentContainer, sf));
        return;
      }

      const startLoc = lineColOfPos(sf, startPos);
      const endLoc = lineColOfPos(sf, endPos);

      const nodeSourceText = fileText.substring(startPos, endPos);
      const nodeId = `${filePath}:${startPos}-${endPos}`;

      const newNode: ScopeNode = {
        id: nodeId,
        kind: node.kind,
        category: category,
        label: determineNodeLabel(node, sf), // Use central labeler
        loc: { start: startLoc, end: endLoc },
        source: nodeSourceText,
        value: 1,
        meta: collectMeta(node, category, sf),
        children: [],
      };

      newNode.label = formatScopeNodeLabel(newNode);
      parentNodeInTree.children.push(newNode);
      currentContainer = newNode;
    }

    ts.forEachChild(node, (child) => walk(child, currentContainer, sf));
  }

  ts.forEachChild(sourceFile, (child) => walk(child, root, sourceFile));

  let processedTree = root;

  processedTree = filterNodesByOptions(processedTree, mergedOptions);

  if (mergedOptions.flattenTree) {
    processedTree = flattenTree(processedTree, mergedOptions);
  }
  if (mergedOptions.createSyntheticGroups) {
    // Pass the sourceFile to createSyntheticGroups if determineNodeLabel might need it for labels of synthetic groups,
    // though currently synthetic group labels are hardcoded ("Imports", "Type defs").
    // If determineNodeLabel is enhanced for synthetic groups needing sourceFile context, this would be relevant.
    processedTree = createSyntheticGroups(processedTree, true, sourceFile);
  }

  // Calculate parent node values as sum of children recursively
  aggregateValuesPostOrder(processedTree);

  return processedTree;
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
    if (child) {
      // Guard against undefined children
      totalChildrenValue += aggregateValuesPostOrder(child);
    }
  }

  // Set parent's value to 1 (for itself) + sum of all children
  node.value = 1 + totalChildrenValue;
  return node.value;
}
