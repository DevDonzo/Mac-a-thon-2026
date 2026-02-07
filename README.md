# CodeSensei - AI Code Mentor with RAG

An intelligent code analysis platform powered by Google Vertex AI and Gemini 1.5 Pro with RAG (Retrieval-Augmented Generation), featuring a VS Code extension, web dashboard, and conversational memory.

## 🚀 Why CodeSensei? (vs GitHub Copilot)

| Feature | Copilot | CodeSensei |
|---------|---------|------------|
| **Context** | Limited to open files | **Indexes your entire codebase** |
| **Transparency** | Black box | **See exactly which files influenced each response** |
| **Privacy** | Code sent to Microsoft/OpenAI | **Your code stays in YOUR GCP project** |
| **Learning** | Speed-optimized | **Mentor Mode for educational responses** |
| **Visualization** | None | **Code DNA knowledge graph + Architecture diagrams** |
| **Memory** | No conversation history | **Persistent chat threads with Backboard.io** |

## ✨ Features

### Core AI Features
- **🎯 RAG-Powered Context**: Every answer is grounded in YOUR actual code with semantic search
- **💬 Persistent Chat Memory**: Conversations saved with Backboard.io for context across sessions
- **🧬 Code DNA Visualization**: Interactive force-directed graph showing file dependencies and imports
- **📐 Auto-Architecture Diagrams**: AI-generated Mermaid diagrams of your system architecture
- **🔍 Accurate Code Explanation**: Direct analysis for "Explain Code" - no RAG confusion
- **🔧 Refactoring Suggestions**: Get actionable refactoring recommendations
- **🧪 Test Generation**: Automatically generate comprehensive unit tests
- **📊 Live Indexing Status**: See real-time indexing progress without stats resetting

### Dashboard Features
- **Overview**: Project statistics and quick actions
- **RAG Chat**: Web-based conversational interface with markdown rendering
- **Code DNA**: Interactive dependency graph with zoom/pan controls
- **Architecture**: Auto-generated system architecture visualization

### What Makes Us Different
- **🎓 Mentor Mode**: Toggle for educational, Socratic-style responses that teach WHY
- **🔒 Privacy-First**: Code never leaves your Google Cloud project
- **⚡ Real-time Updates**: File watching with incremental indexing
- **🎨 Modern Dark UI**: Professional black/white theme with Geist font


## Quick Start

### Prerequisites

- Node.js 18+
- Google Cloud account with Vertex AI API enabled
- VS Code 1.85+
- Backboard.io account (for chat memory)

### 1. Set Up Google Cloud (One-Time)

```bash
# Install gcloud CLI: https://cloud.google.com/sdk/docs/install

# Initialize and login
gcloud init       # Follow prompts to login and select project
gcloud auth application-default login  # For API access
gcloud services enable aiplatform.googleapis.com  # Enable Vertex AI
```

### 2. Set Up Backboard.io (One-Time)

1. Create account at https://app.backboard.io
2. Create an assistant
3. Copy your API key and Assistant ID

### 3. Start the Backend

```bash
cd backend

# First time setup
cp .env.example .env
# Edit .env and set:
#   GCP_PROJECT_ID=your-project-id
#   BACKBOARD_API_KEY=your-backboard-key
#   BACKBOARD_ASSISTANT_ID=your-assistant-id

npm install
npm start
# Server runs at http://localhost:3000
```

### 4. Install the VS Code Extension

**Option A: Install from .vsix file (Recommended)**
```bash
cd vscode-extension
npx vsce package                               # Creates codesensei-1.0.0.vsix
code --install-extension codesensei-1.0.0.vsix # Install it
```

**Option B: Development Mode**
```bash
cd vscode-extension
npm install
# Open folder in VS Code, press F5 to launch
```

### 5. Launch the Dashboard

```bash
cd dashboard
npm install
npm run dev
# Dashboard at http://localhost:5173
```

### 6. Use CodeSensei!

**In VS Code:**
1. Open any project in VS Code
2. Wait for **"CodeSensei (X files)"** in the status bar (auto-indexes on startup)
3. Select code and press `Cmd+Shift+A` (Mac) or `Ctrl+Shift+A` (Windows)
4. Or right-click → **CodeSensei** submenu

**In Dashboard:**
1. Open http://localhost:5173
2. Click "Re-Index Project" if needed
3. Use RAG Chat for conversational code queries
4. Explore Code DNA and Architecture tabs

**Keyboard Shortcuts:**
| Command | Mac | Windows/Linux |
|---------|-----|---------------|
| Ask Question | `Cmd+Shift+A` | `Ctrl+Shift+A` |
| Explain Code | `Cmd+Shift+E` | `Ctrl+Shift+E` |
| Find Bugs | `Cmd+Shift+B` | `Ctrl+Shift+B` |
| Quick Menu | `Cmd+Shift+C` | `Ctrl+Shift+C` |


## Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| Ask CodeSensei | `Cmd+Shift+A` | Ask any question about your code (uses RAG) |
| Explain This Code | `Cmd+Shift+E` | Get a detailed explanation of selected code (direct, no RAG) |
| Find Bugs | `Cmd+Shift+B` | Analyze code for bugs and issues |
| Suggest Refactor | - | Get refactoring suggestions |
| Generate Tests | - | Generate unit tests for code |
| Re-index Workspace | - | Refresh the project index |
| Toggle Mentor Mode | - | Enable/disable educational responses |

