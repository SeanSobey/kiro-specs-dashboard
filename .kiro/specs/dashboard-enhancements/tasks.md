# Implementation Plan: Dashboard Enhancements

## Overview

Four enhancements to the Kiro Specs Dashboard VS Code extension: workspace folder grouping, configurable extra file labels, panel refresh button, and optional task progress visualization. Implementation proceeds bottom-up from types and parsing, through the extension host layer, to the webview UI, with property tests validating correctness at each layer.

## Tasks

- [x] 1. Extend type definitions and task stats parsing
  - [x] 1.1 Add `completedRequired` and `completedOptional` fields to `ExtraFileMetadata`, `tasksFileStats`, and top-level `SpecFile` aggregated stats in `src/types.ts`
    - Add `completedRequired?: number` and `completedOptional?: number` to `ExtraFileMetadata`
    - Add `completedRequired` and `completedOptional` to the `tasksFileStats` inline type on `SpecFile`
    - Add `completedRequired: number` and `completedOptional: number` to top-level `SpecFile`
    - _Requirements: 4.3, 4.4_

  - [x] 1.2 Update `parseTaskStats()` in `src/specScanner.ts` to compute `completedRequired` and `completedOptional`
    - Track whether each completed task is optional or required
    - Return the two new counts alongside existing fields
    - _Requirements: 4.3, 4.4_

  - [x] 1.3 Update `parseSpecDirectory()` and `parseExtraFiles()` in `src/specScanner.ts` to propagate the new stats fields
    - Populate `completedRequired` and `completedOptional` on `ExtraFileMetadata` for task-like extra files
    - Aggregate `completedRequired` and `completedOptional` across tasks.md and extra files on the top-level `SpecFile`
    - _Requirements: 4.3, 4.4, 4.6_

  - [ ]* 1.4 Write property test for task stats decomposition invariant
    - **Property 4: Task stats decomposition invariant**
    - Generate random task content strings with varying checkbox states and optional markers, parse with `parseTaskStats`, verify `completedTasks === completedRequired + completedOptional`, `completedRequired <= (totalTasks - optionalTasks)`, `completedOptional <= optionalTasks`, and `0 <= progress <= 100`
    - **Validates: Requirements 4.3, 4.4**

- [x] 2. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Add configuration properties and refresh button menu contribution
  - [x] 3.1 Register `kiroSpecsDashboard.extraFileLabels` and `kiroSpecsDashboard.extraFileVisibility` configuration properties in `package.json`
    - `extraFileLabels`: object property, default `{}`, keys are file names without `.md`, values are display label strings
    - `extraFileVisibility`: object property, default `{}`, keys are file names without `.md`, values are booleans
    - _Requirements: 2.3, 2.6_

  - [x] 3.2 Add `view/title` menu contribution in `package.json` for the refresh button
    - Point `specs-dashboard.refresh` command to the `navigation` group with `$(refresh)` icon
    - Scope with `"when": "view == specs-dashboard.view"`
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. Update extension host to forward settings to webview
  - [x] 4.1 Update `specsDashboardProvider.ts` `loadSpecs()` to read `extraFileLabels` and `extraFileVisibility` from configuration and include them in the `specsLoaded` message payload as a `settings` field
    - Also filter hidden extra files from aggregated task counts when visibility is `false`
    - _Requirements: 2.2, 2.5, 2.7_

  - [x] 4.2 Listen for configuration changes to `kiroSpecsDashboard.extraFileLabels` and `kiroSpecsDashboard.extraFileVisibility` in `extension.ts` and trigger a dashboard refresh
    - _Requirements: 2.5_

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement workspace folder grouping in the webview
  - [x] 6.1 Add workspace folder grouping logic in `src/webview/dashboard.html`
    - Before rendering the spec list, group specs by `workspaceFolder` when 2+ unique folders exist
    - Render collapsible group headers using the existing `spec-group-header` CSS class
    - Maintain folder order matching the order specs arrive (mirrors VS Code workspace folder order)
    - Maintain a session-scoped `Set` for collapsed folder state
    - When only one unique folder exists, render a flat list without group headers
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6_

  - [ ]* 6.2 Write property test for spec grouping by workspace folder
    - **Property 1: Spec grouping by workspace folder is correct and order-preserving**
    - Generate random arrays of `{ name, workspaceFolder }` objects, verify: every spec in a group has the matching `workspaceFolder`, every input spec appears in exactly one group, no specs lost or duplicated, groups appear in order of first occurrence
    - **Validates: Requirements 1.1, 1.6**

