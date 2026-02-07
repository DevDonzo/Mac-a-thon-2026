const vscode = require('vscode');
const axios = require('axios');
const path = require('path');

// Configuration
const DEFAULT_API_URL = 'http://localhost:3000';
const INCLUDE_PATTERNS = [
  '**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx',
  '**/*.py', '**/*.java', '**/*.go', '**/*.rs',
  '**/*.rb', '**/*.php', '**/*.cs', '**/*.cpp',
  '**/*.c', '**/*.swift', '**/*.kt', '**/*.scala',
  '**/*.md', '**/*.json', '**/*.yaml', '**/*.yml'
];
const EXCLUDE_PATTERNS = [
  '**/node_modules/**', '**/dist/**', '**/build/**',
  '**/.git/**', '**/vendor/**', '**/__pycache__/**',
  '**/venv/**', '**/.venv/**', '**/target/**',
  '**/bin/**', '**/obj/**', '**/*.min.js', '**/*.map'
];
const MAX_FILE_SIZE = 100000; // 100KB
const MAX_FILES = 500;

let statusBarItem;
let isIndexing = false;
let indexedFiles = 0;
let outputChannel;
let mentorMode = false; // Toggle for educational responses

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  outputChannel = vscode.window.createOutputChannel('CodeSensei');
  log('CodeSensei extension activated');

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'codesensei.showMenu';
  updateStatus('initializing', 'Initializing...');
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register all commands
  const commands = [
    ['codesensei.ask', askCommand],
    ['codesensei.explain', explainCommand],
    ['codesensei.findBugs', findBugsCommand],
    ['codesensei.refactor', refactorCommand],
    ['codesensei.generateTests', generateTestsCommand],
    ['codesensei.reindex', () => indexWorkspace(true)],
    ['codesensei.showMenu', showQuickPick],
    ['codesensei.openOutput', () => outputChannel.show()],
    ['codesensei.toggleMentorMode', toggleMentorMode]
  ];

  for (const [cmd, handler] of commands) {
    context.subscriptions.push(vscode.commands.registerCommand(cmd, handler));
  }

  // File watcher for auto re-index
  // Watch all relevant file types defined in INCLUDE_PATTERNS
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.{js,ts,jsx,tsx,py,java,go,rs,rb,php,css,html,md,json,yaml,yml,c,cpp,cs,swift,kt,scala}');
  let reindexTimeout;
  const scheduleReindex = () => {
    clearTimeout(reindexTimeout);
    // Reduce debounce to 2 seconds for snappier updates
    reindexTimeout = setTimeout(() => {
      log('Auto-indexing triggered by file change');
      indexWorkspace(false);
    }, 2000);
  };

  watcher.onDidChange(scheduleReindex);
  watcher.onDidCreate(scheduleReindex);
  watcher.onDidDelete(scheduleReindex);
  context.subscriptions.push(watcher);

  // Initial index
  setTimeout(() => indexWorkspace(false), 2000);
}

function log(message, data = null) {
  const timestamp = new Date().toISOString().substr(11, 8);
  const logMessage = data ? `[${timestamp}] ${message}: ${JSON.stringify(data)}` : `[${timestamp}] ${message}`;
  outputChannel.appendLine(logMessage);
  console.log('[CodeSensei]', message, data || '');
}

function getApiUrl() {
  return vscode.workspace.getConfiguration('codesensei').get('backendUrl') || DEFAULT_API_URL;
}

function updateStatus(state, tooltip) {
  const icons = {
    initializing: '$(sync~spin)',
    indexing: '$(sync~spin)',
    ready: '$(mortar-board)',
    error: '$(error)',
    offline: '$(debug-disconnect)'
  };

  const texts = {
    initializing: 'CodeSensei',
    indexing: `CodeSensei (indexing...)`,
    ready: `CodeSensei (${indexedFiles} files)`,
    error: 'CodeSensei (!)',
    offline: 'CodeSensei (offline)'
  };

  statusBarItem.text = `${icons[state] || icons.ready} ${texts[state] || texts.ready}`;
  statusBarItem.tooltip = tooltip;
}

