const vscode = require('vscode');
const axios = require('axios');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');

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
const FILE_SYNC_DEBOUNCE_MS = 1200;
const AUTO_INDEX_IGNORE_REGEX = [
  /(^|\/)\.git\//,
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)target\//,
  /(^|\/)vendor\//,
  /(^|\/)__pycache__\//,
  /(^|\/)\.venv\//,
  /(^|\/)venv\//,
  /(^|\/)bin\//,
  /(^|\/)obj\//,
  /(^|\/)backend\/vector_cache\.json$/,
  /(^|\/)vector_cache\.json$/,
  /\.min\.js$/,
  /\.map$/,
  /\.log$/
];

let statusBarItem;
let isIndexing = false;
let indexedFiles = 0;
let outputChannel;
let mentorMode = false; // Toggle for educational responses
let backendProcess;
let dashboardProcess;
let healthInterval;
let lastBackendOk = false;
let bootComplete = false;
let fileSyncTimeout;
const pendingFileEvents = new Map();

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
    ['codesensei.toggleMentorMode', toggleMentorMode],
    ['codesensei.openDashboard', openDashboard]
  ];

  for (const [cmd, handler] of commands) {
    context.subscriptions.push(vscode.commands.registerCommand(cmd, handler));
  }

  // Boot sequence: auto-start services, then index, then poll health.
  // One linear chain — no overlapping async paths.
  bootServices().catch(err => {
    log('Boot sequence FAILED', { error: err.message, stack: err.stack });
  });

  // File watcher for incremental index updates
  // Use file-level sync to avoid full re-index loops.
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.{js,ts,jsx,tsx,py,java,go,rs,rb,php,css,html,md,json,yaml,yml,c,cpp,cs,swift,kt,scala}');
  watcher.onDidChange((uri) => scheduleIncrementalSync(uri, 'change'));
  watcher.onDidCreate((uri) => scheduleIncrementalSync(uri, 'create'));
  watcher.onDidDelete((uri) => scheduleIncrementalSync(uri, 'delete'));
  context.subscriptions.push(watcher);
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

function getDashboardUrl() {
  return vscode.workspace.getConfiguration('codesensei').get('dashboardUrl') || 'http://localhost:5173';
}

function getAutoStartConfig() {
  const config = vscode.workspace.getConfiguration('codesensei');
  return {
    autoStartBackend: config.get('autoStartBackend') !== false,
    autoStartDashboard: config.get('autoStartDashboard') !== false,
    backendStartCommand: config.get('backendStartCommand') || '',
    dashboardStartCommand: config.get('dashboardStartCommand') || '',
  };
}

function getIndexingConfig() {
  const config = vscode.workspace.getConfiguration('codesensei');
  return {
    autoIndex: config.get('autoIndex') !== false,
    maxFilesToIndex: Number(config.get('maxFilesToIndex') || MAX_FILES)
  };
}

function normalizeRelativePath(uriOrPath) {
  const raw = typeof uriOrPath === 'string'
    ? uriOrPath
    : vscode.workspace.asRelativePath(uriOrPath);

  return String(raw || '').replace(/\\/g, '/');
}

function shouldIgnoreAutoIndexPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized || normalized.startsWith('..')) return true;
  return AUTO_INDEX_IGNORE_REGEX.some((pattern) => pattern.test(normalized));
}

function resolveNodeDir() {
  // Find the real node binary directory (not Electron's process.execPath)
  const candidates = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, 'node'))) {
        return dir;
      }
    } catch {}
  }
  return null;
}

function buildDefaultCommands() {
  // Use simple shell commands — identical to what the user types manually.
  // spawnService always uses shell:true with an augmented PATH so
  // node / npm / nodemon are all discoverable.
  return {
    backend:   'npm --prefix backend run dev',
    dashboard: 'npm --prefix dashboard run dev -- --host 127.0.0.1 --port 5173',
  };
}

async function isBackendRunning() {
  try {
    const res = await axios.get(`${getApiUrl()}/health`, { timeout: 1500 });
    return Boolean(res.data && res.data.status === 'ok');
  } catch {
    return false;
  }
}

