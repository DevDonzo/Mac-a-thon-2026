# CodeSensei - AI Code Mentor

An intelligent VS Code extension powered by Google Vertex AI and Gemini 1.5 Pro that provides context-aware code assistance using RAG (Retrieval-Augmented Generation).

## Features

- **Project-Aware AI**: Indexes your entire codebase for contextual answers
- **Smart Code Explanations**: Understand complex code with detailed explanations
- **Bug Detection**: Find potential bugs, security issues, and edge cases
- **Refactoring Suggestions**: Get actionable refactoring recommendations
- **Test Generation**: Automatically generate comprehensive unit tests
- **Architecture Visualization**: Generate Mermaid diagrams of your project

## Quick Start

### Prerequisites

- Node.js 18+
- Google Cloud account with Vertex AI API enabled
- VS Code 1.85+

### 1. Set Up Google Cloud

```bash
# Install gcloud CLI (if not already installed)
# https://cloud.google.com/sdk/docs/install

# Login and set project
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Enable Vertex AI API
gcloud services enable aiplatform.googleapis.com

# Set up application default credentials
gcloud auth application-default login
```

### 2. Configure the Backend

```bash
cd backend

# Copy environment template
cp .env.example .env

# Edit .env with your project ID
# GCP_PROJECT_ID=your-project-id
# GCP_LOCATION=us-central1

# Install dependencies
npm install

# Start the server
npm start
```

### 3. Install the VS Code Extension

```bash
cd vscode-extension

# Install dependencies
npm install

# Option A: Run in development mode
# Open the vscode-extension folder in VS Code
# Press F5 to launch Extension Development Host

# Option B: Package and install
npm run package
code --install-extension codesensei-1.0.0.vsix
```

### 4. Use CodeSensei

1. Open any project in VS Code
2. Wait for "CodeSensei (X files)" in the status bar
3. Select some code and press `Cmd+Shift+A` (Mac) or `Ctrl+Shift+A` (Windows/Linux)
4. Ask any question about your code!

## Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| Ask CodeSensei | `Cmd+Shift+A` | Ask any question about your code |
| Explain This Code | `Cmd+Shift+E` | Get a detailed explanation of selected code |
| Find Bugs | `Cmd+Shift+B` | Analyze code for bugs and issues |
| Suggest Refactor | - | Get refactoring suggestions |
| Generate Tests | - | Generate unit tests for code |
| Re-index Workspace | - | Refresh the project index |

## How RAG Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     VS Code Extension                           │
│  1. Scans workspace on startup                                  │
│  2. Sends files to backend for indexing                        │
│  3. User asks a question                                        │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CodeSensei Backend                          │
│  1. Files split into semantic chunks                           │
│  2. Embeddings generated via Vertex AI                         │
│  3. Query embedded and similar chunks retrieved                │
│  4. Context injected into Gemini prompt                        │
│  5. Grounded response returned with source citations           │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Google Vertex AI                            │
│  - text-embedding-004 for semantic embeddings                  │
│  - gemini-1.5-pro-002 for intelligent responses                │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
codesensei/
├── backend/               # Node.js backend server
│   ├── src/
│   │   ├── server.js      # Express API
│   │   ├── ai.js          # AI query logic
│   │   ├── vertexai.js    # Vertex AI client
│   │   ├── vectorStore.js # RAG vector store
│   │   ├── prompts.js     # System prompts
│   │   ├── config.js      # Configuration
│   │   └── logger.js      # Winston logger
│   ├── .env.example       # Environment template
│   └── package.json
│
├── vscode-extension/      # VS Code extension
│   ├── extension.js       # Extension logic
│   └── package.json       # Extension manifest
│
├── dashboard/             # React visualization dashboard
│   └── src/
│       ├── App.jsx        # Main component
│       └── App.css        # Styles
│
└── README.md
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/status` | GET | Index status |
| `/api/index` | POST | Index project files |
| `/api/ask` | POST | RAG-powered query |
| `/api/analyze` | POST | Code analysis |
| `/api/refactor` | POST | Refactoring suggestions |
| `/api/tests` | POST | Test generation |
| `/api/architecture` | POST | Architecture diagram |

## Configuration

### Backend (.env)

```env
GCP_PROJECT_ID=your-project-id    # Required
GCP_LOCATION=us-central1          # Default: us-central1
PORT=3000                         # Default: 3000
LOG_LEVEL=info                    # Default: info
```

### Extension (VS Code Settings)

```json
{
  "codesensei.backendUrl": "http://localhost:3000",
  "codesensei.autoIndex": true,
  "codesensei.maxFilesToIndex": 500
}
```

## Troubleshooting

### "Backend not running"
Start the backend server: `cd backend && npm start`

### "Vertex AI not configured"
1. Ensure `GCP_PROJECT_ID` is set in `backend/.env`
2. Run `gcloud auth application-default login`
3. Ensure Vertex AI API is enabled in your project

### "No files indexed"
1. Open a workspace folder (not just a file)
2. Wait for indexing to complete (check status bar)
3. Try `CodeSensei: Re-index Workspace` from command palette

## Technology Stack

- **AI**: Google Vertex AI, Gemini 1.5 Pro
- **Backend**: Node.js, Express
- **Frontend**: VS Code Extension API, React (dashboard)
- **Embeddings**: text-embedding-004
- **Visualization**: Mermaid.js

## License

MIT

---

Built for Mac-a-thon 2026 | Powered by Google Cloud AI