async function indexWorkspace(showNotification = false) {
  if (isIndexing) {
    log('Indexing already in progress, skipping');
    return;
  }

  if (!vscode.workspace.workspaceFolders) {
    updateStatus('error', 'No workspace folder open');
    return;
  }

  isIndexing = true;
  updateStatus('indexing', 'Scanning and indexing project files...');
  log('Starting workspace indexing');

  const workspaceFolder = vscode.workspace.workspaceFolders[0];
  const projectId = path.basename(workspaceFolder.uri.fsPath);

  try {
    // Check backend connection
    const healthCheck = await axios.get(`${getApiUrl()}/health`, { timeout: 3000 });
    log('Backend connected', { status: healthCheck.data.status });

    // Gather files
    const files = await gatherProjectFiles(workspaceFolder.uri);
    log(`Found ${files.length} files to index`);

    if (files.length === 0) {
      updateStatus('ready', 'No indexable files found');
      isIndexing = false;
      return;
    }

    // Send to backend with workspace path
    const response = await axios.post(`${getApiUrl()}/api/index`, {
      projectId,
      files,
      workspacePath: workspaceFolder.uri.fsPath // Send absolute path
    }, {
      timeout: 300000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    indexedFiles = response.data.stats?.filesIndexed || files.length;
    updateStatus('ready', `Indexed ${indexedFiles} files (${response.data.stats?.totalChunks || 0} chunks). Click for options.`);
    log('Indexing complete', response.data.stats);

    if (showNotification) {
      vscode.window.showInformationMessage(
        `CodeSensei: Indexed ${indexedFiles} files successfully`
      );
    }
  } catch (error) {
    handleConnectionError(error);
  } finally {
    isIndexing = false;
  }
}

async function gatherProjectFiles(workspaceUri) {
  const files = [];
  const seenPaths = new Set();

  for (const pattern of INCLUDE_PATTERNS) {
    if (files.length >= MAX_FILES) break;

    try {
      const excludePattern = '{' + EXCLUDE_PATTERNS.join(',') + '}';
      const uris = await vscode.workspace.findFiles(pattern, excludePattern, MAX_FILES - files.length);

      for (const uri of uris) {
        const relativePath = vscode.workspace.asRelativePath(uri);
        if (seenPaths.has(relativePath)) continue;
        seenPaths.add(relativePath);

        try {
          const stat = await vscode.workspace.fs.stat(uri);
          if (stat.size > MAX_FILE_SIZE) continue;

          const content = await vscode.workspace.fs.readFile(uri);
          const text = Buffer.from(content).toString('utf8');

          // Skip binary or very short files
          if (text.includes('\0') || text.trim().length < 10) continue;

          files.push({
            path: relativePath,
            content: text
          });
        } catch (e) {
          // Skip unreadable files
        }
      }
    } catch (e) {
      log('Pattern search error', { pattern, error: e.message });
    }
  }

  return files;
}

function handleConnectionError(error) {
  if (error.code === 'ECONNREFUSED') {
    updateStatus('offline', 'Backend not running. Click to see setup instructions.');
    log('Backend connection refused');
  } else if (error.code === 'ETIMEDOUT') {
    updateStatus('error', 'Backend timeout');
    log('Backend timeout', { error: error.message });
  } else {
    updateStatus('error', `Error: ${error.message}`);
    log('Connection error', { error: error.message });
  }
}

async function showQuickPick() {
  const items = [
    { label: '$(question) Ask CodeSensei', description: 'Ask any question about your code', command: 'codesensei.ask' },
    { label: '$(book) Explain Code', description: 'Get a detailed explanation', command: 'codesensei.explain' },
    { label: '$(bug) Find Bugs', description: 'Analyze for bugs and issues', command: 'codesensei.findBugs' },
    { label: '$(tools) Suggest Refactor', description: 'Get refactoring suggestions', command: 'codesensei.refactor' },
    { label: '$(beaker) Generate Tests', description: 'Generate unit tests', command: 'codesensei.generateTests' },
    { label: '$(refresh) Re-index Workspace', description: 'Refresh the project index', command: 'codesensei.reindex' },
    { label: '$(output) View Logs', description: 'Open output channel', command: 'codesensei.openOutput' }
  ];

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'What would you like CodeSensei to help with?'
  });

  if (selected) {
    vscode.commands.executeCommand(selected.command);
  }
}