async function getBackendStatus() {
  try {
    const res = await axios.get(`${getApiUrl()}/api/status`, { timeout: 2500 });
    return res.data || null;
  } catch {
    return null;
  }
}

function checkPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok) => {
      try { socket.destroy(); } catch {}
      resolve(ok);
    };
    socket.setTimeout(800);
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
    socket.connect(port, host, () => done(true));
  });
}

async function isDashboardRunning() {
  try {
    const url = getDashboardUrl();
    const parsed = new URL(url);
    const port = Number(parsed.port || 80);
    const host = parsed.hostname;
    return await checkPortOpen(port, host);
  } catch {
    return false;
  }
}

function buildSpawnEnv() {
  const env = { ...process.env };
  // VS Code's extension host often strips PATH; rebuild it so spawned
  // processes can locate node, npm, nodemon, npx, etc.
  const nodeDir = resolveNodeDir();
  const extraPaths = [
    nodeDir,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ].filter(Boolean);
  const existing = (env.PATH || env.Path || '').split(path.delimiter);
  const merged = [...new Set([...extraPaths, ...existing])];
  env.PATH = merged.join(path.delimiter);
  return env;
}

function getCodeSenseiRoot() {
  // Where the CodeSensei backend/dashboard code lives (the tool itself).
  // 1. Explicit setting
  const configured = vscode.workspace.getConfiguration('codesensei').get('projectRoot');
  if (configured && fs.existsSync(path.join(configured, 'backend', 'src', 'server.js'))) {
    return configured;
  }

  // 2. Auto-detect: check common locations
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates = [
    path.join(home, 'Projects', 'Mac-a-thon-2026'),
    path.join(home, 'projects', 'Mac-a-thon-2026'),
    path.join(home, 'Developer', 'Mac-a-thon-2026'),
    path.join(home, 'dev', 'Mac-a-thon-2026'),
    path.join(home, 'Desktop', 'Mac-a-thon-2026'),
  ];

  // Also check if the current workspace IS the Mac-a-thon repo
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (ws) candidates.unshift(ws);

  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, 'backend', 'src', 'server.js'))) {
        return dir;
      }
    } catch {}
  }

  return undefined;
}

