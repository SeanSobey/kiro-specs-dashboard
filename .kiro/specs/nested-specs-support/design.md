# Nested Specs Support Bugfix Design

## Overview

The `SpecScanner` only discovers spec directories that are immediate children of `.kiro/specs/`, silently ignoring any specs nested inside grouping folders. The `SpecFile` interface has no concept of grouping, the dashboard renders a flat list, and the `.kiro/specs/` path is hardcoded with no user configuration. This fix introduces recursive directory traversal, a `group` field on `SpecFile`, a configurable `specDirectories` extension setting, and grouped rendering in the dashboard webview.

## Glossary

- **Bug_Condition (C)**: A spec directory (containing `tasks.md`) exists at depth > 1 under a spec root, OR the user has configured custom spec directories via settings — in both cases the scanner fails to discover the spec
- **Property (P)**: Every directory containing `tasks.md` at any depth under any configured spec root is discovered, assigned the correct `group` field, and rendered in the dashboard grouped by that field
- **Preservation**: Flat specs (immediate children of `.kiro/specs/`), file parsing, error handling, debounced refresh, and default behavior when no setting is configured must remain unchanged
- **scanWorkspace()**: The method in `src/specScanner.ts` that iterates workspace folders and discovers spec directories
- **parseSpecDirectory()**: The method in `src/specScanner.ts` that reads `tasks.md`, `requirements.md`, `design.md` and builds a `SpecFile`
- **specRoot**: A configured base directory (e.g., `.kiro/specs/`) under which spec directories are discovered recursively
- **group**: The relative path from the spec root to the spec's parent directory (e.g., `auth` for `.kiro/specs/auth/login-feature/`)

## Bug Details

### Bug Condition

The bug manifests when a spec directory containing `tasks.md` is nested more than one level deep under `.kiro/specs/`, or when specs exist in a directory other than `.kiro/specs/`. The `scanWorkspace()` method calls `readDirectory()` only on the immediate `.kiro/specs/` path and passes each entry to `parseSpecDirectory()` without recursing. Grouping directories (those without `tasks.md` but with child spec directories) are attempted as specs, fail, and their children are never inspected.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { specPath: string, specRoots: string[] }
  OUTPUT: boolean

  LET containsTasksMd = fileExists(join(input.specPath, "tasks.md"))
  LET depth = relativeDepth(nearestSpecRoot(input.specPath, input.specRoots), input.specPath)
  LET isInConfiguredRoot = ANY root IN input.specRoots: isDescendant(input.specPath, root)
  LET isInDefaultRoot = isDescendant(input.specPath, ".kiro/specs/")

  RETURN containsTasksMd
         AND (depth > 1 OR (isInConfiguredRoot AND NOT isInDefaultRoot))
         AND NOT specIsDiscovered(input.specPath)
