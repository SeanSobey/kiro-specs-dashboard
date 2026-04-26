import * as vscode from 'vscode';
import { SpecFile } from './types';

/** A parsed task line ready for the webview */
interface ParsedTask {
  line: number;       // line index in the file (for toggling)
  text: string;       // task description text
  completed: boolean;
  optional: boolean;
  indent: number;     // nesting depth in pixels
  state: string;      // raw state char: ' ', 'x', '~', '-'
}

/** A tab of parsed tasks sent to the webview */
interface TaskTab {
  id: string;
  label: string;
  icon: string;
  fileName: string;
  tasks: ParsedTask[];
  totalTasks: number;
  completedTasks: number;
}

/**
 * Manages the spec detail webview panel.
 * Parses task files server-side and sends structured data to the webview.
 * Non-task files (requirements, design) open the native markdown preview.
 */
export class SpecDetailPanelManager {
  private panels: Map<string, vscode.WebviewPanel> = new Map();
  private context: vscode.ExtensionContext;
  private outputChannel: vscode.OutputChannel;

  constructor(
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel
  ) {
    this.context = context;
    this.outputChannel = outputChannel;
  }

  public async openSpecDetail(spec: SpecFile): Promise<void> {
    const key = `${spec.workspaceFolder || ''}::${spec.name}`;
    this.outputChannel.appendLine(`[${new Date().toISOString()}] Opening spec detail panel: ${key}`);

    const existing = this.panels.get(key);
    if (existing) {
      existing.reveal(vscode.ViewColumn.One);
      await this.sendSpecData(existing, spec);
      return;
    }

    await this.createPanel(key, spec);
  }

  public async updateSpec(spec: SpecFile): Promise<void> {
    const key = `${spec.workspaceFolder || ''}::${spec.name}`;
    const panel = this.panels.get(key);
    if (panel) {
      await this.sendSpecData(panel, spec);
    }
  }

