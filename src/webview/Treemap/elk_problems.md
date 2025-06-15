# Problems with ELK LAyout and Reference + Scope Graph

Review the problem description in this file and figure out how to fix it. Implement those fixes. I will update the MD and we'll iterate until things are completely solved. Place an empahsis on concise but well placed logs that will help spot problems. I will be pasting them back in here.

## Problems

- There are several references amongst nodes that are not really real.
- The <h2> is being targeted with two references, but its contents are static: `<h2 className="mb-4 text-xl font-semibold">Request Admin Access</h2>;`
- It seems that some simple string matching is being used -- or that the literal contents of the JSX are somehow being treated as variables?
- What's odd is that the h2 is matched to the file root and also the `verifyAccess.mutate` function -- neither of these is actually referenced.

## Test Scenario

With the treemap loaded for the code below, I `SHIFT + CLICK` on the `<Card>` scope.

```tsx
"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { api } from "~/trpc/react";

export const AdminAccessRequest = () => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const { update } = useSession();

  const verifyAccess = api.admin.verifyAdminAccess.useMutation({
    onSuccess: async () => {
      await update();
      router.refresh();
    },
    onError: (error) => {
      setError(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    verifyAccess.mutate({ password });
  };

  return (
    <Card className="mx-auto max-w-md p-6">
      <h2 className="mb-4 text-xl font-semibold">Request Admin Access</h2>
      <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
        <div>
          <Input
            type="password"
            placeholder="Enter admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" disabled={verifyAccess.isPending}>
          {verifyAccess.isPending ? "Verifying..." : "Verify Access"}
        </Button>
      </form>
    </Card>
  );
};
```

## Most recent logs

