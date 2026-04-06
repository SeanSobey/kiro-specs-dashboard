import * as vscode from 'vscode';
import { SpecFile, ExtraFileMetadata } from './types';

const DEFAULT_SPEC_DIRECTORIES = ['.kiro/specs'];

/**
 * Scanner for finding and parsing spec files in the workspace.
 * 
 * This class is responsible for:
 * - Recursively scanning spec directories in all workspace folders
 * - Reading and parsing tasks.md (required), requirements.md (optional), and design.md (optional)
 * - Extracting task statistics (total, completed, optional, progress)
 * - Computing group paths for nested specs
 * - Handling missing files and errors gracefully
 * 
 * Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 11.2
 */
export class SpecScanner {
  private outputChannel: vscode.OutputChannel;
  private static readonly MAX_SCAN_DEPTH = 5;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Specs Dashboard Scanner');
  }

  /**
   * Scan all workspace folders for spec directories and parse all spec files.
   * Recursively discovers spec directories (those containing tasks.md) at any depth.
   * 
   * @param specDirectories Array of relative directory paths to scan (defaults to ['.kiro/specs'])
   * @returns Promise resolving to an array of parsed SpecFile objects
   * 
   * Requirements: 1.1, 2.1, 2.2, 2.4, 2.5, 2.6, 11.2
   */
  async scanWorkspace(specDirectories?: string[]): Promise<SpecFile[]> {
    const specs: SpecFile[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      this.outputChannel.appendLine(`[${new Date().toISOString()}] No workspace folders found`);
      return specs;
    }

    const dirs = specDirectories && specDirectories.length > 0
      ? specDirectories
      : DEFAULT_SPEC_DIRECTORIES;

    this.outputChannel.appendLine(`[${new Date().toISOString()}] Scanning ${workspaceFolders.length} workspace folder(s) with spec directories: ${dirs.join(', ')}`);

    for (const folder of workspaceFolders) {
      for (const specDir of dirs) {
        // Split the relative path into segments and join them properly
        const segments = specDir.replace(/\\/g, '/').split('/').filter(s => s.length > 0);
        const specsPath = vscode.Uri.joinPath(folder.uri, ...segments);

        try {
          await vscode.workspace.fs.stat(specsPath);
        } catch {
          this.outputChannel.appendLine(`[${new Date().toISOString()}] No ${specDir} directory found in ${folder.name}`);
          continue;
        }

        try {
          const found = await this.scanDirectoryRecursive(specsPath, specsPath, folder.name, 0);
          specs.push(...found);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          this.outputChannel.appendLine(`[${new Date().toISOString()}] ERROR: Failed to scan ${specDir} in ${folder.name}: ${errorMsg}`);
          continue;
        }
      }
    }

    this.outputChannel.appendLine(`[${new Date().toISOString()}] Scan complete: ${specs.length} spec(s) found`);
    return specs;
  }

  /**
   * Recursively scan a directory for spec directories (those containing tasks.md).
   * If a directory contains tasks.md, it's treated as a spec directory.
   * If not, its subdirectories are recursed into to find nested specs.
   * 
   * @param currentPath The current directory being scanned
   * @param specRootPath The root spec directory (for computing group paths)
   * @param workspaceFolder The workspace folder name
   * @param depth Current recursion depth (0 = spec root)
   * @returns Promise resolving to an array of discovered SpecFile objects
   * 
   * Requirements: 2.1, 2.2, 2.3
   */
  private async scanDirectoryRecursive(
    currentPath: vscode.Uri,
    specRootPath: vscode.Uri,
    workspaceFolder: string,
    depth: number
  ): Promise<SpecFile[]> {
    const specs: SpecFile[] = [];

    if (depth >= SpecScanner.MAX_SCAN_DEPTH) {
      this.outputChannel.appendLine(`[${new Date().toISOString()}] WARNING: Max scan depth (${SpecScanner.MAX_SCAN_DEPTH}) reached at ${currentPath.fsPath}. Skipping deeper directories.`);
      return specs;
    }

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(currentPath);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`[${new Date().toISOString()}] ERROR: Could not read directory ${currentPath.fsPath}: ${errorMsg}`);
      return specs;
    }

    for (const [name, type] of entries) {
      if (type !== vscode.FileType.Directory) {
        continue;
      }

      const childPath = vscode.Uri.joinPath(currentPath, name);

      // Check if this directory contains tasks.md (making it a spec directory)
      const hasTasksMd = await this.fileExists(vscode.Uri.joinPath(childPath, 'tasks.md'));

      if (hasTasksMd) {
        try {
          const group = this.computeGroup(childPath, specRootPath);
          const spec = await this.parseSpecDirectory(childPath, name, workspaceFolder, group);
          if (spec) {
            specs.push(spec);
            this.outputChannel.appendLine(`[${new Date().toISOString()}] Successfully parsed spec: ${group ? group + '/' : ''}${name}`);
          }
        } catch (parseError) {
          const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
          this.outputChannel.appendLine(`[${new Date().toISOString()}] ERROR: Failed to parse spec ${name}: ${errorMsg}`);
          if (parseError instanceof Error && parseError.stack) {
            this.outputChannel.appendLine(`Stack trace: ${parseError.stack}`);
          }
          continue;
        }
      } else {
        // Not a spec directory — recurse into it to find nested specs
        const nestedSpecs = await this.scanDirectoryRecursive(childPath, specRootPath, workspaceFolder, depth + 1);
        specs.push(...nestedSpecs);
      }
    }

    return specs;
  }

  /**
   * Compute the group path for a spec directory relative to the spec root.
   * For a spec at .kiro/specs/auth/login-feature/, the group is "auth".
   * For a spec at .kiro/specs/flat-spec/, the group is undefined.
   * 
   * @param specPath The absolute URI of the spec directory
   * @param specRootPath The absolute URI of the spec root directory
   * @returns The group path string, or undefined for top-level specs
   */
  private computeGroup(specPath: vscode.Uri, specRootPath: vscode.Uri): string | undefined {
    const rootFsPath = specRootPath.fsPath.replace(/\\/g, '/');
    const specFsPath = specPath.fsPath.replace(/\\/g, '/');

    // Get the relative path from root to the spec directory
    // e.g., for root=/specs and spec=/specs/auth/login-feature → relative = auth/login-feature
    const relative = specFsPath.substring(rootFsPath.length).replace(/^\//, '');

    // The group is everything before the last segment (the spec name itself)
    const segments = relative.split('/').filter(s => s.length > 0);
    if (segments.length <= 1) {
      // Top-level spec, no group
      return undefined;
    }

    // Group is all segments except the last one (the spec directory name)
    return segments.slice(0, -1).join('/');
  }

  /**
   * Check if a file exists at the given URI.
   */
  private async fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse a single spec directory and extract all spec files and metadata.
   * 
   * @param specPath The URI of the spec directory
   * @param name The spec directory name
   * @param workspaceFolder The workspace folder name (for multi-root workspaces)
   * @param group The group path (relative path from spec root to parent), or undefined for top-level
   * @returns Promise resolving to SpecFile object, or null if parsing fails or tasks.md is missing
   * 
   * Requirements: 2.2, 2.3, 2.4, 11.2
   */
  private async parseSpecDirectory(
    specPath: vscode.Uri,
    name: string,
    workspaceFolder: string,
    group?: string
  ): Promise<SpecFile | null> {
    const tasksUri = vscode.Uri.joinPath(specPath, 'tasks.md');

    try {
      // tasks.md is required
      const tasksContent = await this.readFile(tasksUri);
      if (!tasksContent) {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] WARNING: Skipping spec ${name}: tasks.md is missing or empty`);
        return null;
      }

      // requirements.md and design.md are optional
      const requirementsContent = await this.readFile(
        vscode.Uri.joinPath(specPath, 'requirements.md')
      );
      const designContent = await this.readFile(
        vscode.Uri.joinPath(specPath, 'design.md')
      );

      // Discover extra .md files beyond the standard ones
      const standardFiles = new Set(['tasks.md', 'requirements.md', 'design.md']);
      const extraFileNames: string[] = [];
      try {
        const entries = await vscode.workspace.fs.readDirectory(specPath);
        for (const [fileName, fileType] of entries) {
          if (fileType === vscode.FileType.File && fileName.endsWith('.md') && !standardFiles.has(fileName)) {
            extraFileNames.push(fileName);
          }
        }
        extraFileNames.sort();
      } catch (error) {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] WARNING: Could not list extra files in ${name}: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Parse extra files for task-like content
      const extraFilesMetadata = await this.parseExtraFiles(specPath, extraFileNames);

      // Get last modified timestamp from tasks.md
      let lastModified: Date | undefined;
      try {
        const stat = await vscode.workspace.fs.stat(tasksUri);
        lastModified = new Date(stat.mtime);
      } catch (error) {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] WARNING: Could not get last modified time for ${name}/tasks.md`);
      }

      // Parse task statistics from tasks.md
      const taskStats = this.parseTaskStats(tasksContent);

      // Aggregate task stats from extra task-like files
      let aggregatedTotal = taskStats.totalTasks;
      let aggregatedCompleted = taskStats.completedTasks;
      let aggregatedOptional = taskStats.optionalTasks;

      for (const meta of extraFilesMetadata) {
        if (meta.isTaskLike) {
          aggregatedTotal += meta.totalTasks!;
          aggregatedCompleted += meta.completedTasks!;
          aggregatedOptional += meta.optionalTasks!;
        }
      }

      const aggregatedProgress = aggregatedTotal > 0
        ? Math.round((aggregatedCompleted / aggregatedTotal) * 100)
        : 0;

      return {
        name,
        path: specPath.fsPath,
        workspaceFolder,
        group,
        tasksContent,
        requirementsContent,
        designContent,
        extraFiles: extraFileNames.length > 0 ? extraFileNames : undefined,
        extraFilesMetadata: extraFilesMetadata.length > 0 ? extraFilesMetadata : undefined,
        tasksFileStats: taskStats,
        lastModified,
        totalTasks: aggregatedTotal,
        completedTasks: aggregatedCompleted,
        optionalTasks: aggregatedOptional,
        progress: aggregatedProgress
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`[${new Date().toISOString()}] ERROR: Failed to parse spec directory ${name}: ${errorMsg}`);
      if (error instanceof Error && error.stack) {
        this.outputChannel.appendLine(`Stack trace: ${error.stack}`);
      }
      return null;
    }
  }

  /**
   * Parse extra markdown files in a spec directory for task-like content.
   * Files with one or more checkbox lines are classified as task-like.
   * 
   * @param specPath The URI of the spec directory
   * @param extraFileNames Array of extra file names to parse
   * @returns Promise resolving to array of ExtraFileMetadata
   */
  private async parseExtraFiles(
    specPath: vscode.Uri,
    extraFileNames: string[]
  ): Promise<ExtraFileMetadata[]> {
    const metadata: ExtraFileMetadata[] = [];
    for (const fileName of extraFileNames) {
      const fileUri = vscode.Uri.joinPath(specPath, fileName);
      const content = await this.readFile(fileUri);
      if (content === undefined) {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] WARNING: Could not read extra file ${fileName}, treating as non-task`);
        metadata.push({ fileName, isTaskLike: false });
        continue;
      }
      const stats = this.parseTaskStats(content);
      if (stats.totalTasks > 0) {
        metadata.push({
          fileName,
          isTaskLike: true,
          totalTasks: stats.totalTasks,
          completedTasks: stats.completedTasks,
          optionalTasks: stats.optionalTasks,
        });
      } else {
        metadata.push({ fileName, isTaskLike: false });
      }
    }
    return metadata;
  }

  /**
   * Read a file and return its content as a string.
   * 
   * @param uri The URI of the file to read
   * @returns Promise resolving to file content as string, or undefined if file doesn't exist
   * 
   * Requirements: 2.3
   */
  private async readFile(uri: vscode.Uri): Promise<string | undefined> {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(bytes).toString('utf8');
    } catch {
      return undefined;
    }
  }

  /**
   * Parse task statistics from tasks.md content
   * 
   * Supports the following task formats:
   * - [ ] - Pending task
   * - [x] - Completed task
   * - [~] - In progress task (counts as not completed)
   * - [-] - Queued task (counts as not completed)
   * - [ ]* - Optional pending task
   * - [x]* - Optional completed task
   * 
   * @param content The raw markdown content from tasks.md
   * @returns Task statistics including counts and progress percentage
   */
  parseTaskStats(content: string): {
    totalTasks: number;
    completedTasks: number;
    optionalTasks: number;
    progress: number;
  } {
    if (!content || content.trim().length === 0) {
      return { totalTasks: 0, completedTasks: 0, optionalTasks: 0, progress: 0 };
    }

    const lines = content.split('\n');
    let totalTasks = 0;
    let completedTasks = 0;
    let optionalTasks = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      // Match task checkboxes: - [ ], - [x], - [~], - [-]
      // Optional tasks have * suffix: - [ ]*, - [x]*
      const taskMatch = trimmed.match(/^-\s*\[([ x~-])\](\*)?/);

      if (taskMatch) {
        const state = taskMatch[1];
        const isOptional = taskMatch[2] === '*';

        totalTasks++;
        
        if (state === 'x') {
          completedTasks++;
        }
        
        if (isOptional) {
          optionalTasks++;
        }
      }
    }

    const progress = totalTasks > 0
      ? Math.round((completedTasks / totalTasks) * 100)
      : 0;

    return { totalTasks, completedTasks, optionalTasks, progress };
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.outputChannel.dispose();
  }
}
