# Bugfix Requirements Document

## Introduction

The spec scanner (`SpecScanner.scanWorkspace()`) only discovers spec directories that are immediate children of `.kiro/specs/`. If users organize specs into grouping folders (e.g., `.kiro/specs/auth/login-feature/`), those nested specs are silently ignored. This bug prevents hierarchical spec organization and causes specs to go missing from the dashboard. Additionally, the `SpecFile` type and dashboard UI have no concept of grouping, so even once nested specs are found, there is no way to display them in a grouped/hierarchical manner. Furthermore, the spec directory path `.kiro/specs/` is hardcoded throughout the scanner and file watcher, preventing users from configuring custom spec directories for projects that use a different layout or need to scan multiple directories.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a spec directory (containing `tasks.md`) is nested more than one level deep under `.kiro/specs/` (e.g., `.kiro/specs/auth/login-feature/tasks.md`) THEN the system does not discover or register that spec because `scanWorkspace()` only calls `readDirectory()` on the immediate `.kiro/specs/` path and passes each directory entry directly to `parseSpecDirectory()` without recursing

1.2 WHEN a grouping directory exists under `.kiro/specs/` that does not itself contain `tasks.md` but contains subdirectories that do (e.g., `.kiro/specs/auth/` has no `tasks.md` but `.kiro/specs/auth/login-feature/` does) THEN the system attempts to parse the grouping directory as a spec, fails to find `tasks.md`, returns null, and never inspects its children

1.3 WHEN nested specs are discovered (after fixing the scanner) THEN the system has no way to represent the grouping hierarchy because the `SpecFile` interface lacks a field for the group/parent path

1.4 WHEN nested specs are displayed in the dashboard THEN the system renders them as a flat list with no visual grouping because the webview has no concept of spec groups

1.5 WHEN a user wants to store specs in a directory other than `.kiro/specs/` (e.g., `docs/specs/` or `my-specs/`) THEN the system does not discover those specs because the scanner hardcodes the `.kiro/specs/` path in `scanWorkspace()` and the file watcher glob pattern is hardcoded to `**/.kiro/specs/**/*.md`

1.6 WHEN a user wants to scan multiple spec directories simultaneously (e.g., `.kiro/specs/` and `shared-specs/`) THEN the system provides no mechanism to configure additional directories because there is no extension setting for spec directory paths

### Expected Behavior (Correct)

2.1 WHEN a spec directory (containing `tasks.md`) is nested at any depth under `.kiro/specs/` THEN the system SHALL recursively discover and register that spec

2.2 WHEN a grouping directory exists under `.kiro/specs/` that does not contain `tasks.md` but contains subdirectories that are spec directories THEN the system SHALL recurse into the grouping directory to find all nested spec directories

2.3 WHEN a nested spec is discovered THEN the system SHALL populate a group field on the `SpecFile` representing the relative path from `.kiro/specs/` to the spec's parent directory (e.g., `auth` for `.kiro/specs/auth/login-feature/`)

2.4 WHEN specs belong to a group THEN the dashboard SHALL visually group those specs under a collapsible group header showing the group name

2.5 WHEN the extension setting `kiroSpecsDashboard.specDirectories` is configured with an array of directory paths THEN the scanner SHALL scan each configured directory (relative to the workspace root) for spec directories instead of only scanning `.kiro/specs/`

2.6 WHEN the extension setting `kiroSpecsDashboard.specDirectories` is not configured or is empty THEN the scanner SHALL default to scanning `.kiro/specs/` to preserve backward compatibility

2.7 WHEN the extension setting `kiroSpecsDashboard.specDirectories` is configured THEN the file watcher SHALL watch for `**/*.md` changes in all configured directories instead of only watching `**/.kiro/specs/**/*.md`

2.8 WHEN the extension setting `kiroSpecsDashboard.specDirectories` contains multiple directories THEN the scanner SHALL scan all directories and merge the discovered specs into a single list, treating each directory as a spec root

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a spec directory is an immediate child of `.kiro/specs/` (e.g., `.kiro/specs/flat-spec/tasks.md`) THEN the system SHALL CONTINUE TO discover and register that spec with no group designation

3.2 WHEN a spec directory contains `tasks.md`, `requirements.md`, and `design.md` THEN the system SHALL CONTINUE TO parse all three files and extract task statistics correctly regardless of nesting depth

3.3 WHEN `.kiro/specs/` does not exist in a workspace folder THEN the system SHALL CONTINUE TO handle the missing directory gracefully without errors

3.4 WHEN a spec directory fails to parse THEN the system SHALL CONTINUE TO log the error and continue processing other specs without crashing

3.5 WHEN the file system watcher detects changes to `.kiro/specs/**/*.md` THEN the system SHALL CONTINUE TO trigger a debounced refresh of the dashboard

3.6 WHEN the extension setting `kiroSpecsDashboard.specDirectories` is not present in the user's settings THEN the system SHALL CONTINUE TO scan `.kiro/specs/` as the default directory, ensuring existing users experience no change in behavior

3.7 WHEN the extension setting `kiroSpecsDashboard.specDirectories` is updated at runtime THEN the system SHALL re-initialize the scanner and file watcher to reflect the new directories without requiring an extension reload