```
bundle.js:387541 🖱️ Mouse down at: 154 182
bundle.js:383890 ✅ No overlaps detected
bundle.js:383945 ✅ All nodes successfully rendered!
bundle.js:383890 ✅ No overlaps detected
bundle.js:383945 ✅ All nodes successfully rendered!
 🖱️ Mouse up, panning was: false
 ✅ Processing click action (no panning detected)
 🎯 ELK Reference Layout starting for: <Card> [36-52]
 🔬 Building semantic reference graph for: <Card> [36-52]
 🔬 Performing full semantic analysis on focus node
 🔬 Analyzing semantic references for: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:887-1546', label: '<Card> [36-52]'}
 📊 Found 0 internal declarations
 📤 Found 28 external references
 🔄 Found 0 internal references
 📥 Found 0 incoming references
 📊 Found 28 total references (28 external, 0 incoming, 0 recursive)
 🔍 Reference analysis: Request {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: Admin {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: Access {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: form {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
 🔍 Reference analysis: onSubmit {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
 🔍 Reference analysis: handleSubmit {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: className {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
 🔍 Reference analysis: autoComplete {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
 🔍 Reference analysis: placeholder {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
 🔍 Reference analysis: value {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
 🔍 Reference analysis: password {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: onChange {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
 🔍 Reference analysis: e {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
 🔍 Reference analysis: setPassword {type: 'function_call', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: setPassword {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: e {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
 🔍 Reference analysis: e {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
 🔍 Reference analysis: error {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: error {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis: disabled {type: 'variable_reference', isRelevantType: true, isGenericName: true, shouldInclude: false}
 🔍 Reference analysis: verifyAccess {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis:  {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: false}
 🔍 Reference analysis:  {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: false}
 🔍 Reference analysis:  {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: false}
 🔍 Reference analysis: verifyAccess {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: true}
 🔍 Reference analysis:  {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: false}
 🔍 Reference analysis:  {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: false}
 🔍 Reference analysis:  {type: 'variable_reference', isRelevantType: true, isGenericName: false, shouldInclude: false}
 🔍 Filtered to 11 most relevant references
 [REF_GRAPH] Prioritized references to resolve: (11) ['password', 'setPassword', 'error', 'error', 'setPassword', 'Request', 'Admin', 'Access', 'handleSubmit', 'verifyAccess', 'verifyAccess']
 [REF_GRAPH] Resolving reference: "password"
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx', label: 'AdminAccessRequest.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:332-1553', label: 'AdminAccessRequest [12-54]', category: 'Variable', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:353-1553', label: '() => {} [12-54]', category: 'ArrowFunction', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:369-407', label: '[password, setPassword] [13]', category: 'Variable', declares: false}
 [REF_GRAPH] Found 4 candidates for "password": (4) [{…}, {…}, {…}, {…}]
 [REF_GRAPH] Filtering to 4 declaration candidates for "password"
 [REF_GRAPH] Final chosen node for "password": {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:369-407', label: '[password, setPassword] [13]', category: 'Variable', size: 38}
 🔍 Selected node for password: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:369-407', label: '[password, setPassword] [13]', category: 'Variable'}
 [OFFSET_MATCH] {offset: 1205, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1104-1285', matchedLabel: '<Input> [40-45]'}
 [OFFSET_MATCH] {offset: 1205, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1104-1285', matchedLabel: '<Input> [40-45]'}
 [OFFSET_MATCH] {offset: 1205, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1104-1285', matchedLabel: '<Input> [40-45]'}
 [OFFSET_MATCH] {offset: 1205, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1104-1285', matchedLabel: '<Input> [40-45]'}
 [OFFSET_MATCH] {offset: 1205, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1104-1285', matchedLabel: '<Input> [40-45]'}
 [OFFSET_MATCH] {offset: 1205, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1104-1285', matchedLabel: '<Input> [40-45]'}
 [OFFSET_MATCH] {offset: 1205, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1104-1285', matchedLabel: '<Input> [40-45]'}
 [OFFSET_MATCH] {offset: 1205, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1104-1285', matchedLabel: '<Input> [40-45]'}
 [OFFSET_MATCH] {offset: 1205, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1104-1285', matchedLabel: '<Input> [40-45]'}
 [OFFSET_MATCH] {offset: 1205, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1104-1285', matchedLabel: '<Input> [40-45]'}
 [OFFSET_MATCH] {offset: 1205, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1104-1285', matchedLabel: '<Input> [40-45]'}
 [OFFSET_MATCH] {offset: 1205, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1104-1285', matchedLabel: '<Input> [40-45]'}
 [OFFSET_MATCH] {offset: 1205, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1104-1285', matchedLabel: '<Input> [40-45]'}
 [OFFSET_MATCH] {offset: 1205, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1104-1285', matchedLabel: '<Input> [40-45]'}
 [OFFSET_MATCH] {offset: 1205, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1104-1285', matchedLabel: '<Input> [40-45]'}
 [OFFSET_MATCH] {offset: 1205, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1104-1285', matchedLabel: '<Input> [40-45]'}
 [REF_GRAPH] Resolving reference: "setPassword"
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx', label: 'AdminAccessRequest.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:332-1553', label: 'AdminAccessRequest [12-54]', category: 'Variable', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:353-1553', label: '() => {} [12-54]', category: 'ArrowFunction', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:369-407', label: '[password, setPassword] [13]', category: 'Variable', declares: false}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1244-1271', label: 'setPassword [44]', category: 'Call', declares: false}
 [REF_GRAPH] Found 5 candidates for "setPassword": (5) [{…}, {…}, {…}, {…}, {…}]
 [REF_GRAPH] Filtering to 4 declaration candidates for "setPassword"
 [REF_GRAPH] Final chosen node for "setPassword": {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:369-407', label: '[password, setPassword] [13]', category: 'Variable', size: 38}
 🔍 Selected node for setPassword: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:369-407', label: '[password, setPassword] [13]', category: 'Variable'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx', label: 'AdminAccessRequest.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:332-1553', label: 'AdminAccessRequest [12-54]', category: 'Variable', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:353-1553', label: '() => {} [12-54]', category: 'ArrowFunction', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:417-449', label: '[error, setError] [14]', category: 'Variable', declares: false}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:526-733', label: 'verifyAccess [19-27]', category: 'Variable', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:541-733', label: 'api.admin.verifyAdminAccess.useMutation [19-27]', category: 'ReactHook', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:678-727', label: '() => {} [24-26]', category: 'ArrowFunction', declares: true}
 [REF_GRAPH] Filtering to 7 declaration candidates for "error"
 [REF_GRAPH] Final chosen node for "error": {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:417-449', label: '[error, setError] [14]', category: 'Variable', size: 32}
 🔍 Selected node for error: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:417-449', label: '[error, setError] [14]', category: 'Variable'}
 [OFFSET_MATCH] {offset: 1310, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534', matchedLabel: '<form> [38-51]'}
 [OFFSET_MATCH] {offset: 1310, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534', matchedLabel: '<form> [38-51]'}
 [OFFSET_MATCH] {offset: 1310, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534', matchedLabel: '<form> [38-51]'}
 [OFFSET_MATCH] {offset: 1310, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534', matchedLabel: '<form> [38-51]'}
 [OFFSET_MATCH] {offset: 1310, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534', matchedLabel: '<form> [38-51]'}
 [OFFSET_MATCH] {offset: 1310, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534', matchedLabel: '<form> [38-51]'}
 [OFFSET_MATCH] {offset: 1310, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534', matchedLabel: '<form> [38-51]'}
 [OFFSET_MATCH] {offset: 1310, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534', matchedLabel: '<form> [38-51]'}
 [OFFSET_MATCH] {offset: 1310, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534', matchedLabel: '<form> [38-51]'}
 [OFFSET_MATCH] {offset: 1310, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534', matchedLabel: '<form> [38-51]'}
 [OFFSET_MATCH] {offset: 1310, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534', matchedLabel: '<form> [38-51]'}
 [OFFSET_MATCH] {offset: 1310, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534', matchedLabel: '<form> [38-51]'}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx', label: 'AdminAccessRequest.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:332-1553', label: 'AdminAccessRequest [12-54]', category: 'Variable', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:353-1553', label: '() => {} [12-54]', category: 'ArrowFunction', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:417-449', label: '[error, setError] [14]', category: 'Variable', declares: false}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:526-733', label: 'verifyAccess [19-27]', category: 'Variable', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:541-733', label: 'api.admin.verifyAdminAccess.useMutation [19-27]', category: 'ReactHook', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:678-727', label: '() => {} [24-26]', category: 'ArrowFunction', declares: true}
 [REF_GRAPH] Filtering to 7 declaration candidates for "error"
 [REF_GRAPH] Final chosen node for "error": {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:417-449', label: '[error, setError] [14]', category: 'Variable', size: 32}
 🔍 Selected node for error: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:417-449', label: '[error, setError] [14]', category: 'Variable'}
 [OFFSET_MATCH] {offset: 1356, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1319-1366', matchedLabel: '<p> [47]'}
 [OFFSET_MATCH] {offset: 1356, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1319-1366', matchedLabel: '<p> [47]'}
 [OFFSET_MATCH] {offset: 1356, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1319-1366', matchedLabel: '<p> [47]'}
 [OFFSET_MATCH] {offset: 1356, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1319-1366', matchedLabel: '<p> [47]'}
 [OFFSET_MATCH] {offset: 1356, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1319-1366', matchedLabel: '<p> [47]'}
 [OFFSET_MATCH] {offset: 1356, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1319-1366', matchedLabel: '<p> [47]'}
 [OFFSET_MATCH] {offset: 1356, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1319-1366', matchedLabel: '<p> [47]'}
 [OFFSET_MATCH] {offset: 1356, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1319-1366', matchedLabel: '<p> [47]'}
 [OFFSET_MATCH] {offset: 1356, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1319-1366', matchedLabel: '<p> [47]'}
 [OFFSET_MATCH] {offset: 1356, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1319-1366', matchedLabel: '<p> [47]'}
 [OFFSET_MATCH] {offset: 1356, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1319-1366', matchedLabel: '<p> [47]'}
 [OFFSET_MATCH] {offset: 1356, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1319-1366', matchedLabel: '<p> [47]'}
 [OFFSET_MATCH] {offset: 1356, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1319-1366', matchedLabel: '<p> [47]'}
 [OFFSET_MATCH] {offset: 1356, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1319-1366', matchedLabel: '<p> [47]'}
 [REF_GRAPH] Resolving reference: "setPassword"
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx', label: 'AdminAccessRequest.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:332-1553', label: 'AdminAccessRequest [12-54]', category: 'Variable', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:353-1553', label: '() => {} [12-54]', category: 'ArrowFunction', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:369-407', label: '[password, setPassword] [13]', category: 'Variable', declares: false}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1244-1271', label: 'setPassword [44]', category: 'Call', declares: false}
 [REF_GRAPH] Found 5 candidates for "setPassword": (5) [{…}, {…}, {…}, {…}, {…}]
 [REF_GRAPH] Filtering to 4 declaration candidates for "setPassword"
 [REF_GRAPH] Final chosen node for "setPassword": {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:369-407', label: '[password, setPassword] [13]', category: 'Variable', size: 38}
 🔍 Selected node for setPassword: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:369-407', label: '[password, setPassword] [13]', category: 'Variable'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
 [OFFSET_MATCH] {offset: 1243, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', matchedLabel: '() => {} [44]'}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx', label: 'AdminAccessRequest.tsx', category: 'Program', declares: false}
 [REF_GRAPH] Final chosen node for "Request": {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx', label: 'AdminAccessRequest.tsx', category: 'Program', size: Infinity}
 🔍 Selected node for Request: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx', label: 'AdminAccessRequest.tsx', category: 'Program'}
 [OFFSET_MATCH] {offset: 976, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001', matchedLabel: '<h2> [37]'}
 [OFFSET_MATCH] {offset: 976, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001', matchedLabel: '<h2> [37]'}
 [OFFSET_MATCH] {offset: 976, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001', matchedLabel: '<h2> [37]'}
 [OFFSET_MATCH] {offset: 976, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001', matchedLabel: '<h2> [37]'}
 [OFFSET_MATCH] {offset: 976, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001', matchedLabel: '<h2> [37]'}
 [OFFSET_MATCH] {offset: 976, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001', matchedLabel: '<h2> [37]'}
 [OFFSET_MATCH] {offset: 976, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001', matchedLabel: '<h2> [37]'}
 [OFFSET_MATCH] {offset: 976, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001', matchedLabel: '<h2> [37]'}
 [OFFSET_MATCH] {offset: 976, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001', matchedLabel: '<h2> [37]'}
 [OFFSET_MATCH] {offset: 976, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001', matchedLabel: '<h2> [37]'}
 [OFFSET_MATCH] {offset: 976, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001', matchedLabel: '<h2> [37]'}
 [OFFSET_MATCH] {offset: 976, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001', matchedLabel: '<h2> [37]'}
 ⚠️ No matching nodes found for reference: Admin
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:541-733', label: 'api.admin.verifyAdminAccess.useMutation [19-27]', category: 'ReactHook', declares: false}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:831-864', label: 'verifyAccess.mutate [32]', category: 'Call', declares: false}
 [REF_GRAPH] Final chosen node for "Access": {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:831-864', label: 'verifyAccess.mutate [32]', category: 'Call', size: 33}
 🔍 Selected node for Access: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:831-864', label: 'verifyAccess.mutate [32]', category: 'Call'}
 [OFFSET_MATCH] {offset: 989, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001', matchedLabel: '<h2> [37]'}
 [OFFSET_MATCH] {offset: 989, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001', matchedLabel: '<h2> [37]'}
 [OFFSET_MATCH] {offset: 989, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001', matchedLabel: '<h2> [37]'}
 [OFFSET_MATCH] {offset: 989, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001', matchedLabel: '<h2> [37]'}
 [OFFSET_MATCH] {offset: 989, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001', matchedLabel: '<h2> [37]'}
 [OFFSET_MATCH] {offset: 989, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001', matchedLabel: '<h2> [37]'}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx', label: 'AdminAccessRequest.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:332-1553', label: 'AdminAccessRequest [12-54]', category: 'Variable', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:353-1553', label: '() => {} [12-54]', category: 'ArrowFunction', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:744-869', label: 'handleSubmit [29-33]', category: 'Variable', declares: false}
 [REF_GRAPH] Filtering to 4 declaration candidates for "handleSubmit"
 [REF_GRAPH] Final chosen node for "handleSubmit": {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:744-869', label: 'handleSubmit [29-33]', category: 'Variable', size: 125}
 🔍 Selected node for handleSubmit: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:744-869', label: 'handleSubmit [29-33]', category: 'Variable'}
 [OFFSET_MATCH] {offset: 1024, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534', matchedLabel: '<form> [38-51]'}
 [OFFSET_MATCH] {offset: 1024, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534', matchedLabel: '<form> [38-51]'}
 [OFFSET_MATCH] {offset: 1024, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534', matchedLabel: '<form> [38-51]'}
 [OFFSET_MATCH] {offset: 1024, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534', matchedLabel: '<form> [38-51]'}
 [OFFSET_MATCH] {offset: 1024, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534', matchedLabel: '<form> [38-51]'}
 [OFFSET_MATCH] {offset: 1024, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534', matchedLabel: '<form> [38-51]'}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx', label: 'AdminAccessRequest.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:332-1553', label: 'AdminAccessRequest [12-54]', category: 'Variable', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:353-1553', label: '() => {} [12-54]', category: 'ArrowFunction', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:526-733', label: 'verifyAccess [19-27]', category: 'Variable', declares: false}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:831-864', label: 'verifyAccess.mutate [32]', category: 'Call', declares: false}
 [REF_GRAPH] Filtering to 4 declaration candidates for "verifyAccess"
 [REF_GRAPH] Final chosen node for "verifyAccess": {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:526-733', label: 'verifyAccess [19-27]', category: 'Variable', size: 207}
 🔍 Selected node for verifyAccess: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:526-733', label: 'verifyAccess [19-27]', category: 'Variable'}
 [OFFSET_MATCH] {offset: 1408, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520', matchedLabel: '<Button> [48-50]'}
 [OFFSET_MATCH] {offset: 1408, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520', matchedLabel: '<Button> [48-50]'}
 [OFFSET_MATCH] {offset: 1408, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520', matchedLabel: '<Button> [48-50]'}
 [OFFSET_MATCH] {offset: 1408, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520', matchedLabel: '<Button> [48-50]'}
 [OFFSET_MATCH] {offset: 1408, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520', matchedLabel: '<Button> [48-50]'}
 [OFFSET_MATCH] {offset: 1408, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520', matchedLabel: '<Button> [48-50]'}
 [OFFSET_MATCH] {offset: 1408, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520', matchedLabel: '<Button> [48-50]'}
 [OFFSET_MATCH] {offset: 1408, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520', matchedLabel: '<Button> [48-50]'}
 [OFFSET_MATCH] {offset: 1408, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520', matchedLabel: '<Button> [48-50]'}
 [OFFSET_MATCH] {offset: 1408, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520', matchedLabel: '<Button> [48-50]'}
 [OFFSET_MATCH] {offset: 1408, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520', matchedLabel: '<Button> [48-50]'}
 [OFFSET_MATCH] {offset: 1408, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520', matchedLabel: '<Button> [48-50]'}
 [OFFSET_MATCH] {offset: 1408, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520', matchedLabel: '<Button> [48-50]'}
 [OFFSET_MATCH] {offset: 1408, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520', matchedLabel: '<Button> [48-50]'}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx', label: 'AdminAccessRequest.tsx', category: 'Program', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:332-1553', label: 'AdminAccessRequest [12-54]', category: 'Variable', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:353-1553', label: '() => {} [12-54]', category: 'ArrowFunction', declares: true}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:526-733', label: 'verifyAccess [19-27]', category: 'Variable', declares: false}
   🔎 candidate ➜ {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:831-864', label: 'verifyAccess.mutate [32]', category: 'Call', declares: false}
 [REF_GRAPH] Filtering to 4 declaration candidates for "verifyAccess"
 [REF_GRAPH] Final chosen node for "verifyAccess": {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:526-733', label: 'verifyAccess [19-27]', category: 'Variable', size: 207}
 🔍 Selected node for verifyAccess: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:526-733', label: 'verifyAccess [19-27]', category: 'Variable'}
 [OFFSET_MATCH] {offset: 1444, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520', matchedLabel: '<Button> [48-50]'}
 [OFFSET_MATCH] {offset: 1444, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520', matchedLabel: '<Button> [48-50]'}
 [OFFSET_MATCH] {offset: 1444, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520', matchedLabel: '<Button> [48-50]'}
 [OFFSET_MATCH] {offset: 1444, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520', matchedLabel: '<Button> [48-50]'}
 [OFFSET_MATCH] {offset: 1444, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520', matchedLabel: '<Button> [48-50]'}
 [OFFSET_MATCH] {offset: 1444, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520', matchedLabel: '<Button> [48-50]'}
 [OFFSET_MATCH] {offset: 1444, matchedNodeId: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520', matchedLabel: '<Button> [48-50]'}
 ✅ Reference graph built: 13 nodes, 10 references
 📋 Nodes to be included in reference graph:
   1. /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:887-1546 (<Card> [36-52])
   2. /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:369-407 ([password, setPassword] [13])
   3. /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1104-1285 (<Input> [40-45])
   4. /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271 (() => {} [44])
   5. /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:417-449 ([error, setError] [14])
   6. /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534 (<form> [38-51])
   7. /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1319-1366 (<p> [47])
   8. /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx (AdminAccessRequest.tsx)
bundle.js:386884   9. /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001 (<h2> [37])
bundle.js:386884   10. /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:831-864 (verifyAccess.mutate [32])
bundle.js:386884   11. /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:744-869 (handleSubmit [29-33])
bundle.js:386884   12. /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:526-733 (verifyAccess [19-27])
bundle.js:386884   13. /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520 (<Button> [48-50])
bundle.js:386566 🏗️ Building hierarchical structure for layout
bundle.js:386574 🔍 Common ancestor found: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx', label: 'AdminAccessRequest.tsx', targetNodes: 13}
bundle.js:386591 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:369-407 ([password, setPassword] [13])
bundle.js:386591 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:417-449 ([error, setError] [14])
bundle.js:386591 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:526-733 (verifyAccess [19-27])
bundle.js:386591 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:831-864 (verifyAccess.mutate [32])
bundle.js:386591 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:759-869 (() => {} [29-33])
bundle.js:386591 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:744-869 (handleSubmit [29-33])
bundle.js:386591 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001 (<h2> [37])
bundle.js:386591 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271 (() => {} [44])
bundle.js:386591 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1104-1285 (<Input> [40-45])
bundle.js:386591 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1088-1300 (<div> [39-46])
bundle.js:386591 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1319-1366 (<p> [47])
bundle.js:386591 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520 (<Button> [48-50])
bundle.js:386591 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534 (<form> [38-51])
bundle.js:386591 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:887-1546 (<Card> [36-52])
bundle.js:386591 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:874-1551 (return (
    <Card className="mx-auto... [35-53])
bundle.js:386591 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:353-1553 (() => {} [12-54])
bundle.js:386591 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:332-1553 (AdminAccessRequest [12-54])
bundle.js:386591 📦 Including node in hierarchy: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx (AdminAccessRequest.tsx)
bundle.js:386973 🔍 Param decision for password: cat=Variable => skip
bundle.js:386973 🔍 Param decision for setPassword: cat=Variable => skip
2bundle.js:386973 🔍 Param decision for error: cat=Variable => skip
bundle.js:386973 🔍 Param decision for Request: cat=Program => skip
bundle.js:386973 🔍 Param decision for Access: cat=Call => skip
bundle.js:386973 🔍 Param decision for handleSubmit: cat=Variable => skip
2bundle.js:386973 🔍 Param decision for verifyAccess: cat=Variable => skip
bundle.js:386979 📊 Reference graph: {nodes: 13, references: 10, syntheticParams: 0}
bundle.js:386613 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx', label: 'AdminAccessRequest.tsx', isTarget: true, hasChildren: true}
bundle.js:386613 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:332-1553', label: 'AdminAccessRequest [12-54]', isTarget: false, hasChildren: true}
bundle.js:386613 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:353-1553', label: '() => {} [12-54]', isTarget: false, hasChildren: true}
bundle.js:386613 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:369-407', label: '[password, setPassword] [13]', isTarget: true, hasChildren: false}
bundle.js:386659   ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:369-407 (244x60, children: 0)
bundle.js:386613 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:417-449', label: '[error, setError] [14]', isTarget: true, hasChildren: false}
bundle.js:386659   ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:417-449 (196x60, children: 0)
bundle.js:386613 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:526-733', label: 'verifyAccess [19-27]', isTarget: true, hasChildren: false}
bundle.js:386659   ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:526-733 (180x60, children: 0)
bundle.js:386613 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:744-869', label: 'handleSubmit [29-33]', isTarget: true, hasChildren: true}
bundle.js:386613 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:759-869', label: '() => {} [29-33]', isTarget: false, hasChildren: true}
bundle.js:386613 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:831-864', label: 'verifyAccess.mutate [32]', isTarget: true, hasChildren: false}
bundle.js:386659   ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:831-864 (212x60, children: 0)
bundle.js:386648   📦 Node /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:759-869 has 1 children in hierarchy
bundle.js:386659   ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:759-869 (200x120, children: 1)
bundle.js:386648   📦 Node /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:744-869 has 1 children in hierarchy
bundle.js:386659   ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:744-869 (200x120, children: 1)
bundle.js:386613 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:874-1551', label: 'return (\n    <Card className="mx-auto... [35-53]', isTarget: false, hasChildren: true}
bundle.js:386613 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:887-1546', label: '<Card> [36-52]', isTarget: true, hasChildren: true}
bundle.js:386613 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001', label: '<h2> [37]', isTarget: true, hasChildren: false}
bundle.js:386659   ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001 (120x60, children: 0)
bundle.js:386613 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534', label: '<form> [38-51]', isTarget: true, hasChildren: true}
bundle.js:386613 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1088-1300', label: '<div> [39-46]', isTarget: false, hasChildren: true}
bundle.js:386613 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1104-1285', label: '<Input> [40-45]', isTarget: true, hasChildren: true}
bundle.js:386613 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271', label: '() => {} [44]', isTarget: true, hasChildren: false}
bundle.js:386659   ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271 (124x60, children: 0)
bundle.js:386648   📦 Node /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1104-1285 has 1 children in hierarchy
bundle.js:386659   ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1104-1285 (200x120, children: 1)
bundle.js:386648   📦 Node /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1088-1300 has 1 children in hierarchy
bundle.js:386659   ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1088-1300 (200x120, children: 1)
bundle.js:386613 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1319-1366', label: '<p> [47]', isTarget: true, hasChildren: false}
bundle.js:386659   ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1319-1366 (120x60, children: 0)
bundle.js:386613 🔄 Converting hierarchical node to ELK format: {id: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520', label: '<Button> [48-50]', isTarget: true, hasChildren: false}
bundle.js:386659   ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520 (148x60, children: 0)
bundle.js:386648   📦 Node /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534 has 3 children in hierarchy
bundle.js:386659   ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534 (200x120, children: 3)
bundle.js:386648   📦 Node /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:887-1546 has 2 children in hierarchy
bundle.js:386659   ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:887-1546 (200x120, children: 2)
bundle.js:386648   📦 Node /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:874-1551 has 1 children in hierarchy
bundle.js:386659   ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:874-1551 (424x120, children: 1)
bundle.js:386648   📦 Node /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:353-1553 has 5 children in hierarchy
bundle.js:386659   ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:353-1553 (200x120, children: 5)
bundle.js:386648   📦 Node /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:332-1553 has 1 children in hierarchy
bundle.js:386659   ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:332-1553 (248x120, children: 1)
bundle.js:386648   📦 Node /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx has 1 children in hierarchy
bundle.js:386659   ✅ ELK hierarchical node created: /Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx (216x120, children: 1)
bundle.js:387047 [EDGE_BUILD] {ref: 'password', dir: 'outgoing', src: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:369-407', tgt: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1104-1285'}
bundle.js:387047 [EDGE_BUILD] {ref: 'setPassword', dir: 'outgoing', src: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:369-407', tgt: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271'}
bundle.js:387047 [EDGE_BUILD] {ref: 'error', dir: 'outgoing', src: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:417-449', tgt: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534'}
bundle.js:387047 [EDGE_BUILD] {ref: 'error', dir: 'outgoing', src: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:417-449', tgt: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1319-1366'}
bundle.js:387047 [EDGE_BUILD] {ref: 'setPassword', dir: 'outgoing', src: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:369-407', tgt: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1237-1271'}
bundle.js:387047 [EDGE_BUILD] {ref: 'Request', dir: 'outgoing', src: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx', tgt: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001'}
bundle.js:387047 [EDGE_BUILD] {ref: 'Access', dir: 'outgoing', src: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:831-864', tgt: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:933-1001'}
bundle.js:387047 [EDGE_BUILD] {ref: 'handleSubmit', dir: 'outgoing', src: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:744-869', tgt: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1008-1534'}
bundle.js:387047 [EDGE_BUILD] {ref: 'verifyAccess', dir: 'outgoing', src: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:526-733', tgt: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520'}
bundle.js:387047 [EDGE_BUILD] {ref: 'verifyAccess', dir: 'outgoing', src: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:526-733', tgt: '/Users/byronwall/Projects/tasks-trpc/src/components/admin/AdminAccessRequest.tsx:1376-1520'}
bundle.js:387063 🔗 Created 10 edges out of 10 references
bundle.js:387089 🚀 Running ELK layout algorithm...
bundle.js:383890 ✅ No overlaps detected
bundle.js:383945 ✅ All nodes successfully rendered!
bundle.js:383890 ✅ No overlaps detected
bundle.js:383945 ✅ All nodes successfully rendered!
bundle.js:387092 ✅ ELK layout completed successfully
bundle.js:387111 📍 Layout complete with 1 top-level nodes
bundle.js:387127 🎉 ELK layout complete: {nodes: 1, edges: 10}
bundle.js:383890 ✅ No overlaps detected
bundle.js:383945 ✅ All nodes successfully rendered!
bundle.js:383890 ✅ No overlaps detected
bundle.js:383945 ✅ All nodes successfully rendered!
bundle.js:385351 🎨 Rendering ELK graph: {childrenCount: 1, edgesCount: 10}
bundle.js:385351 🎨 Rendering ELK graph: {childrenCount: 1, edgesCount: 10}
bundle.js:383890 ✅ No overlaps detected
bundle.js:383945 ✅ All nodes successfully rendered!
bundle.js:383890 ✅ No overlaps detected
bundle.js:383945 ✅ All nodes successfully rendered!
bundle.js:385351 🎨 Rendering ELK graph: {childrenCount: 1, edgesCount: 10}
bundle.js:385351 🎨 Rendering ELK graph: {childrenCount: 1, edgesCount: 10}
bundle.js:387497 ⏰ ELK layout timed out after 5 seconds
(anonymous) @ bundle.js:387497
setTimeout
(anonymous) @ bundle.js:387496
handleNodeClick @ bundle.js:387495
onClick @ bundle.js:385000
callCallback2 @ bundle.js:5593
invokeGuardedCallbackDev @ bundle.js:5618
invokeGuardedCallback @ bundle.js:5652
invokeGuardedCallbackAndCatchFirstError @ bundle.js:5655
executeDispatch @ bundle.js:8959
processDispatchQueueItemsInOrder @ bundle.js:8979
processDispatchQueue @ bundle.js:8988
dispatchEventsForPlugins @ bundle.js:8996
(anonymous) @ bundle.js:9119
batchedUpdates$1 @ bundle.js:20879
batchedUpdates @ bundle.js:5498
dispatchEventForPluginEventSystem @ bundle.js:9118
dispatchEventWithEnableCapturePhaseSelectiveHydrationWithoutDiscreteEventReplay @ bundle.js:7397
dispatchEvent @ bundle.js:7391
dispatchDiscreteEvent @ bundle.js:7368
```