  private async createPanel(key: string, spec: SpecFile): Promise<void> {
    const displayName = spec.name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    const panel = vscode.window.createWebviewPanel(
      'specDetail',
      `${displayName} — Spec Detail`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.context.extensionUri]
      }
    );

    panel.webview.html = this.getHtmlContent(panel.webview);

    panel.webview.onDidReceiveMessage(
      async (message: any) => {
        switch (message.type) {
          case 'ready':
            await this.sendSpecData(panel, spec);
            break;
          case 'toggleTask':
            vscode.commands.executeCommand('specs-dashboard.toggleTaskFromDetail', {
              specName: message.specName,
              workspaceFolder: message.workspaceFolder,
              fileName: message.fileName,
              taskLine: message.taskLine
            });
            break;
          case 'openPreview': {
            // Open native markdown preview for a file
            const filePath = message.filePath as string;
            if (filePath) {
              try {
                const uri = vscode.Uri.file(filePath);
                await vscode.commands.executeCommand('markdown.showPreview', uri);
              } catch {
                // Fallback: just open the file
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
              }
            }
            break;
          }
          case 'openFile': {
            const filePath = message.filePath as string;
            if (filePath) {
              await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
            }
            break;
          }
        }
      },
      undefined,
      this.context.subscriptions
    );

    panel.onDidDispose(() => {
      this.panels.delete(key);
    }, undefined, this.context.subscriptions);

    this.panels.set(key, panel);

    // Backup send in case 'ready' message races
    setTimeout(() => this.sendSpecData(panel, spec), 300);
  }

  // --- Server-side task parsing ---

  private parseTasks(content: string): ParsedTask[] {
    if (!content) { return []; }
    const tasks: ParsedTask[] = [];
    const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(\s*)-\s*\[([ x~\-])\](\*)?\s*(.*)$/);
      if (!match) { continue; }
      tasks.push({
        line: i,
        text: match[4] || '',
        completed: match[2] === 'x',
        optional: match[3] === '*',
        indent: Math.floor(match[1].length / 2) * 20,
        state: match[2],
      });
    }
    return tasks;
  }

  private getFileLabel(baseName: string, specFileConfig: Record<string, any>, extraFileLabels: Record<string, string>): string {
    if (specFileConfig[baseName]?.label) { return specFileConfig[baseName].label; }
    if (extraFileLabels[baseName]) { return extraFileLabels[baseName]; }
    return baseName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  private async sendSpecData(panel: vscode.WebviewPanel, spec: SpecFile): Promise<void> {
    const config = vscode.workspace.getConfiguration('kiroSpecsDashboard');
    const specFileConfig = config.get<Record<string, any>>('specFileConfig') ?? {};
    const extraFileLabels = config.get<Record<string, string>>('extraFileLabels') ?? {};

    // Build task tabs
    const tabs: TaskTab[] = [];

    // tasks.md
    const tasksVisible = specFileConfig['tasks']?.visible !== false;
    if (tasksVisible && spec.tasksContent) {
      const parsed = this.parseTasks(spec.tasksContent);
      const tfs = spec.tasksFileStats;
      tabs.push({
        id: 'tasks',
        label: this.getFileLabel('tasks', specFileConfig, extraFileLabels),
        icon: specFileConfig['tasks']?.icon || 'list-unordered',
        fileName: 'tasks.md',
        tasks: parsed,
        totalTasks: tfs?.totalTasks ?? parsed.length,
        completedTasks: tfs?.completedTasks ?? parsed.filter(t => t.completed).length,
      });
    }

    // Extra task-like files
    if (spec.extraFilesMetadata && spec.path) {
      for (const meta of spec.extraFilesMetadata) {
        if (!meta.isTaskLike) { continue; }
        const baseName = meta.fileName.replace(/\.md$/, '');
        if (specFileConfig[baseName]?.visible === false) { continue; }

        let content: string | undefined;
        try {
          const bytes = await vscode.workspace.fs.readFile(
            vscode.Uri.file(`${spec.path}/${meta.fileName}`)
          );
          content = Buffer.from(bytes).toString('utf8');
        } catch { /* skip */ }

        const parsed = this.parseTasks(content || '');
        tabs.push({
          id: baseName,
          label: this.getFileLabel(baseName, specFileConfig, extraFileLabels),
          icon: specFileConfig[baseName]?.icon || 'checklist',
          fileName: meta.fileName,
          tasks: parsed,
          totalTasks: meta.totalTasks ?? parsed.length,
          completedTasks: meta.completedTasks ?? parsed.filter(t => t.completed).length,
        });
      }
    }

    // Content file tabs (requirements, design) — just send metadata, webview opens native preview
    const contentTabs: Array<{ id: string; label: string; icon: string; fileName: string; exists: boolean }> = [];
    if (specFileConfig['requirements']?.visible !== false && spec.requirementsContent) {
      contentTabs.push({
        id: 'requirements',
        label: this.getFileLabel('requirements', specFileConfig, extraFileLabels),
        icon: specFileConfig['requirements']?.icon || 'file',
        fileName: 'requirements.md',
        exists: true,
      });
    }
    if (specFileConfig['design']?.visible !== false && spec.designContent) {
      contentTabs.push({
        id: 'design',
        label: this.getFileLabel('design', specFileConfig, extraFileLabels),
        icon: specFileConfig['design']?.icon || 'edit',
        fileName: 'design.md',
        exists: true,
      });
    }

    const payload = {
      type: 'specData',
      name: spec.name,
      path: spec.path,
      workspaceFolder: spec.workspaceFolder,
      progress: spec.progress,
      totalTasks: spec.totalTasks,
      completedTasks: spec.completedTasks,
      optionalTasks: spec.optionalTasks,
      completedRequired: spec.completedRequired,
      completedOptional: spec.completedOptional,
      tabs,
      contentTabs,
    };

    try {
      panel.webview.postMessage(payload);
    } catch (err) {
      this.outputChannel.appendLine(`[${new Date().toISOString()}] ERROR sending spec data: ${err}`);
    }
  }

  private getHtmlContent(webview: vscode.Webview): string {
    const nonce = this.getNonce();
    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')
    );
    const htmlPath = vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'specDetail.html');
    try {
      const fs = require('fs');
      let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
      html = html.replace(/\{\{cspSource\}\}/g, webview.cspSource);
      html = html.replace(/\{\{nonce\}\}/g, nonce);
      html = html.replace(/\{\{codiconsUri\}\}/g, codiconsUri.toString());
      return html;
    } catch (error) {
      this.outputChannel.appendLine(`[${new Date().toISOString()}] ERROR loading specDetail.html: ${error}`);
      return `<!DOCTYPE html><html><body><p>Failed to load spec detail view.</p></body></html>`;
    }
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  public dispose(): void {
    for (const panel of this.panels.values()) { panel.dispose(); }
    this.panels.clear();
  }
}
