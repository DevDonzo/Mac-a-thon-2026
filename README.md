# CodeSensei: The AI Architect & Mentor
### *Beyond Autocomplete. Deep Architectural Intelligence.*

[![Powered by Vertex AI](https://img.shields.io/badge/Powered%20by-Google%20Vertex%20AI-blue.svg)](https://cloud.google.com/vertex-ai)
[![Memory by Backboard](https://img.shields.io/badge/Memory%20by-Backboard.io-lightgrey.svg)](https://backboard.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

CodeSensei is a Next-Gen Hybrid RAG code intelligence platform. While standard assistants like GitHub Copilot look at your code as a sequence of text tokens, CodeSensei treats your codebase as a living graph of logic, symbols, and dependencies.

It doesn't just suggest the next line; it understands the architectural DNA of your entire project.

---

## Why CodeSensei?

| Capability | GitHub Copilot | **CodeSensei** |
|:---|:---:|:---:|
| **Context Scope** | Limited to open files/tabs | **Full-Project Semantic Indexing** |
| **Parsing Engine** | Token-based (NLP) | **Hybrid: AST + Semantic + Keyword** |
| **Logic Awareness** | Predictive (Syntactic) | **Structural (Function/Class Boundaries)** |
| **Transparency** | Black box | **Clickable Source Citations & RAG Viz** |
| **Architectural Insight**| None | **Auto-Generated Mermaid Diagrams** |
| **Relationship Mapping**| Flat file structure | **Interactive "Code DNA" Knowledge Graph** |
| **Privacy Strategy** | Code sent to Microsoft/OpenAI | **Pinned to YOUR Private GCP Project** |
| **Long-term Memory** | Per-session history | **Persistent cross-chat architectural memory** |
| **Learning Engine** | Speed-oriented code generation | **Mentor Mode (Socratic Teaching & Best Practices)** |

---

## Premium Intelligence Features

### Structural Intelligence (AST-Powered)
Standard RAG breaks code at arbitrary character limits. CodeSensei uses Babel-based AST parsing to identify function boundaries, class definitions, and variable scopes. Your snippets are always logically complete.

### Code DNA: The Knowledge Graph
Explore your codebase through an interactive force-directed graph. Visualize how files import each other and how symbols (functions, classes) are interconnected.
- **Red Nodes**: Critical Hubs (Heavily imported files)
- **Blue Nodes**: Logic Providers
- **Purple Nodes**: Classes & Data Structures

### Auto-Architecture Generation
Need to document a large project? One click generates a Mermaid.js System Diagram, grouping files into logical subgraphs (Backend, Frontend, API) based on real-world dependency analysis.

### Mentor Mode: Level Up Your Team
Toggle Mentor Mode to transform the AI from a code printer into a Senior Architect. It uses Socratic questioning and first-principles thinking to explain the reasoning behind design patterns, rather than just providing a fix.

### Infinite Conversational Memory
Powered by Backboard.io, CodeSensei remembers architectural decisions across different chat sessions. Your project constraints and global context persist, so you don't start from scratch every time you open the dashboard.

---

## The Tech Stack

- **Large Language Model**: `gemini-2.0-flash-001` (Via Google Vertex AI)
- **Vector Intelligence**: `text-embedding-004` (768-dimensional semantic vectors)
- **Indexing Engine**: Hybrid AST + Keyword search with incremental file watching
- **State Management**: Backboard.io persistent conversation threads
- **Visuals**: React + Vite, Mermaid.js, Force-Graph-2D
- **Host**: Your sovereign Google Cloud infrastructure


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

CodeSensei uses a **hybrid multi-modal architecture** that goes beyond traditional RAG:

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
│                 CodeSensei Backend (Hybrid)                     │
│  ╔══════════════════════════════════════════════════════════╗  │
│  ║  1. AST PARSING (Babel)                                  ║  │
│  ║     • Parse JS/TS/JSX/TSX with Babel                     ║  │
│  ║     • Extract functions, classes, variables, imports     ║  │
│  ║     • Chunk by symbol boundaries (not characters!)       ║  │
│  ║     • Store symbol metadata with chunks                  ║  │
│  ╚══════════════════════════════════════════════════════════╝  │
│                                                                 │
│  ╔══════════════════════════════════════════════════════════╗  │
│  ║  2. SEMANTIC EMBEDDINGS (Vertex AI)                      ║  │
│  ║     • text-embedding-004 for 768-d vectors               ║  │
│  ║     • Batch processing (20 chunks/batch, 4x faster)      ║  │
│  ║     • Cosine similarity search for relevance             ║  │
│  ║     • File prioritization when code is highlighted       ║  │
│  ╚══════════════════════════════════════════════════════════╝  │
│                                                                 │
│  ╔══════════════════════════════════════════════════════════╗  │
│  ║  3. DEPENDENCY GRAPH                                     ║  │
│  ║     • Parse import/export statements                     ║  │
│  ║     • Build file-level dependency edges                  ║  │
│  ║     • Symbol-to-file mappings                            ║  │
│  ║     • Traverse related code context                      ║  │
│  ╚══════════════════════════════════════════════════════════╝  │
│                                                                 │
│  4. Context + user code → Gemini → Backboard.io persistence   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Google Vertex AI                            │
│  - text-embedding-004 for semantic embeddings (768-d vectors)  │
│  - gemini-2.0-flash-001 for intelligent responses              │
└─────────────────────────────────────────────────────────────────┘
```

### Why Hybrid is Better Than Traditional RAG

Traditional RAG treats code like documents (character-based chunks). But code is a **graph**, not text:
- Functions call other functions across files
- Imports create dependency chains  
- Context depends on symbol definitions, not proximity

**Our Approach:**
1. **AST Parsing** → Understand code structure (what is a function? where does it end?)
2. **Symbol Extraction** → Track functions, classes, variables individually
3. **Dependency Graph** → Map relationships (X imports Y, calls function Z)
4. **Semantic Search** → Find relevant patterns and concepts
5. **Hybrid Retrieval** → Combine all three for context-aware results

### RAG Modes

1. **Explain Code (VS Code)**: Skips RAG, directly analyzes highlighted code for accuracy
2. **RAG Chat (Dashboard/General)**: Uses full hybrid search with file prioritization
3. **Hybrid**: When code is highlighted + RAG enabled, prioritizes current file chunks (7:3 ratio)

## Project Structure

```
Mac-a-thon-2026/
├── backend/               # Node.js backend server
│   ├── src/
│   │   ├── server.js      # Express API with file watcher
│   │   ├── ai.js          # AI query logic with RAG
│   │   ├── vertexai.js    # Vertex AI client (embeddings + LLM)
│   │   ├── vectorStore.js # RAG vector store with AST-based chunking
│   │   ├── astParser.js   # Babel-based AST parser for symbol extraction
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
- **Symbol-level nodes**: Toggle to show individual functions, classes, variables (212+ symbols)
- **File-level nodes**: Shows dependencies based on import statements
- Node colors indicate type (JS files: blue, Functions: blue, Classes: purple, Variables: green)
- Interactive legend explaining node types
- Zoom, pan, and click nodes to see details
- Auto-generates on page load
- Real-time stats: "X nodes • Y edges"

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

- **AI**: Google Vertex AI, Gemini 2.0 Flash, text-embedding-004
- **Code Intelligence**: Babel parser for AST, symbol extraction, dependency graphs
- **Memory**: Backboard.io for conversation persistence
- **Backend**: Node.js, Express, chokidar (file watching)
- **Frontend**: VS Code Extension API, React + Vite
- **Visualization**: react-force-graph-2d (with symbol nodes), Mermaid.js, react-zoom-pan-pinch
- **UI**: Geist font, Lucide icons, dark theme

## License

MIT

---

Built for Mac-a-thon 2026 | Powered by Google Cloud AI + Backboard.io
