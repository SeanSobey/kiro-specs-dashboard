# Requirements Document

## Introduction

The Kiro Specs Dashboard extension currently scans spec folders for three standard files: `tasks.md`, `requirements.md`, and `design.md`. The scanner already discovers additional `.md` files in spec folders and exposes them via the `extraFiles` property, and the dashboard renders them in a dropdown for opening. However, some of these extra files may contain task-like content (markdown checkboxes) that should be parsed, tracked, and contribute to spec progress metrics. This feature extends the scanner and dashboard to recognize and handle task-like extra files as first-class participants in spec tracking.

## Glossary

- **Scanner**: The `SpecScanner` class responsible for discovering and parsing spec directories
- **Dashboard**: The webview-based UI that renders spec cards and handles user interactions
- **Standard_Files**: The three well-known spec files: `tasks.md`, `requirements.md`, and `design.md`
- **Extra_File**: Any `.md` file in a spec folder that is not one of the Standard_Files
- **Task_Like_File**: An Extra_File that contains one or more markdown checkbox lines (e.g., `- [ ]`, `- [x]`, `- [~]`, `- [-]`)
- **Spec_Card**: The UI card in the Dashboard that displays a spec's name, progress, and actions
- **State_Manager**: The `StateManager` class responsible for persisting dashboard and velocity state
- **Task_Checkbox**: A markdown line matching the pattern `- [x]`, `- [ ]`, `- [~]`, `- [-]`, with optional `*` suffix for optional tasks

## Requirements

### Requirement 1: Parse Task Statistics from Extra Files

**User Story:** As a developer, I want the scanner to parse task checkboxes in extra markdown files, so that task-like files contribute to spec progress tracking.

#### Acceptance Criteria

1. WHEN the Scanner discovers an Extra_File in a spec folder, THE Scanner SHALL read the file content and parse it for Task_Checkbox lines using the same parsing logic as `tasks.md`
2. WHEN an Extra_File contains one or more Task_Checkbox lines, THE Scanner SHALL classify the file as a Task_Like_File
3. WHEN an Extra_File contains zero Task_Checkbox lines, THE Scanner SHALL treat the file as a non-task Extra_File (current behavior, open-only)
4. THE Scanner SHALL store per-file task statistics (total, completed, optional) for each Task_Like_File
5. IF the Scanner fails to read an Extra_File, THEN THE Scanner SHALL log a warning and continue processing remaining files without affecting the spec

### Requirement 2: Aggregate Extra File Tasks into Spec Metrics

**User Story:** As a developer, I want task counts from extra task-like files to be included in the spec's overall progress, so that I get an accurate picture of spec completion.

#### Acceptance Criteria

1. THE Scanner SHALL include task counts from all Task_Like_Files when computing the spec's `totalTasks`, `completedTasks`, and `optionalTasks` fields
2. THE Scanner SHALL compute the spec's `progress` percentage based on the combined task counts from `tasks.md` and all Task_Like_Files
3. WHEN a Task_Like_File is added or removed from a spec folder, THE Scanner SHALL recalculate the spec's aggregate metrics on the next scan

### Requirement 3: Expose Extra File Metadata in the Data Model

**User Story:** As a developer, I want the data model to carry per-file task information for extra files, so that the dashboard can render detailed breakdowns.

#### Acceptance Criteria

1. THE SpecFile interface SHALL include a field for extra file metadata that contains, for each Extra_File: the file name, whether the file is task-like, and task statistics (total, completed, optional) if applicable
2. THE SpecFile interface SHALL retain the existing `extraFiles` string array for backward compatibility
3. WHEN the Scanner parses a spec directory, THE Scanner SHALL populate both the extra file metadata and the legacy `extraFiles` array

### Requirement 4: Display Extra Task-Like Files in the Dashboard

**User Story:** As a developer, I want to see task-like extra files in the spec card UI, so that I can monitor their progress alongside the main tasks.

#### Acceptance Criteria

1. WHEN a spec contains one or more Task_Like_Files, THE Dashboard SHALL display each Task_Like_File in the spec card's dropdown menu with a progress indicator (e.g., "3/5" or a mini progress bar)
2. WHEN a user clicks on a Task_Like_File entry in the dropdown, THE Dashboard SHALL open the file in the editor
3. THE Dashboard SHALL visually distinguish Task_Like_Files from non-task Extra_Files in the dropdown menu (e.g., different icon or progress badge)

### Requirement 5: Toggle Tasks in Extra Files

**User Story:** As a developer, I want to toggle task checkboxes in extra task-like files from the dashboard, so that I can update progress without opening each file manually.

#### Acceptance Criteria

1. WHEN a user requests to toggle a task in a Task_Like_File, THE Dashboard SHALL send a message to the extension host identifying the spec name, the extra file name, and the task line number
2. WHEN the extension host receives a toggle request for a Task_Like_File, THE extension host SHALL read the file, toggle the checkbox on the specified line, and write the file back
3. IF the target file does not exist or the line number is out of range, THEN THE extension host SHALL log an error and send an error message to the Dashboard
4. WHEN a task is toggled in a Task_Like_File, THE Scanner SHALL recalculate the spec's aggregate metrics

### Requirement 6: File Watcher Support for Extra Files

**User Story:** As a developer, I want the dashboard to automatically refresh when extra files are modified, so that I always see up-to-date progress.

#### Acceptance Criteria

1. WHEN a `.md` file in a spec folder is created, modified, or deleted, THE file watcher SHALL trigger a dashboard refresh
2. THE file watcher SHALL use the same debounce interval as existing file change handling
3. WHEN an Extra_File is renamed or deleted, THE Scanner SHALL update the spec's extra file metadata and aggregate metrics on the next scan

### Requirement 7: Velocity Tracking for Extra File Tasks

**User Story:** As a developer, I want task completions in extra files to be tracked in velocity analytics, so that my productivity metrics are comprehensive.

#### Acceptance Criteria

1. WHEN a task is completed in a Task_Like_File, THE velocity tracker SHALL record the completion event with the same fidelity as tasks from `tasks.md`
2. THE velocity tracker SHALL attribute extra file task completions to the parent spec for per-spec analytics