END FUNCTION
```

### Examples

- `.kiro/specs/auth/login-feature/tasks.md` exists → expected: discovered with `group = "auth"` → actual: not discovered (depth 2, scanner only reads depth 1)
- `.kiro/specs/backend/api/rate-limiting/tasks.md` exists → expected: discovered with `group = "backend/api"` → actual: not discovered (depth 3)
- `.kiro/specs/auth/` has no `tasks.md` but has child `login-feature/` → expected: `auth/` recursed into → actual: `auth/` attempted as spec, returns null, children ignored
- `docs/specs/my-feature/tasks.md` with setting `specDirectories: ["docs/specs"]` → expected: discovered → actual: not discovered (scanner only checks `.kiro/specs/`)
- `.kiro/specs/flat-spec/tasks.md` (depth 1) → expected: discovered with `group = undefined` → actual: discovered correctly (this is the non-buggy case)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Flat specs (immediate children of `.kiro/specs/`) must continue to be discovered with no group designation
- `tasks.md`, `requirements.md`, and `design.md` must continue to be parsed correctly regardless of nesting depth
- Missing `.kiro/specs/` directories must continue to be handled gracefully without errors
- Spec parse errors must continue to be logged without crashing the scanner
- File watcher must continue to trigger debounced dashboard refresh on `.md` file changes
- When `kiroSpecsDashboard.specDirectories` is absent from settings, `.kiro/specs/` must remain the default

**Scope:**
All inputs that do NOT involve nested spec directories or custom spec directory configuration should be completely unaffected by this fix. This includes:
- Flat spec discovery and parsing
- Task checkbox toggling
- Dashboard state persistence and restoration
- Velocity data tracking and analytics
- Execution profile management
- Notes functionality
- Multi-root workspace folder handling

## Hypothesized Root Cause

Based on the bug description and code analysis, the issues are:

1. **Single-level readDirectory in scanWorkspace()**: `specScanner.ts` line ~50 calls `vscode.workspace.fs.readDirectory(specsPath)` and iterates entries at depth 1 only. Each `FileType.Directory` entry is passed directly to `parseSpecDirectory()`. There is no recursive descent — if a directory doesn't contain `tasks.md`, it's skipped entirely.

2. **No spec-directory detection heuristic**: `parseSpecDirectory()` assumes every directory under `.kiro/specs/` is a spec directory. It tries to read `tasks.md` and returns null if missing. It never considers that a directory might be a grouping folder containing child spec directories.

3. **Missing `group` field on SpecFile**: The `SpecFile` interface in `types.ts` has `name` and `path` but no field to represent the hierarchical position of a spec within its spec root.

4. **Hardcoded spec root path**: `scanWorkspace()` constructs `specsPath` as `folder.uri + '.kiro/specs'` with no mechanism to override. The file watcher in `extension.ts` uses the glob `**/.kiro/specs/**/*.md` which is also hardcoded.

5. **Flat rendering in dashboard**: `dashboard.html` renders `specs` as a flat `<ul>` list with no grouping logic. There is no code to aggregate specs by group or render collapsible headers.

## Correctness Properties

Property 1: Bug Condition - Recursive Spec Discovery

_For any_ directory tree where a `tasks.md` file exists at any depth under a configured spec root, the fixed `scanWorkspace()` function SHALL discover that directory as a spec and include it in the returned `SpecFile[]` array with the correct `name`, `path`, and `group` fields.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Flat Spec Behavior Unchanged

_For any_ spec directory that is an immediate child of `.kiro/specs/` (depth 1), the fixed `scanWorkspace()` function SHALL produce the same `SpecFile` result as the original function (with `group` being `undefined` or empty string), preserving all existing flat spec discovery, parsing, and task statistics.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

Property 3: Bug Condition - Custom Spec Directories

_For any_ configuration where `kiroSpecsDashboard.specDirectories` contains one or more directory paths, the fixed scanner SHALL scan each configured directory recursively for spec directories, and the file watcher SHALL monitor all configured directories for `.md` file changes.

**Validates: Requirements 2.5, 2.7, 2.8**

Property 4: Preservation - Default Directory Fallback

_For any_ configuration where `kiroSpecsDashboard.specDirectories` is absent, empty, or not set, the fixed scanner SHALL default to scanning `.kiro/specs/` and the file watcher SHALL default to watching `**/.kiro/specs/**/*.md`, producing identical behavior to the original code.

**Validates: Requirements 2.6, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/types.ts`

**Interface**: `SpecFile`

**Specific Changes**:
1. **Add `group` field**: Add `group?: string` to the `SpecFile` interface representing the relative path from the spec root to the spec's parent directory. Empty/undefined for flat specs.

---

**File**: `src/specScanner.ts`

**Class**: `SpecScanner`

**Specific Changes**:
1. **Add `specDirectories` parameter to `scanWorkspace()`**: Accept an optional `string[]` parameter for configured spec directories, defaulting to `['.kiro/specs']`.
2. **Replace single-level readDirectory with recursive traversal**: Implement a `scanDirectoryRecursive()` private method that:
   - Reads directory entries
   - For each subdirectory, checks if it contains `tasks.md`
   - If yes: parse it as a spec directory, computing the `group` from the relative path between the spec root and the spec's parent
   - If no: recurse into it to find nested spec directories
3. **Compute `group` field**: For each discovered spec, calculate the relative path from the spec root to the spec's parent directory. For `.kiro/specs/auth/login-feature/`, the group is `auth`. For `.kiro/specs/flat-spec/`, the group is `undefined`.
4. **Update `parseSpecDirectory()` signature**: Accept the spec root URI so the group can be computed as a relative path.

---

**File**: `package.json`

**Section**: `contributes.configuration.properties`

**Specific Changes**:
1. **Add `kiroSpecsDashboard.specDirectories` setting**: Type `array` of `string`, default `[".kiro/specs"]`, description explaining it configures which directories are scanned for specs.

---

**File**: `src/extension.ts`

**Function**: `activate()`

**Specific Changes**:
1. **Read `specDirectories` setting**: Read `kiroSpecsDashboard.specDirectories` from workspace configuration at activation.
2. **Pass directories to scanner**: Pass the configured directories to `scanWorkspace()` and to the `SpecsDashboardProvider`.
3. **Create dynamic file watchers**: Instead of a single hardcoded glob watcher, create watchers for each configured directory pattern (e.g., `**/docs/specs/**/*.md`).
4. **Listen for configuration changes**: Register `vscode.workspace.onDidChangeConfiguration` listener that detects changes to `kiroSpecsDashboard.specDirectories`, disposes old watchers, creates new watchers, and triggers a dashboard refresh.

