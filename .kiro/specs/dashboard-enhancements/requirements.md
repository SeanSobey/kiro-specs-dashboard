# Requirements Document

## Introduction

This document specifies four enhancements to the Kiro Specs Dashboard VS Code extension:

1. Grouping specs by workspace folder in multi-root workspaces
2. Renaming the "test-cases" extra file label to a user-friendly display name with a configurable setting
3. Adding a refresh button to the dashboard panel header
4. Showing optional task progress contribution in progress bars across all task-like files

These enhancements improve usability for users working in multi-root workspaces, provide better control over the dashboard UI, and give clearer visibility into optional task progress.

## Glossary

- **Dashboard**: The webview-based sidebar panel (`specs-dashboard.view`) that displays spec cards, progress bars, and controls
- **Spec_Card**: A single list item in the Dashboard representing one spec directory, showing its name, progress bar, task stats, and action buttons
- **Progress_Bar**: The horizontal bar in a Spec_Card that visually represents task completion percentage
- **Extra_File**: Any `.md` file in a spec directory beyond the standard `tasks.md`, `requirements.md`, and `design.md` files
- **Task_Like_File**: An Extra_File that contains one or more checkbox lines (task items), tracked with its own task statistics
- **Multi_Root_Workspace**: A VS Code workspace containing two or more workspace folders
- **Workspace_Folder**: A single root folder within a VS Code workspace
- **Spec_Scanner**: The component (`specScanner.ts`) responsible for discovering and parsing spec directories across all workspace folders
- **Extension_Settings**: VS Code configuration properties under the `kiroSpecsDashboard` namespace in `package.json`
- **Optional_Task**: A task marked with the `*` suffix (e.g., `- [ ]*`) indicating it is not required for spec completion
- **Required_Task**: A task without the `*` suffix, representing mandatory work for spec completion

## Requirements

### Requirement 1: Group Specs by Workspace Folder in Multi-Root Workspaces

**User Story:** As a developer working in a multi-root workspace, I want specs grouped by their workspace folder in the Dashboard, so that I can quickly identify which specs belong to which project.

#### Acceptance Criteria

1. WHILE the VS Code workspace contains two or more Workspace_Folders, THE Dashboard SHALL group Spec_Cards under collapsible section headers labeled with the Workspace_Folder name
2. WHILE the VS Code workspace contains exactly one Workspace_Folder, THE Dashboard SHALL display Spec_Cards in a flat list without workspace folder group headers
3. WHEN a Workspace_Folder is added to or removed from a Multi_Root_Workspace, THE Dashboard SHALL update the grouping to reflect the new workspace folder structure within 300 milliseconds of the change event
4. THE Dashboard SHALL render workspace folder group headers using the existing `spec-group-header` CSS class and collapsible behavior already used for spec group paths
5. WHEN a user collapses a workspace folder group header, THE Dashboard SHALL hide all Spec_Cards belonging to that Workspace_Folder and persist the collapsed state for the session
6. THE Dashboard SHALL display workspace folder groups in the same order as they appear in the VS Code workspace folder list

### Requirement 2: Configurable Display Labels for Extra Files in the Panel

**User Story:** As a user, I want extra file names like "test-cases" to display as human-readable labels (e.g., "Test Cases") in the Dashboard, and I want to configure which extra files appear and what labels they use, so that the panel is readable and customizable.

#### Acceptance Criteria

1. THE Dashboard SHALL transform Extra_File names into human-readable display labels by replacing hyphens with spaces and capitalizing each word (e.g., "test-cases" becomes "Test Cases")
2. WHEN the Extension_Settings contain a `kiroSpecsDashboard.extraFileLabels` configuration, THE Dashboard SHALL use the configured label for any Extra_File whose name matches a key in the configuration map
3. THE Extension_Settings SHALL define `kiroSpecsDashboard.extraFileLabels` as an object property where each key is a file name without the `.md` extension and each value is the display label string
4. WHEN an Extra_File name has no matching entry in the `kiroSpecsDashboard.extraFileLabels` configuration, THE Dashboard SHALL fall back to the default hyphen-to-title-case transformation described in acceptance criterion 1
5. WHEN the `kiroSpecsDashboard.extraFileLabels` configuration changes, THE Dashboard SHALL update all displayed Extra_File labels without requiring a manual refresh
6. THE Extension_Settings SHALL define `kiroSpecsDashboard.extraFileVisibility` as an object property where each key is a file name without the `.md` extension and each value is a boolean controlling whether that Extra_File appears in the panel
7. WHEN an Extra_File has its visibility set to `false` in the `kiroSpecsDashboard.extraFileVisibility` configuration, THE Dashboard SHALL hide that Extra_File from the Spec_Card display and exclude its tasks from the aggregated progress calculation
8. WHEN an Extra_File has no matching entry in the `kiroSpecsDashboard.extraFileVisibility` configuration, THE Dashboard SHALL default to showing the Extra_File (visibility `true`)

### Requirement 3: Panel Refresh Button

**User Story:** As a user, I want a refresh button in the Dashboard panel header, so that I can manually trigger a full re-scan of all specs without using the command palette.

#### Acceptance Criteria

1. THE Dashboard SHALL display a refresh button in the webview view title bar area using the VS Code `menus` contribution point for `view/title`
2. THE refresh button SHALL use the `$(refresh)` codicon icon and be positioned in the `navigation` group of the view title menu
3. WHEN a user clicks the refresh button, THE Dashboard SHALL invoke the existing `specs-dashboard.refresh` command to trigger a full workspace re-scan
4. WHILE a refresh operation is in progress, THE Dashboard SHALL display a loading indicator to provide visual feedback to the user
5. WHEN the refresh operation completes, THE Dashboard SHALL update all Spec_Cards with the latest data from the file system

### Requirement 4: Optional Task Progress Visualization in Progress Bars

**User Story:** As a user, I want the progress bar to visually distinguish between required and optional task completion, so that I can understand how much of the required work is done versus optional work.

#### Acceptance Criteria

1. THE Progress_Bar SHALL display two visually distinct segments: one segment for Required_Task completion and a second segment for Optional_Task completion
2. THE Progress_Bar SHALL render the Required_Task segment using the existing `--vscode-progressBar-background` color and the Optional_Task segment using a distinct, lighter or semi-transparent variant of the same color
3. THE Dashboard SHALL calculate the Required_Task progress percentage as: (completed required tasks / total required tasks) * 100
4. THE Dashboard SHALL calculate the Optional_Task progress percentage as: (completed optional tasks / total tasks) * 100, appended after the Required_Task segment
5. WHEN a Spec_Card has zero Optional_Tasks, THE Progress_Bar SHALL display only the Required_Task segment with no visual change from the current behavior
6. THE Dashboard SHALL apply the two-segment progress bar to all Task_Like_Files displayed in the Spec_Card, including `tasks.md` and any Extra_Files with task content
7. THE Dashboard SHALL display a textual breakdown below the Progress_Bar showing both required and optional completion counts (e.g., "5/8 required · 2/3 optional")
8. WHEN a task is toggled in any Task_Like_File, THE Progress_Bar SHALL update both segments to reflect the new completion state