async function askCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Open a file first');
    return;
  }

  const selection = editor.selection;
  const selectedText = selection.isEmpty
    ? editor.document.getText()
    : editor.document.getText(selection);

  const prompt = await vscode.window.showInputBox({
    placeHolder: "e.g., 'How does this function work?' or 'What improvements can I make?'",
    prompt: "Ask CodeSensei anything about your code or project",
    ignoreFocusOut: true
  });

  if (!prompt) return;
  await executeQuery(prompt, selectedText, editor.document.fileName, 'general');
}

async function explainCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    vscode.window.showWarningMessage('Select some code to explain');
    return;
  }
  const text = editor.document.getText(editor.selection);
  // Skip RAG for explain - just send the code directly
  await executeQuery(
    `Explain this code in detail:\n\n\`\`\`\n${text}\n\`\`\`\n\nWhat does it do, how does it work, and why might it be written this way?`, 
    text, 
    editor.document.fileName, 
    'general',
    false, // mentorMode
    true  // skipRAG
  );
}

async function findBugsCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Open a file first');
    return;
  }
  const text = editor.document.getText();
  await executeQuery('Find all potential bugs, security issues, and edge cases in this code.', text, editor.document.fileName, 'analyze');
}

async function refactorCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Open a file first');
    return;
  }
  const selection = editor.selection;
  const text = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
  await executeQuery('Suggest refactoring improvements for this code.', text, editor.document.fileName, 'refactor');
}

async function generateTestsCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Open a file first');
    return;
  }
  const selection = editor.selection;
  const text = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
  await executeQuery('Generate comprehensive unit tests for this code.', text, editor.document.fileName, 'test');
}

function toggleMentorMode() {
  mentorMode = !mentorMode;
  const status = mentorMode ? 'enabled' : 'disabled';
  vscode.window.showInformationMessage(`🎓 CodeSensei Mentor Mode ${status}`);
  log('Mentor mode toggled', { enabled: mentorMode });
}

async function executeQuery(prompt, code, fileName, queryType, useMentorMode = null, skipRAG = false) {
  const startTime = Date.now();
  const effectiveMentorMode = useMentorMode !== null ? useMentorMode : mentorMode;
  log('Executing query', { prompt: prompt.slice(0, 50), queryType, mentorMode: effectiveMentorMode, skipRAG });

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: effectiveMentorMode ? "🎓 CodeSensei Mentor is thinking..." : "CodeSensei is thinking...",
    cancellable: true
  }, async (progress, token) => {
    try {
      const response = await axios.post(`${getApiUrl()}/api/ask`, {
        prompt,
        currentFile: {
          path: vscode.workspace.asRelativePath(fileName),
          content: code
        },
        context: code ? [{
          path: vscode.workspace.asRelativePath(fileName),
          content: code
        }] : [],
        queryType,
        mentorMode: effectiveMentorMode,
        skipRAG
      }, {
        timeout: 120000,
        cancelToken: new axios.CancelToken(c => {
          token.onCancellationRequested(() => c('User cancelled'));
        })
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      log('Query completed', { elapsed: `${elapsed}s`, mode: response.data.metadata?.mode });

      showResultPanel(response.data, prompt, elapsed);
    } catch (error) {
      if (axios.isCancel(error)) {
        log('Query cancelled by user');
        return;
      }

      log('Query failed', { error: error.message });

      if (error.code === 'ECONNREFUSED') {
        const action = await vscode.window.showErrorMessage(
          'CodeSensei backend is not running.',
          'View Setup'
        );
        if (action === 'View Setup') {
          vscode.env.openExternal(vscode.Uri.parse('https://github.com/your-repo/codesensei#quick-start'));
        }
      } else {
        vscode.window.showErrorMessage(`CodeSensei error: ${error.response?.data?.message || error.message}`);
      }
    }
  });
}

