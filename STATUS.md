# CodeSensei - Project Status

## How the RAG Pipeline Works

```
┌─────────────────────────────────────────────────────────────────┐
│                      VS Code Extension                          │
│                                                                 │
│  1. On Activation: Scans workspace for .js, .ts, .py, etc      │
│  2. Sends all file contents to backend /api/index              │
│  3. Watches for file changes → triggers re-index               │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend Server                             │
│                                                                 │
│  /api/index:                                                    │
│    - Splits files into chunks (~1500 chars each)               │
│    - Generates embeddings via Vertex AI text-embedding-004     │
│    - Stores chunks + embeddings in memory (VectorStore)        │
│                                                                 │
│  /api/ask (RAG Mode):                                          │
│    - Embeds user query                                         │
│    - Finds top 5 most similar chunks (cosine similarity)       │
│    - Builds prompt with retrieved context                      │
│    - Sends to Gemini 1.5 Pro for grounded answer              │
│    - Returns answer + source references                        │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Google Vertex AI                             │
│                                                                 │
│  text-embedding-004: Creates semantic vectors for chunks       │
│  gemini-1.5-pro-002: Generates intelligent, grounded answers   │
└─────────────────────────────────────────────────────────────────┘
```

## Current Implementation Status

### Backend (backend/)
- [x] Express server with CORS and JSON support
- [x] Vertex AI integration (embeddings + generative)
- [x] Vector store with chunking logic
- [x] RAG pipeline: embed query → find similar → augment prompt
- [x] Fallback keyword search when embeddings unavailable
- [x] Architecture diagram generation endpoint
- [x] Code analysis endpoint

### VS Code Extension (vscode-extension/)
- [x] Automatic workspace indexing on startup
- [x] File watcher for automatic re-indexing
- [x] Status bar showing index state
- [x] Commands: Ask, Explain, Find Bugs, Refactor, Generate Tests
- [x] Right-click context menu with submenu
- [x] Keyboard shortcuts
- [x] Rich result panel with source citations
- [x] RAG mode indicator in results

### Dashboard (dashboard/)
- [x] React + Vite setup
- [x] Glassmorphism UI
- [x] Mermaid.js integration for diagrams
- [ ] Live sync with backend (planned)

## Quick Start

### 1. Start the Backend
```bash
cd backend
node src/server.js
```

### 2. Load the VS Code Extension
1. Open the `vscode-extension/` folder in VS Code
2. Press F5 to launch Extension Development Host
3. The extension will auto-index the workspace
4. Use Cmd+Shift+A to ask CodeSensei a question

### 3. (Optional) Start the Dashboard
```bash
cd dashboard
npm run dev
```

## Configuration Required

Create `backend/.env` with:
```
GCP_PROJECT_ID=your-project-id
GCP_LOCATION=us-central1
PORT=3000
```

## Architecture Files

```
backend/
├── src/
│   ├── server.js       # Express API endpoints
│   ├── ai.js           # RAG query logic
│   ├── embeddings.js   # Vertex AI embeddings
│   ├── vectorStore.js  # In-memory chunk storage
│   └── constants.js    # System prompts

vscode-extension/
├── extension.js        # Main extension logic
└── package.json        # Commands and configuration
```

## Demo Flow

1. Open any project in VS Code with CodeSensei extension
2. Wait for "CodeSensei (X files)" in status bar
3. Select some code and run "CodeSensei: Ask for Advice"
4. Ask: "How does this integrate with the rest of the project?"
5. See response with RAG sources cited