---

**File**: `src/specsDashboardProvider.ts`

**Class**: `SpecsDashboardProvider`

**Specific Changes**:
1. **Accept and store spec directories**: Store the configured spec directories and pass them to `scanner.scanWorkspace()` in `loadSpecs()`.
2. **Expose method to update spec directories**: Add a method to update the stored directories when the setting changes at runtime.

---

**File**: `src/webview/dashboard.html`

**Section**: Spec list rendering JavaScript

**Specific Changes**:
1. **Group specs by `group` field**: Before rendering, aggregate specs into groups. Specs with no group go into a default/ungrouped section.
2. **Render collapsible group headers**: For each group, render a clickable header that toggles visibility of the group's specs. Use a codicon chevron for expand/collapse state.
3. **Preserve flat rendering for ungrouped specs**: Specs without a group render exactly as before, at the top level.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that create nested directory structures using mocked `vscode.workspace.fs` and call `scanWorkspace()` on the UNFIXED code to observe that nested specs are not discovered.

**Test Cases**:
1. **Depth-2 Spec Test**: Create `.kiro/specs/auth/login-feature/tasks.md` and call `scanWorkspace()` — expect it to NOT be found on unfixed code (will fail on unfixed code)
2. **Depth-3 Spec Test**: Create `.kiro/specs/backend/api/rate-limiting/tasks.md` and call `scanWorkspace()` — expect it to NOT be found (will fail on unfixed code)
3. **Grouping Directory Test**: Create `.kiro/specs/auth/` with no `tasks.md` but with child `login-feature/tasks.md` — expect `auth/` to be skipped and child not found (will fail on unfixed code)
4. **Custom Directory Test**: Create `docs/specs/my-feature/tasks.md` with setting `specDirectories: ["docs/specs"]` — expect it to NOT be found (will fail on unfixed code)

**Expected Counterexamples**:
- `scanWorkspace()` returns an empty array or array missing the nested specs
- Possible causes: single-level `readDirectory`, no recursion into grouping directories, hardcoded `.kiro/specs/` path

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := scanWorkspace_fixed(input.specRoots)
  LET spec = findSpec(result, input.specPath)
  ASSERT spec IS NOT NULL
  ASSERT spec.group = expectedGroup(input.specPath, input.specRoots)
  ASSERT spec.totalTasks >= 0
  ASSERT spec.tasksContent IS NOT NULL
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT scanWorkspace_original(input) = scanWorkspace_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many directory tree configurations automatically
- It catches edge cases like empty directories, deeply nested structures, and mixed flat/nested layouts
- It provides strong guarantees that flat spec behavior is unchanged

**Test Plan**: Observe behavior on UNFIXED code first for flat spec structures, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Flat Spec Preservation**: Observe that `.kiro/specs/flat-spec/tasks.md` is discovered correctly on unfixed code, then verify the fixed code produces identical `SpecFile` output (minus the new `group` field being undefined)
2. **Missing Directory Preservation**: Observe that missing `.kiro/specs/` is handled gracefully on unfixed code, then verify the fixed code handles it identically
3. **Parse Error Preservation**: Observe that a spec with a corrupt `tasks.md` is logged and skipped on unfixed code, then verify the fixed code handles it identically
4. **Task Statistics Preservation**: Observe that task counts and progress are computed correctly on unfixed code, then verify the fixed code produces identical statistics for the same content

### Unit Tests

- Test `scanDirectoryRecursive()` with various directory tree depths (1, 2, 3+)
- Test `group` field computation for specs at different nesting levels
- Test that directories without `tasks.md` are recursed into, not treated as specs
- Test `specDirectories` setting parsing with valid arrays, empty arrays, and missing setting
- Test that `scanWorkspace()` with default directories produces same results as original for flat structures

### Property-Based Tests

- Generate random directory trees with `tasks.md` files at various depths and verify all are discovered with correct `group` values
- Generate random flat spec structures and verify the fixed scanner produces identical output to the original scanner
- Generate random `specDirectories` configurations and verify all configured directories are scanned
- Generate random mixed structures (flat + nested) and verify both types are handled correctly

### Integration Tests

- Test full activation flow: setting read → scanner initialization → file watcher creation → dashboard rendering
- Test runtime setting change: update `specDirectories` → verify watchers are re-created → verify scanner uses new directories → verify dashboard refreshes
- Test dashboard rendering with grouped specs: verify collapsible headers appear, expand/collapse works, ungrouped specs render at top level