function spawnService(command, name, cwd) {
  if (!cwd) {
    log(`Cannot start ${name}: no CodeSensei root found`);
    return null;
  }
  const env = buildSpawnEnv();

  // Normalize: if command is an object {command, args}, join into a shell string
  let shellCmd;
  if (typeof command === 'string') {
    shellCmd = command;
  } else {
    const parts = [command.command, ...(command.args || [])];
    shellCmd = parts.map(a => (/[ "'\\]/.test(a) ? `'${a}'` : a)).join(' ');
  }

  log(`Starting ${name}...`, { shellCmd, cwd, PATH: env.PATH });

  const child = spawn(shellCmd, {
    cwd,
    shell: true,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  log(`${name} spawned`, { pid: child.pid });

  child.stdout.on('data', (chunk) => {
    outputChannel.appendLine(`[${name}] ${chunk.toString().trim()}`);
  });
  child.stderr.on('data', (chunk) => {
    outputChannel.appendLine(`[${name} stderr] ${chunk.toString().trim()}`);
  });
  child.on('error', (err) => {
    outputChannel.appendLine(`[${name} ERROR] Failed to start: ${err.message}`);
    log(`${name} failed to start`, { error: err.message });
    if (name === 'backend') backendProcess = null;
    if (name === 'dashboard') dashboardProcess = null;
  });
  child.on('exit', (code, signal) => {
    outputChannel.appendLine(`[${name}] exited (code=${code}, signal=${signal})`);
    log(`${name} exited`, { code, signal });
    if (name === 'backend') backendProcess = null;
    if (name === 'dashboard') dashboardProcess = null;
  });

  return child;
}

async function bootServices() {
  const config = getAutoStartConfig();
  log('Boot sequence starting', config);

  // Find where the CodeSensei backend/dashboard code lives
  const csRoot = getCodeSenseiRoot();
  if (!csRoot) {
    log('CodeSensei repo not found. Set codesensei.projectRoot in settings.');
    updateStatus('offline', 'CodeSensei repo not found. Set codesensei.projectRoot in settings.');
    startHealthPolling();
    return;
  }
  log('CodeSensei root', { csRoot });

  // 1. Ensure backend is running
  if (config.autoStartBackend) {
    const alreadyUp = await isBackendRunning();
    if (alreadyUp) {
      log('Backend already running');
    } else {
      updateStatus('initializing', 'Starting backend...');
      const defaults = buildDefaultCommands();
      const cmd = config.backendStartCommand?.trim() || defaults.backend;
      backendProcess = spawnService(cmd, 'backend', csRoot);
      const ready = await waitForBackendReady(15);
      if (ready) {
        log('Backend is ready after auto-start');
      } else {
        updateStatus('offline', 'Backend failed to start. Check CodeSensei output.');
        log('Backend did not become ready');
      }
    }
  }

  // 2. Ensure dashboard is running
  if (config.autoStartDashboard) {
    const alreadyUp = await isDashboardRunning();
    if (alreadyUp) {
      log('Dashboard already running');
    } else {
      const defaults = buildDefaultCommands();
      const cmd = config.dashboardStartCommand?.trim() || defaults.dashboard;
      dashboardProcess = spawnService(cmd, 'dashboard', csRoot);
    }
  }

  // 3. Index workspace once on boot (if enabled) and backend is up
  const indexingConfig = getIndexingConfig();
  if (indexingConfig.autoIndex && await isBackendRunning()) {
    const backendStatus = await getBackendStatus();
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    const backendWorkspace = backendStatus?.workspace || null;
    const backendFilesIndexed = backendStatus?.stats?.filesIndexed || 0;

    const sameWorkspace = workspacePath && backendWorkspace
      ? workspacePath === backendWorkspace
      : false;

    if (backendFilesIndexed > 0 && (sameWorkspace || !workspacePath)) {
      indexedFiles = backendFilesIndexed;
      updateStatus('ready', `Backend already indexed ${indexedFiles} files.`);
      log('Skipping startup re-index; backend index is already warm', {
        backendWorkspace,
        indexedFiles
      });
    } else {
      await indexWorkspace(false);
    }
  }

  // 4. Start health polling and allow file-watcher reindexing
  bootComplete = true;
  startHealthPolling();
  log('Boot sequence complete');
}

async function waitForBackendReady(maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i += 1) {
    if (await isBackendRunning()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return false;
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

function startHealthPolling() {
  if (healthInterval) return;
  healthInterval = setInterval(async () => {
    const indexingConfig = getIndexingConfig();
    const ok = await isBackendRunning();
    if (ok !== lastBackendOk) {
      lastBackendOk = ok;
      if (ok) {
        log('Backend is online');
        if (indexingConfig.autoIndex && indexedFiles === 0 && !isIndexing) {
          const backendStatus = await getBackendStatus();
          const backendFilesIndexed = backendStatus?.stats?.filesIndexed || 0;
          if (backendFilesIndexed > 0) {
            indexedFiles = backendFilesIndexed;
            updateStatus('ready', `Backend connected. Indexed ${indexedFiles} files.`);
          } else {
            indexWorkspace(false);
          }
        } else if (!isIndexing) {
          updateStatus('ready', `Backend connected. Indexed ${indexedFiles} files.`);
        }
      } else if (!isIndexing) {
        updateStatus('offline', 'Backend not running');
      }
    }
  }, 5000);
}

function scheduleIncrementalSync(uri, eventType) {
  if (!bootComplete || isIndexing || !uri) return;
  if (!getIndexingConfig().autoIndex) return;
  const relativePath = normalizeRelativePath(uri);
  if (shouldIgnoreAutoIndexPath(relativePath)) return;

  pendingFileEvents.set(relativePath, { uri, eventType, relativePath });
  clearTimeout(fileSyncTimeout);
  fileSyncTimeout = setTimeout(() => {
    flushPendingFileEvents().catch((error) => {
      log('Incremental sync flush failed', { error: error.message });
    });
  }, FILE_SYNC_DEBOUNCE_MS);
}

async function flushPendingFileEvents() {
  if (isIndexing || pendingFileEvents.size === 0) return;
  if (!vscode.workspace.workspaceFolders) return;

  const events = Array.from(pendingFileEvents.values());
  pendingFileEvents.clear();

  for (const fileEvent of events) {
    await syncSingleFile(fileEvent);
  }
}

async function syncSingleFile({ uri, eventType, relativePath }) {
  if (shouldIgnoreAutoIndexPath(relativePath)) return;
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return;

  const payload = {
    filePath: relativePath,
    workspacePath: workspaceFolder.uri.fsPath
  };

  try {
    if (eventType === 'delete') {
      payload.content = '';
    } else {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > MAX_FILE_SIZE) {
        log('Skipping incremental sync for large file', { path: relativePath, size: stat.size });
        return;
      }

      const content = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(content).toString('utf8');

      if (text.includes('\0')) {
        log('Skipping incremental sync for binary file', { path: relativePath });
        return;
      }

      payload.content = text;
    }

    const response = await axios.post(`${getApiUrl()}/api/index/file`, payload, {
      timeout: 120000
    });

    indexedFiles = response.data?.stats?.filesIndexed || indexedFiles;
    updateStatus('ready', `Indexed ${indexedFiles} files (${response.data?.stats?.totalChunks || 0} chunks). Click for options.`);
    log('Incremental index update complete', { path: relativePath, eventType });
  } catch (error) {
    const status = error?.response?.status;
    log('Incremental index update failed', {
      path: relativePath,
      eventType,
      status,
      error: error.message
    });

    // No baseline index exists yet; do one full sync.
    if (status === 409 && !isIndexing) {
      await indexWorkspace(false);
    }
  }
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
  pendingFileEvents.clear();
  clearTimeout(fileSyncTimeout);
  updateStatus('indexing', 'Scanning and indexing project files...');
  log('Starting workspace indexing');

  const workspaceFolder = vscode.workspace.workspaceFolders[0];
  const projectId = path.basename(workspaceFolder.uri.fsPath);
  const indexingConfig = getIndexingConfig();

  try {
    // Check backend connection
    const healthCheck = await axios.get(`${getApiUrl()}/health`, { timeout: 3000 });
    log('Backend connected', { status: healthCheck.data.status });

    // Gather files
    const files = await gatherProjectFiles(workspaceFolder.uri, indexingConfig.maxFilesToIndex);
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

async function gatherProjectFiles(workspaceUri, maxFiles = MAX_FILES) {
  const files = [];
  const seenPaths = new Set();
  const maxFilesLimit = Number(maxFiles || MAX_FILES);

  for (const pattern of INCLUDE_PATTERNS) {
    if (files.length >= maxFilesLimit) break;

    try {
      const excludePattern = '{' + EXCLUDE_PATTERNS.join(',') + '}';
      const uris = await vscode.workspace.findFiles(pattern, excludePattern, maxFilesLimit - files.length);

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
    updateStatus('offline', 'Backend not running');
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
    { label: '$(browser) Open Dashboard', description: 'Open the CodeSensei dashboard in your browser', command: 'codesensei.openDashboard' },
    { label: '$(output) View Logs', description: 'Open output channel', command: 'codesensei.openOutput' }
  ];

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'What would you like CodeSensei to help with?'
  });

  if (selected) {
    vscode.commands.executeCommand(selected.command);
  }
}

function openDashboard() {
  const url = getDashboardUrl();
  vscode.env.openExternal(vscode.Uri.parse(url));
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
  if (healthInterval) {
    clearInterval(healthInterval);
    healthInterval = null;
  }
  if (fileSyncTimeout) {
    clearTimeout(fileSyncTimeout);
    fileSyncTimeout = null;
  }
  pendingFileEvents.clear();
  if (backendProcess) {
    try { backendProcess.kill(); } catch {}
    backendProcess = null;
  }
  if (dashboardProcess) {
    try { dashboardProcess.kill(); } catch {}
    dashboardProcess = null;
  }
  if (outputChannel) {
    outputChannel.dispose();
  }
}

module.exports = { activate, deactivate };