- [x] 7. Implement configurable extra file labels and visibility in the webview
  - [x] 7.1 Add label resolution and visibility filtering logic in `src/webview/dashboard.html`
    - Implement `getExtraFileLabel(fileName, settings)` function: return configured label if match exists, otherwise hyphen-to-title-case transformation
    - Skip rendering extra files where `settings?.extraFileVisibility?.[baseName] === false`
    - Fall back to default behavior when `settings` field is absent from message
    - _Requirements: 2.1, 2.2, 2.4, 2.7, 2.8_

  - [ ]* 7.2 Write property test for extra file label resolution
    - **Property 2: Extra file label resolution**
    - Generate random hyphenated file names and random config maps, verify label resolution returns configured label or correct default transformation (no hyphens, each word capitalized)
    - **Validates: Requirements 2.1, 2.2, 2.4**

  - [ ]* 7.3 Write property test for extra file visibility filtering
    - **Property 3: Extra file visibility filtering**
    - Generate random extra file arrays and visibility configs, verify filtering excludes exactly those files mapped to `false`, files with no entry are included, aggregated task counts equal sum of visible files only
    - **Validates: Requirements 2.7, 2.8**

- [x] 8. Implement two-segment progress bar and textual breakdown in the webview
  - [x] 8.1 Update progress bar rendering in `src/webview/dashboard.html` to show two segments
    - Replace single `spec-progress-fill` div with two adjacent divs: `.spec-progress-fill.required` and `.spec-progress-fill.optional`
    - Required segment uses existing `--vscode-progressBar-background` color
    - Optional segment uses a semi-transparent variant of the same color
    - Apply the same two-segment rendering to extra file progress bars
    - When a spec has zero optional tasks, display only the required segment (no visual change from current behavior)
    - _Requirements: 4.1, 4.2, 4.5, 4.6_

  - [x] 8.2 Add textual breakdown below the progress bar showing required and optional completion counts
    - Format: `"X/Y required · A/B optional"` when optional tasks exist, `"X/Y required"` when none
    - _Requirements: 4.7_

  - [ ]* 8.3 Write property test for progress segment percentages
    - **Property 5: Progress segment percentages are correct**
    - Generate random valid task stats where `totalTasks > 0`, verify required percentage matches `Math.round((completedRequired / (totalTasks - optionalTasks)) * 100)` when required tasks exist, optional percentage matches `Math.round((completedOptional / totalTasks) * 100)`, and sum of both segment widths never exceeds 100%
    - **Validates: Requirements 4.3, 4.4**

  - [ ]* 8.4 Write property test for textual breakdown formatting
    - **Property 6: Textual breakdown formatting**
    - Generate random valid task stats, verify formatted string contains correct counts and matches pattern `"X/Y required"` or `"X/Y required · A/B optional"`
    - **Validates: Requirements 4.7**

- [x] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Wire everything together and handle edge cases
  - [x] 10.1 Ensure task toggle updates both progress bar segments in `src/webview/dashboard.html`
    - After toggling a task, recalculate required/optional segments and update the DOM
    - _Requirements: 4.8_

  - [x] 10.2 Handle workspace folder add/remove events updating grouping within 300ms
    - Verify the existing debounced refresh (300ms) in `extension.ts` triggers re-grouping in the webview
    - _Requirements: 1.3_

  - [x] 10.3 Handle edge cases: specs with undefined `workspaceFolder` assigned to "Unknown" group, division by zero when all tasks are optional, missing settings field in message payload
    - _Requirements: 1.1, 4.5_

- [x] 11. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses TypeScript with Jest and fast-check (already configured)
