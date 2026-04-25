---
inclusion: auto
description: Module map, message flow, key patterns, and recipes for common tasks — the agent's guide to this codebase.
---

# Agents Guide

## What This Extension Does

Kiro Specs Dashboard is a VS Code extension that visualizes `.kiro/specs/` directories. It scans for `tasks.md`, `requirements.md`, and `design.md` files, renders them in webview panels, and tracks velocity/analytics over time.

## Module Map

| Module | Role |
|---|---|
| `extension.ts` | Entry point. Registers commands, file watchers, wires up all managers. |
| `specScanner.ts` | Scans workspace folders for `.kiro/specs/**/tasks.md`, parses task checkboxes, extracts stats. |
| `specsDashboardProvider.ts` | Main `WebviewViewProvider`. Owns the sidebar webview, handles all message routing, delegates to managers. Large file (~2900 lines) — most logic is message handling and HTML generation. |
| `stateManager.ts` | Persistence layer over VS Code Memento API. Stores dashboard state, velocity data, execution states. Per-workspace-folder isolation for multi-root. |
| `velocityCalculator.ts` | Records task/spec completions, calculates weekly velocity, trends, consistency scores, projections, team metrics, daily heatmap data. |
| `velocityMigration.ts` | One-time import of historical task completions from Git history. |
| `gitUtils.ts` | Git command helpers used by velocity migration. |
| `profileManager.ts` | CRUD for execution profiles stored in `.kiro/execution-profiles.json`. Validates profiles, manages built-in vs custom, template variable substitution. |
| `executionManager.ts` | Runs spec executions against profiles. Tracks active execution state, watches task files for progress, handles cancellation and completion. |
| `executionHistory.ts` | Persists execution run history. Supports filtering, querying, and statistics (success rate, avg duration). |
| `analyticsPanelManager.ts` | Manages the analytics webview panel. Sends velocity metrics, handles tab switching and data export. |
| `profilesPanelManager.ts` | Manages the profiles webview panel. CRUD UI for execution profiles. |
| `historyPanelManager.ts` | Manages the execution history webview panel. Filtering, statistics display. |
| `mockDataGenerator.ts` | Generates fake velocity data for development/demo purposes. |
| `types.ts` | All TypeScript interfaces and message type unions. |

## Webview Files

All in `src/webview/`. Each is a self-contained HTML file with embedded CSS and JS:

- `dashboard.html` — Main sidebar view (spec cards, filtering, notes)
- `analytics.html` — Velocity charts, heatmap, team metrics, spec timelines
- `profiles.html` — Execution profile management UI
- `history.html` — Execution history list and statistics

## Message Flow

Extension host and webviews communicate via typed `postMessage` calls. Message types are defined in `types.ts`:

- `WebviewMessage` / `ExtensionMessage` — dashboard
- `AnalyticsCommand` / `AnalyticsMessage` — analytics panel
- `ProfilesWebviewMessage` / `ProfilesExtensionMessage` — profiles panel
- `HistoryWebviewMessage` / `HistoryExtensionMessage` — history panel
- `AutomatedExecutionWebviewMessage` / `AutomatedExecutionExtensionMessage` — execution features in dashboard

All incoming messages are validated in `handleMessage()` before processing. File paths and spec names are sanitized to prevent path traversal.

## Key Patterns to Follow

- **Debounced file watching**: File system watchers use 300ms debounce. New watchers should follow the same pattern in `extension.ts`.
- **Deferred refresh**: When the webview is hidden, refreshes are queued and executed when it becomes visible. Respect `isWebviewVisible` checks.
- **Disposal**: Everything goes into `context.subscriptions`. Panel managers implement `dispose()`. New disposable resources must be registered.
- **Error handling**: Try-catch with logging to output channel. Never throw from message handlers — log and continue.
- **State isolation**: Multi-root workspaces use `workspaceFolderName` as a key suffix for per-folder state. Use `StateManager` methods like `getWorkspaceFolderState()`.

## Testing

```bash
npm run test:unit        # Jest unit tests
npm run test:property    # Property-based tests (fast-check)
```

Test files follow the pattern `<module>.test.ts` or `<module>.<aspect>.test.ts` (e.g., `velocityCalculator.persistence.test.ts`). The VS Code API is mocked in `src/__mocks__/vscode.ts`.

## Common Tasks

### Adding a new webview message type

1. Add the type to the appropriate union in `types.ts`
2. Add the handler case in the relevant panel manager's `handleMessage()` or `setupMessageHandling()`
3. Add the sender in the corresponding webview HTML file's JavaScript

### Adding a new panel

1. Create `src/<name>PanelManager.ts` following the pattern in `profilesPanelManager.ts`
2. Create `src/webview/<name>.html`
3. Wire it up in `extension.ts` (instantiate, add to subscriptions, register command)
4. Inject into `specsDashboardProvider.ts` if the dashboard needs to open it

### Modifying velocity tracking

1. Update `VelocityData` or `VelocityMetrics` in `types.ts`
2. Implement recording logic in `velocityCalculator.ts`
3. Update `calculateMetrics()` to include new data
4. Update `analytics.html` to display it
