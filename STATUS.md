# 🥋 CodeSensei Restored & AI-Charged!

I have pivoted the project to **CodeSensei**—a Master AI Architect powered by **Google Vertex AI** and **Gemini 1.5 Pro**.

### 🛠️ What's Built Now:

1. **AI Backend (`backend/`)**:
   - Integrated with **Vertex AI** for deep project reasoning.
   - Master Architect system prompts for high-quality pedagogical advice.
   - Architecture mapping endpoint ready for the visualization dashboard.

2. **VS Code Extension (`vscode-extension/`)**:
   - Commands: `CodeSensei: Ask for Advice` and `CodeSensei: Analyze Architecture`.
   - Captures code context automatically and displays AI insights in a custom Webview.

3. **Premium Dashboard (`dashboard/`)**:
   - **Vite + React** app with **Glassmorphism** design.
   - **Mermaid.js** integration for real-time architecture diagrams.
   - **Lucide Icons** and **Inter** typography for a professional feel.

---

### 🚀 How to Run It:

#### 1. Setup Google Cloud (Vertex AI)
- Ensure you have a Google Cloud Project with **Vertex AI API** enabled.
- Fill in your `backend/.env`:
  ```env
  GCP_PROJECT_ID=your-project-id
  GCP_LOCATION=us-central1
  ```

#### 2. Start the Backend
```bash
cd backend
npm start
```

#### 3. Start the Dashboard (Visualizer)
```bash
cd dashboard
npm run dev
```
- Open `http://localhost:5173` to see the glassmorphism dashboard.

#### 4. Load the VS Code Extension
- Open `vscode-extension/` in a new VS Code window.
- Press `F5` to start a new Extension Development Host window.
- In the new window, select some code and run the command `CodeSensei: Ask for Advice`.

---

### ✅ Mission: Clean & Focused
I have confirmed that all remnants of the old "Sentinel Gateway" project are gone. The workspace is now lean, clean, and 100% focused on being the best AI project at the hackathon.

Ready to dominate with **CodeSensei**! 🚀