function showResultPanel(data, query, elapsed) {
  const panel = vscode.window.createWebviewPanel(
    'codesenseiResult',
    mentorMode ? '🎓 CodeSensei Mentor' : 'CodeSensei',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  const answer = data.answer || '';
  const sources = data.sources || [];
  const metadata = data.metadata || {};
  const workspacePath = data.workspacePath || '';

  panel.webview.html = getWebviewContent(answer, query, elapsed, sources, metadata, workspacePath);

  // Handle messages from webview (for jump-to-source)
  panel.webview.onDidReceiveMessage(async message => {
    if (message.command === 'openFile') {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, message.path);
        try {
          const doc = await vscode.workspace.openTextDocument(fileUri);
          const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
          const line = Math.max(0, (message.line || 1) - 1);
          const position = new vscode.Position(line, 0);
          editor.selection = new vscode.Selection(position, position);
          editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
          log('Jumped to source', { path: message.path, line: message.line });
        } catch (e) {
          vscode.window.showWarningMessage(`Could not open file: ${message.path}`);
        }
      }
    }
  });
}

function getWebviewContent(answer, query, elapsed, sources, metadata, workspacePath = '') {
  // Convert markdown to HTML
  const formattedAnswer = formatMarkdown(answer);

  const sourcesHtml = sources.length > 0
    ? `<div class="sources">
        <div class="sources-header">
          <span class="icon">📚</span>
          <span>Sources Used (${sources.length} chunks) - Click to jump!</span>
        </div>
        ${sources.map(s => {
          const displayPath = workspacePath ? `${workspacePath}/${s.path}` : s.path;
          return `
          <div class="source-item clickable" onclick="jumpToSource('${s.path}', ${s.startLine || 1})">
            <div class="source-main">
              <span class="source-path">📄 ${displayPath}</span>
              <span class="source-relevance">${s.relevance}</span>
            </div>
            <div class="source-details">
              <span class="source-lines">📍 Lines ${s.lines}</span>
              <span class="source-lang">${s.language || 'code'}</span>
              <span class="jump-hint">Click to open →</span>
            </div>
          </div>
        `;
        }).join('')}
       </div>`
    : '';

  const modeLabel = metadata.mode === 'rag' ? 'RAG Mode (Project Context)' : 'Direct Mode';
  const modeBadgeClass = metadata.mode === 'rag' ? 'badge-rag' : 'badge-direct';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeSensei</title>
  <style>
    :root {
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-editorWidget-background);
      --text-primary: var(--vscode-editor-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
      --border: var(--vscode-panel-border);
      --accent: var(--vscode-textLink-foreground);
      --code-bg: var(--vscode-textCodeBlock-background);
    }
    
    * { box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 24px;
      line-height: 1.7;
      color: var(--text-primary);
      background: var(--bg-primary);
      max-width: 900px;
      margin: 0 auto;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 24px;
    }
    
    .header h1 {
      margin: 0;
      font-size: 1.5em;
      font-weight: 600;
    }
    
    .meta {
      display: flex;
      gap: 12px;
      align-items: center;
      font-size: 0.85em;
    }
    
    .badge {
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 0.75em;
      font-weight: 500;
    }
    
    .badge-rag { background: #2e7d32; color: white; }
    .badge-direct { background: #1565c0; color: white; }
    
    .query {
      background: var(--bg-secondary);
      border-left: 3px solid var(--accent);
      padding: 16px 20px;
      margin-bottom: 24px;
      border-radius: 0 8px 8px 0;
    }
    
    .query-label {
      font-size: 0.8em;
      color: var(--text-secondary);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .answer {
      background: var(--bg-secondary);
      padding: 24px;
      border-radius: 12px;
      border: 1px solid var(--border);
    }
    
    .answer h1, .answer h2, .answer h3 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      color: var(--accent);
    }
    
    .answer h1:first-child, .answer h2:first-child, .answer h3:first-child {
      margin-top: 0;
    }
    
    pre {
      background: var(--code-bg);
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 0.9em;
      border: 1px solid var(--border);
    }
    
    code {
      font-family: 'Fira Code', 'Consolas', 'Monaco', monospace;
      font-size: 0.9em;
    }
    
    :not(pre) > code {
      background: var(--code-bg);
      padding: 2px 6px;
      border-radius: 4px;
    }
    
    .sources {
      margin-top: 24px;
      padding: 16px;
      background: var(--bg-secondary);
      border-radius: 8px;
      border: 1px solid var(--border);
    }
    
    .sources-header {
      display: flex;
      gap: 8px;
      align-items: center;
      font-weight: 500;
      margin-bottom: 12px;
    }
    
    .source-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
      font-size: 0.9em;
    }
    
    .source-item:last-child { border-bottom: none; }
    
    .source-path { color: var(--accent); }
    .source-meta { color: var(--text-secondary); font-size: 0.85em; }
    
    ul, ol { padding-left: 1.5em; }
    li { margin: 0.5em 0; }
    
    strong { font-weight: 600; }
    
    blockquote {
      border-left: 3px solid var(--border);
      padding-left: 16px;
      margin: 1em 0;
      color: var(--text-secondary);
    }
    
    /* Clickable sources */
    .source-item.clickable {
      cursor: pointer;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid var(--border);
      margin-bottom: 8px;
      transition: all 0.2s ease;
    }
    
    .source-item.clickable:hover {
      background: rgba(99, 102, 241, 0.1);
      border-color: var(--accent);
      transform: translateX(4px);
    }
    
    .source-main {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    
    .source-relevance {
      background: #10b981;
      color: white;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 0.75em;
      font-weight: 600;
    }
    
    .source-details {
      display: flex;
      gap: 12px;
      font-size: 0.8em;
      color: var(--text-secondary);
    }
    
    .source-lines { color: var(--accent); }
    .source-lang { opacity: 0.7; }
    .jump-hint { 
      color: var(--accent);
      font-weight: 500;
      opacity: 0;
      transition: opacity 0.2s;
    }
    
    .source-item.clickable:hover .jump-hint {
      opacity: 1;
    }
    
    /* Mentor mode styling */
    .mentor-badge {
      background: linear-gradient(135deg, #f472b6, #a855f7);
      color: white;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.8em;
      margin-left: 8px;
    }
    
    .badge-mentor { 
      background: linear-gradient(135deg, #f472b6, #a855f7); 
      color: white; 
    }
  </style>
  <script>
    const vscode = acquireVsCodeApi();
    
    function jumpToSource(path, line) {
      vscode.postMessage({
        command: 'openFile',
        path: path,
        line: line
      });
    }
  </script>
</head>
<body>
  <div class="header">
    <h1>CodeSensei${metadata.mentorMode ? '<span class="mentor-badge">🎓 Mentor Mode</span>' : ''}</h1>
    <div class="meta">
      <span class="badge ${modeBadgeClass}">${modeLabel}</span>
      <span>${elapsed}s</span>
    </div>
  </div>
  
  <div class="query">
    <div class="query-label">Your Question</div>
    <div>${escapeHtml(query)}</div>
  </div>
  
  <div class="answer">
    ${formattedAnswer}
  </div>
  
  ${sourcesHtml}
</body>
</html>`;
}

function formatMarkdown(text) {
  return text
    // Code blocks
    .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code class="language-${lang || ''}">${escapeHtml(code.trim())}</code></pre>`)
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function deactivate() {
  if (outputChannel) {
    outputChannel.dispose();
  }
}

module.exports = { activate, deactivate };
