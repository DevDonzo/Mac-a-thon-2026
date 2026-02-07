# CodeSensei: The Context-Aware AI Architect

## Elevator Pitch
**CodeSensei** is a proactive AI mentor that lives in your IDE and thinks in systems, not lines of code. Powered by **Google Vertex AI** and **Gemini 1.5 Pro**, it doesn't just help you code—it understands your entire project's architecture, grounds its advice in your unique documentation, and visualizes the impact of every change you make.

---

## The Vertex AI Advantage

| Feature | How Vertex AI Powers It |
|---------|-------------------------|
| **Deep Project Grounding** | Uses Vertex AI Vector Search to index your local project files. CodeSensei knows *your* code patterns, not just the internet's. |
| **Massive Context Reasoning** | Leverages Gemini 1.5 Pro's 2M token context window to analyze the entire repository simultaneously. |
| **Predictive Refactoring** | Simulates impact of code changes before you commit, preventing technical debt. |
| **Visual Mentorship** | Generates real-time architecture diagrams and complexity heatmaps. |

---

## Technical Architecture

```
                                 +------------------+
                                 |   VS Code IDE    |
                                 |  (Extension)     |
                                 +--------+---------+
                                          |
                          Active file + Project context
                                          |
                                          v
+----------------+              +-------------------+              +------------------+
|   Firebase     |<----------->|   Node.js Backend |<------------>|  Vertex AI       |
|   Realtime DB  |   State     |   (Express)       |   Gemini API |  Gemini 1.5 Pro  |
+----------------+   Sync      +-------------------+              +------------------+
                                          |
                                          v
                               +---------------------+
                               |  Dashboard (React)  |
                               |  Architecture Viz   |
                               +---------------------+
```

---

## Implementation Phases

### Phase 1: AI Backbone (Hours 0-3)
**Goal**: Connect the IDE to Vertex AI with whole-repository awareness.
- [x] Set up Google Cloud Project with Vertex AI enabled
- [x] Build Node.js bridge to Gemini 1.5 Pro
- [x] Implement Repository Crawler for project structure analysis
- [x] Create VS Code extension with "Ask CodeSensei" command

### Phase 2: Grounded Intelligence (Hours 3-6)
**Goal**: Make the AI understand your unique codebase.
- [ ] Integrate Vertex AI Vector Search (Embeddings API)
- [ ] Create local Context Indexer for project files
- [ ] Implement RAG so answers reference your actual code patterns

### Phase 3: Visual Dashboard (Hours 6-9)
**Goal**: Build the "wow factor" visualization layer.
- [x] Design React dashboard with glassmorphism UI
- [x] Integrate Mermaid.js for architecture diagrams
- [ ] Real-time sync between VS Code and Dashboard via Firebase

### Phase 4: Predictive Impact and Polish (Hours 9-12)
**Goal**: The killer feature and final presentation prep.
- [ ] Predictive Impact Mapping: "If you change this, these 5 modules need updates"
- [ ] Mentor Mode: Pedagogical explanations with design pattern suggestions
- [ ] Final UI polish with animations and dark mode

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| AI Engine | Google Vertex AI, Gemini 1.5 Pro |
| Backend | Node.js, Express, Firebase Admin SDK |
| Frontend | React (Vite), Mermaid.js |
| IDE Integration | VS Code Extension API |
| Database | Firebase Realtime DB |
| Storage | Google Cloud Storage |

---

## VS Code Extension Commands

| Command | Description |
|---------|-------------|
| `CodeSensei: Ask for Advice` | Select code and ask for debugging help, explanations, or best practices |
| `CodeSensei: Analyze Architecture` | Generate a visual diagram of your project's structure |
| `CodeSensei: Predict Impact` | See which files would be affected by a proposed change |

---

## Quick Start

### 1. Configure Google Cloud
```bash
# Set your project ID in backend/.env
GCP_PROJECT_ID=your-project-id
GCP_LOCATION=us-central1
```

### 2. Start the Backend
```bash
cd backend
npm install
node src/server.js
```

### 3. Start the Dashboard
```bash
cd dashboard
npm install
npm run dev
```

### 4. Load the VS Code Extension
1. Open the `vscode-extension/` folder in VS Code
2. Press `F5` to launch Extension Development Host
3. In the new window, use Command Palette > `CodeSensei: Ask for Advice`

---

## Project Structure

```
codesensei/
├── backend/
│   ├── src/
│   │   ├── server.js      # Express API server
│   │   ├── ai.js          # Vertex AI integration
│   │   └── constants.js   # System prompts
│   └── .env               # GCP configuration
├── vscode-extension/
│   ├── extension.js       # Extension logic
│   └── package.json       # Extension manifest
├── dashboard/
│   └── src/
│       ├── App.jsx        # Main React component
│       └── App.css        # Glassmorphism styles
└── README.md
```

---

## The Winning Demo

1. **Open a complex project** with no documentation
2. **Ask CodeSensei**: "Explain how data flows from the UI to the database"
3. **Watch the Dashboard** instantly render a clean architecture diagram
4. **Propose a refactor** and see the impact heatmap highlight every affected file
5. **Learn the pattern**: CodeSensei explains the design principle behind its recommendation

---

## Why This Wins

- **Solves a Real Problem**: Every developer struggles with understanding unfamiliar codebases
- **Deep Vertex AI Integration**: Not just a chatbot—uses embeddings, massive context, and real-time analysis
- **Visual Impact**: Live architecture diagrams during the demo create an unforgettable impression
- **Pedagogical Focus**: Teaches students the "why" behind best practices, not just the "how"

---

Built for Mac-a-thon 2026 | Powered by Google Cloud AI