## How RAG Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     VS Code Extension                           │
│  1. Scans workspace on startup                                  │
│  2. Sends files to backend for indexing                        │
│  3. User asks a question or highlights code                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CodeSensei Backend                          │
│  1. Files split into semantic chunks (~500 chars)             │
│  2. Embeddings generated via Vertex AI text-embedding-004     │
│  3. Query embedded and similar chunks retrieved (cosine sim)  │
│  4. If currentFile provided, prioritize chunks from that file │
│  5. Context + user code injected into Gemini prompt           │
│  6. Response saved to Backboard.io for conversation memory    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Google Vertex AI                            │
│  - text-embedding-004 for semantic embeddings (768-d vectors)  │
│  - gemini-1.5-pro-002 for intelligent responses                │
└─────────────────────────────────────────────────────────────────┘
```

### RAG Modes

1. **Explain Code (VS Code)**: Skips RAG, directly analyzes highlighted code for accuracy
2. **RAG Chat (Dashboard/General)**: Uses full semantic search with file prioritization
3. **Hybrid**: When code is highlighted + RAG enabled, prioritizes current file chunks (7:3 ratio)

## Project Structure

```
Mac-a-thon-2026/
├── backend/               # Node.js backend server
│   ├── src/
│   │   ├── server.js      # Express API with file watcher
│   │   ├── ai.js          # AI query logic with RAG
│   │   ├── vertexai.js    # Vertex AI client
│   │   ├── vectorStore.js # RAG vector store with embeddings
│   │   ├── backboard.js   # Backboard.io integration
│   │   ├── prompts.js     # System prompts
│   │   ├── config.js      # Configuration
│   │   └── logger.js      # Winston logger
│   ├── .env.example       # Environment template
│   ├── package.json
│   └── vector_cache.json  # Cached embeddings (gitignored)
│
├── vscode-extension/      # VS Code extension
│   ├── extension.js       # Extension logic with skipRAG flag
│   └── package.json       # Extension manifest
│
├── dashboard/             # React visualization dashboard
│   └── src/
│       ├── App.jsx        # Main component (all-in-one)
│       └── App.css        # Dark theme styles
│
├── .gitignore
└── README.md
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check with indexing status |
| `/api/status` | GET | Detailed index status |
| `/api/index` | POST | Index project files (auto-detects changes) |
| `/api/ask` | POST | RAG-powered query (supports skipRAG flag) |
| `/api/analyze` | POST | Code analysis |
| `/api/refactor` | POST | Refactoring suggestions |
| `/api/tests` | POST | Test generation |
| `/api/architecture` | POST | Generate architecture diagram |
| `/api/knowledge-graph` | GET | Get file dependency graph for Code DNA |
| `/api/chat/thread` | POST | Create new Backboard.io conversation thread |

## Configuration

### Backend (.env)

```env
# Required
GCP_PROJECT_ID=your-project-id
BACKBOARD_API_KEY=your-backboard-api-key
BACKBOARD_ASSISTANT_ID=your-assistant-id

# Optional
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

## Features in Detail

### 1. Code DNA Visualization
- Interactive force-directed graph using react-force-graph-2d
- Shows file dependencies based on import statements
- Node colors indicate file type (JS/TS: blue, JSON: green, etc.)
- Zoom, pan, and click nodes to see details
- Auto-generates on page load

### 2. Architecture Diagrams
- AI-generated Mermaid diagrams
- Groups files into logical subgraphs (Backend, Frontend, etc.)
- Shows dependencies with arrows
- Auto-generates on page load
- Refresh button for regeneration
- Pure black background with blue accents

### 3. RAG Chat
- Markdown rendering with code syntax highlighting
- Per-message delete (shows on hover)
- Persistent conversation history with Backboard.io
- Active tab highlighting
- No scroll jump on tab changes
- Live indexing indicator

### 4. Live Indexing
- Real-time file watching with chokidar
- Incremental updates (no stats reset to 0)
- Shows "Code change detected, updating index: filename"
- Stats remain visible during reindexing

## Troubleshooting

### "Backend not running"
Start the backend server: `cd backend && npm start`

### "Vertex AI not configured" or "Model Not Found"
1. Ensure `GCP_PROJECT_ID` is set in `backend/.env`
2. Run `gcloud auth application-default login`
3. Ensure Vertex AI API is enabled in your project
4. If you see `Model ... not found`, try changing `GCP_LOCATION` to `us-central1` or `us-west1` in `.env`

### "No files indexed"
1. Open a workspace folder (not just a file)
2. Wait for indexing to complete (check status bar or dashboard)
3. Try "Re-Index Project" button on dashboard
4. Try `CodeSensei: Re-index Workspace` from command palette in VS Code

### "Error: Request failed with status code 422" (Backboard)
1. Check that `BACKBOARD_API_KEY` and `BACKBOARD_ASSISTANT_ID` are set correctly
2. Verify credentials at https://app.backboard.io/docs
3. Restart the backend after updating .env

### "RAG explaining random code"
- For "Explain Code" in VS Code: This now skips RAG and directly analyzes highlighted code
- For dashboard chat: Ensure project is indexed, uses full RAG with semantic search

### Mermaid syntax errors in architecture
- Backend now sanitizes node labels to remove special characters
- If issues persist, click "Refresh Diagram" to regenerate

## Technology Stack

- **AI**: Google Vertex AI, Gemini 1.5 Pro, text-embedding-004
- **Memory**: Backboard.io for conversation persistence
- **Backend**: Node.js, Express, chokidar (file watching)
- **Frontend**: VS Code Extension API, React + Vite
- **Visualization**: react-force-graph-2d, Mermaid.js, react-zoom-pan-pinch
- **UI**: Geist font, Lucide icons, dark theme

## License

MIT

---

Built for Mac-a-thon 2026 | Powered by Google Cloud AI + Backboard.io
