const vscode = require('vscode');
const axios = require('axios');

const API_URL = 'http://localhost:3000';

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('CodeSensei extension is now active');

    // Status bar item
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.text = "$(mortar-board) CodeSensei";
    statusBar.tooltip = "Click to ask CodeSensei for advice";
    statusBar.command = 'codesensei.ask';
    statusBar.show();
    context.subscriptions.push(statusBar);

    // Command: Ask for Advice
    let askCommand = vscode.commands.registerCommand('codesensei.ask', async function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Open a file first to ask CodeSensei for advice.');
            return;
        }

        const selection = editor.selection;
        const selectedText = selection.isEmpty
            ? editor.document.getText()
            : editor.document.getText(selection);

        const prompt = await vscode.window.showInputBox({
            placeHolder: "e.g., 'Why is this function slow?' or 'How can I refactor this?'",
            prompt: "What would you like CodeSensei to help with?",
            ignoreFocusOut: true
        });

        if (!prompt) return;

        await queryCodeSensei(prompt, selectedText, editor.document.fileName);
    });

    // Command: Explain This Code
    let explainCommand = vscode.commands.registerCommand('codesensei.explain', async function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Select some code first.');
            return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showWarningMessage('Please select some code to explain.');
            return;
        }

        const selectedText = editor.document.getText(selection);
        await queryCodeSensei('Explain this code in detail. What does it do and why?', selectedText, editor.document.fileName);
    });

    // Command: Find Bugs
    let bugCommand = vscode.commands.registerCommand('codesensei.findBugs', async function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Open a file first.');
            return;
        }

        const text = editor.document.getText();
        await queryCodeSensei('Analyze this code for potential bugs, edge cases, and security vulnerabilities. Be thorough.', text, editor.document.fileName);
    });

    // Command: Suggest Refactor
    let refactorCommand = vscode.commands.registerCommand('codesensei.refactor', async function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Open a file first.');
            return;
        }

        const selection = editor.selection;
        const selectedText = selection.isEmpty
            ? editor.document.getText()
            : editor.document.getText(selection);

        await queryCodeSensei('Suggest how to refactor this code for better maintainability, readability, and performance. Explain the design patterns you would apply.', selectedText, editor.document.fileName);
    });

    // Command: Generate Tests
    let testCommand = vscode.commands.registerCommand('codesensei.generateTests', async function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Open a file first.');
            return;
        }

        const selection = editor.selection;
        const selectedText = selection.isEmpty
            ? editor.document.getText()
            : editor.document.getText(selection);

        await queryCodeSensei('Generate comprehensive unit tests for this code. Include edge cases and error scenarios.', selectedText, editor.document.fileName);
    });

    context.subscriptions.push(askCommand, explainCommand, bugCommand, refactorCommand, testCommand);
}

async function queryCodeSensei(prompt, code, fileName) {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "CodeSensei is analyzing...",
        cancellable: false
    }, async () => {
        try {
            const response = await axios.post(`${API_URL}/api/ask`, {
                prompt: prompt,
                context: [{
                    path: fileName,
                    content: code
                }]
            }, { timeout: 60000 });

            showResultPanel(response.data.answer, prompt);
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                vscode.window.showErrorMessage('CodeSensei backend is not running. Start it with: cd backend && node src/server.js');
            } else {
                vscode.window.showErrorMessage('CodeSensei error: ' + (error.response?.data?.error || error.message));
            }
        }
    });
}

function showResultPanel(answer, query) {
    const panel = vscode.window.createWebviewPanel(
        'codesenseiResult',
        'CodeSensei',
        vscode.ViewColumn.Beside,
        { enableScripts: true }
    );

    // Convert markdown-style code blocks to HTML
    const formattedAnswer = answer
        .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');

    panel.webview.html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CodeSensei</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            padding: 24px;
            line-height: 1.6;
            color: var(--vscode-editor-foreground);
            background: var(--vscode-editor-background);
        }
        .header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .header h1 {
            margin: 0;
            font-size: 1.4em;
            font-weight: 600;
        }
        .query {
            background: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textLink-foreground);
            padding: 12px 16px;
            margin-bottom: 24px;
            border-radius: 0 8px 8px 0;
        }
        .query-label {
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
        }
        .answer {
            background: var(--vscode-editor-inactiveSelectionBackground);
            padding: 20px;
            border-radius: 8px;
        }
        pre {
            background: var(--vscode-textCodeBlock-background);
            padding: 16px;
            border-radius: 6px;
            overflow-x: auto;
            font-size: 0.9em;
        }
        code {
            background: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Fira Code', 'Consolas', monospace;
        }
        pre code {
            background: none;
            padding: 0;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>CodeSensei</h1>
    </div>
    <div class="query">
        <div class="query-label">Your Question</div>
        <div>${query}</div>
    </div>
    <div class="answer">
        ${formattedAnswer}
    </div>
</body>
</html>`;
}

function deactivate() { }

module.exports = {
    activate,
    deactivate
};
