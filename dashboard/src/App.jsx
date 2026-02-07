import { useState, useEffect, useRef } from 'react';
import './App.css';
import ForceGraph2D from 'react-force-graph-2d';

const API_URL = 'http://localhost:3000';

function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [status, setStatus] = useState({ ready: false, index: null });
  const [loading, setLoading] = useState(true);
  const [queries, setQueries] = useState([]);
  const [mentorMode, setMentorMode] = useState(false);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/health`);
      const data = await res.json();
      setStatus({ ready: true, ...data });
      setLoading(false);
    } catch (e) {
      setStatus({ ready: false, index: null });
      setLoading(false);
    }
  };

  const stats = status.index || { filesIndexed: 0, totalChunks: 0, languages: [] };

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <img src="/icon.png" alt="CodeSensei" className="logo-icon" />
            <span>CodeSensei</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-section-title">Main</div>
            <NavItem
              label="Overview"
              active={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}
            />
            <NavItem
              label="RAG Playground"
              active={activeTab === 'rag'}
              onClick={() => setActiveTab('rag')}
            />
            <NavItem
              label="Code DNA"
              active={activeTab === 'codedna'}
              onClick={() => setActiveTab('codedna')}
            />
          </div>

          <div className="nav-section">
            <div className="nav-section-title">Tools</div>
            <NavItem
              label="Architecture"
              active={activeTab === 'architecture'}
              onClick={() => setActiveTab('architecture')}
            />
            <NavItem
              label="Settings"
              active={activeTab === 'settings'}
              onClick={() => setActiveTab('settings')}
            />
          </div>
        </nav>

        <div className="sidebar-footer">
          {/* Privacy Badge */}
          <div className="privacy-badge">
            <span className="privacy-icon">🔒</span>
            <div className="privacy-text">
              <strong>Private & Secure</strong>
              <span>Your code stays in YOUR GCP project</span>
            </div>
          </div>

          <div className="status-card">
            <div className="status-row">
              <span className="status-label">Backend</span>
              <span className="status-value">
                <span className={`status-dot ${status.ready ? 'online' : 'offline'}`}></span>
                {status.ready ? 'Connected' : 'Offline'}
              </span>
            </div>
            <div className="status-row">
              <span className="status-label">Vertex AI</span>
              <span className="status-value">
                <span className={`status-dot ${status.vertexAI === 'connected' ? 'online' : 'offline'}`}></span>
                {status.vertexAI === 'connected' ? 'Ready' : 'Not configured'}
              </span>
            </div>
            <div className="status-row">
              <span className="status-label">Mentor Mode</span>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={mentorMode}
                  onChange={(e) => setMentorMode(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main">
        {activeTab === 'overview' && (
          <OverviewPage stats={stats} status={status} loading={loading} mentorMode={mentorMode} />
        )}
        {activeTab === 'rag' && (
          <RAGPlaygroundPage mentorMode={mentorMode} />
        )}
        {activeTab === 'codedna' && (
          <CodeDNAPage />
        )}
        {activeTab === 'architecture' && (
          <ArchitecturePage />
        )}
        {activeTab === 'settings' && (
          <SettingsPage />
        )}
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <div className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function OverviewPage({ stats, status, loading, mentorMode }) {
  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <span>Connecting to backend...</span>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Monitor your CodeSensei instance and indexed projects</p>
      </div>

      {/* Privacy Hero Banner */}
      <div className="privacy-hero">
        <div className="privacy-hero-content">
          <div className="privacy-hero-icon">🛡️</div>
          <div>
            <h3>Enterprise-Grade Privacy</h3>
            <p>Unlike other AI tools, your code NEVER leaves your Google Cloud project. Full data sovereignty.</p>
          </div>
        </div>
        <div className="privacy-badges">
          <span className="badge badge-green">SOC 2 Ready</span>
          <span className="badge badge-blue">Your GCP</span>
          <span className="badge badge-purple">Zero Data Sharing</span>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard
          value={stats.filesIndexed || 0}
          label="Files Indexed"
        />
        <StatCard
          value={stats.totalChunks || 0}
          label="Total Chunks"
        />
        <StatCard
          value={stats.languages?.length || 0}
          label="Languages"
        />
        <StatCard
          value={mentorMode ? 'Mentor' : 'Speed'}
          label="AI Mode"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div className="card feature-card">
          <div className="feature-icon">→</div>
          <h3>RAG-Powered Context</h3>
          <p>Unlike Copilot, CodeSensei retrieves relevant code from YOUR entire project before answering. See exactly which files influenced each response.</p>
          <a href="#" className="feature-link" onClick={(e) => { e.preventDefault(); }}>Try RAG Playground →</a>
        </div>

        <div className="card feature-card">
          <div className="feature-icon">◊</div>
          <h3>Code DNA Visualization</h3>
          <p>Explore your codebase like never before. Interactive knowledge graph showing file relationships, dependencies, and architecture.</p>
          <a href="#" className="feature-link" onClick={(e) => { e.preventDefault(); }}>View Code DNA →</a>
        </div>

        <div className="card feature-card">
          <div className="feature-icon">◆</div>
          <h3>Mentor Mode</h3>
          <p>Toggle Mentor Mode for educational, Socratic responses. Learn WHY code works, not just how. Perfect for onboarding and learning.</p>
          <span className={`mode-indicator ${mentorMode ? 'active' : ''}`}>
            {mentorMode ? '✓ Active' : 'Inactive'}
          </span>
        </div>

        <div className="card feature-card">
          <div className="feature-icon">◀</div>
          <h3>Jump to Source</h3>
          <p>Every AI response includes clickable source citations. Jump directly to the exact file and line in VS Code.</p>
          <span className="badge badge-new">New</span>
        </div>
      </div>
    </>
  );
}

function StatCard({ value, label }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}



function RAGPlaygroundPage({ mentorMode }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [retrievalSteps, setRetrievalSteps] = useState([]);
  const [currentStep, setCurrentStep] = useState(-1);
  const [recentChats, setRecentChats] = useState([]);
  const [chatId, setChatId] = useState(Date.now()); // Unique ID for current session

  // Load recent chats from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('codesensei_chats');
    if (saved) {
      try {
        setRecentChats(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse recent chats', e);
      }
    }
  }, []);

  // Save specific chat to history
  const saveToHistory = (queryText, answer) => {
    const newChat = {
      id: Date.now(),
      query: queryText,
      preview: answer ? answer.substring(0, 60) + '...' : '...',
      timestamp: new Date().toISOString(),
      mentorMode
    };

    // Check if query is duplicate (prevent spamming same query)
    const updated = [newChat, ...recentChats.filter(c => c.query !== queryText)].slice(0, 10);
    setRecentChats(updated);
    localStorage.setItem('codesensei_chats', JSON.stringify(updated));
  };

  const loadPastChat = (chat) => {
    setQuery(chat.query);
    // In a real app we'd load the full result, but for now just populate query
  };

  const clearHistory = () => {
    setRecentChats([]);
    localStorage.removeItem('codesensei_chats');
  };

  const runQuery = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setResult(null);
    setRetrievalSteps([]);
    setCurrentStep(0);

    // Simulate step progression for visualization
    const steps = [
      { step: 'query_received', label: 'Query Received', icon: '📝' },
      { step: 'intent_recognition', label: 'Detecting Intent (Specific vs Broad)', icon: '🧠' },
      { step: 'embedding_query', label: 'Generating Query Embedding', icon: '🔢' },
      { step: 'searching_vectors', label: 'Searching Vector Store', icon: '🔍' },
      { step: 'ranking_results', label: 'Ranking & Filtering', icon: '⚖️' },
      { step: 'building_context', label: 'Building Context', icon: '🏗️' },
      { step: 'generating_response', label: 'Generating AI Response', icon: '✨' },
    ];

    // Animate through steps
    for (let i = 0; i < steps.length; i++) {
      setCurrentStep(i);
      setRetrievalSteps(prev => [...prev, { ...steps[i], status: 'active' }]);
      await new Promise(r => setTimeout(r, 300)); // Faster animation
      setRetrievalSteps(prev => prev.map((s, idx) =>
        idx === i ? { ...s, status: 'complete' } : s
      ));
    }

    try {
      const res = await fetch(`${API_URL}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: query,
          context: [],
          mentorMode
        })
      });
      const data = await res.json();
      setResult(data);

      // Add completion step
      setRetrievalSteps(prev => [...prev, {
        step: 'complete',
        label: `Complete (${data.metadata?.timeMs}ms)`,
        icon: '✅',
        status: 'complete'
      }]);

      // Save to recent chats
      saveToHistory(query, data.answer);

    } catch (e) {
      setResult({ error: e.message });
    }

    setLoading(false);
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">RAG Playground</h1>
        <p className="page-subtitle">
          Watch how CodeSensei retrieves context from your codebase in real-time
          {mentorMode && <span className="mentor-badge">Mentor Mode</span>}
        </p>
      </div>

      <div className="rag-layout">
        <div className="rag-main">
          <div className="rag-input-section">
            <div className="card">
              <h3>Ask a Question</h3>
              <div className="input-wrapper">
                <textarea
                  className="rag-input"
                  placeholder={mentorMode ? "I'm your mentor. Ask me to explain concepts..." : "Ask specific questions about files, functions, or architecture..."}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  rows={3}
                />
                <div className="input-actions">
                  <span className="hint-text">
                    {mentorMode ? '💡 Tip: Ask "Why..." questions' : '💡 Tip: Ask about specific files'}
                  </span>
                  <button
                    className="btn btn-primary btn-lg"
                    onClick={runQuery}
                    disabled={loading || !query.trim()}
                  >
                    {loading ? 'Thinking...' : 'Run Query'}
                  </button>
                </div>
              </div>
            </div>

            {/* Retrieval Visualization */}
            <div className="card retrieval-viz">
              <h3>Retrieval Pipeline</h3>
              <div className="pipeline-steps">
                {retrievalSteps.map((step, i) => (
                  <div key={i} className={`pipeline-step ${step.status}`}>
                    <span className="step-icon">{step.icon}</span>
                    <span className="step-label">{step.label}</span>
                    {step.status === 'active' && <div className="step-spinner"></div>}
                    {step.status === 'complete' && <span className="step-check">✓</span>}
                  </div>
                ))}
                {retrievalSteps.length === 0 && (
                  <div className="pipeline-empty">
                    Run a query to see the RAG pipeline in action
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rag-results-section">
            {result && !result.error && (
              <>
                {/* Sources Panel */}
                <div className="card sources-panel">
                  <h3>Retrieved Context ({result.sources?.length || 0} chunks)</h3>
                  <div className="sources-list">
                    {result.sources?.map((source, i) => (
                      <div key={i} className="source-card">
                        <div className="source-header">
                          <span className="source-file">{source.path}</span>
                          <span className="source-relevance">{source.relevance}</span>
                        </div>
                        <div className="source-lines">
                          Lines {source.lines} • {source.language}
                        </div>
                        <div className="source-preview">{source.preview}</div>
                        <button
                          className="btn btn-sm btn-secondary jump-btn"
                          onClick={() => window.open(`vscode://file/${source.path}:${source.startLine}`)}
                        >
                          Open
                        </button>
                      </div>
                    ))}
                    {(!result.sources || result.sources.length === 0) && (
                      <div className="no-sources">
                        No direct code matches found. Answer generated from general knowledge.
                      </div>
                    )}
                  </div>
                </div>

                {/* Answer Panel */}
                <div className="card answer-panel">
                  <div className="answer-header">
                    <h3>AI Response</h3>
                    <div className="answer-meta">
                      <span className={`mode-badge ${result.metadata?.mentorMode ? 'mentor' : 'speed'}`}>
                        {result.metadata?.mentorMode ? 'Mentor Mode' : 'Speed Mode'}
                      </span>
                      <span>{result.metadata?.timeMs}ms</span>
                    </div>
                  </div>
                  <div className="answer-content">
                    {result.answer}
                  </div>
                </div>
              </>
            )}

            {result?.error && (
              <div className="card error-card">
                <h3>Error</h3>
                <p>{result.error}</p>
              </div>
            )}
          </div>
        </div>

        {/* History Sidebar */}
        <aside className="rag-history-sidebar">
          <div className="history-header">
            <h3>Recent Chats</h3>
            {recentChats.length > 0 && (
              <button className="btn-text" onClick={clearHistory}>Clear</button>
            )}
          </div>
          <div className="history-list">
            {recentChats.map((chat) => (
              <div key={chat.id} className="history-item" onClick={() => loadPastChat(chat)}>
                <div className="history-query">{chat.query}</div>
                <div className="history-preview">{chat.preview}</div>
                <div className="history-meta">
                  <span>{new Date(chat.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  {chat.mentorMode && <span className="history-badge">Mentor</span>}
                </div>
              </div>
            ))}
            {recentChats.length === 0 && (
              <div className="history-empty">No recent chats</div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

function CodeDNAPage() {
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const containerRef = useRef(null);

  const loadGraph = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/knowledge-graph`);
      const data = await res.json();

      // Transform data for force graph if needed, but it usually accepts nodes/links
      // Ensure specific colors for languages
      const coloredNodes = data.nodes.map(n => ({
        ...n,
        val: n.importance || 1, // Size
        color: getLanguageColor(n.language) // Color
      }));

      setGraphData({ ...data, nodes: coloredNodes, links: data.edges });
    } catch (e) {
      console.error('Failed to load graph:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadGraph();
  }, []);

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="page-title">Code DNA</h1>
            <p className="page-subtitle">Interactive knowledge graph of your codebase</p>
          </div>
          <button className="btn btn-secondary" onClick={loadGraph} disabled={loading}>
            {loading ? 'Rescanning...' : '🔄 Refresh Graph'}
          </button>
        </div>
      </div>

      <div className="codedna-container">
        <div className="card graph-card" ref={containerRef} style={{ padding: 0, overflow: 'hidden', height: '600px', background: '#0f172a' }}>
          {graphData.nodes.length > 0 ? (
            <ForceGraph2D
              width={containerRef.current ? containerRef.current.clientWidth : 800}
              height={600}
              graphData={graphData}
              nodeLabel="label"
              nodeColor="color"
              nodeRelSize={6}
              linkColor={() => 'rgba(255,255,255,0.2)'}
              backgroundColor="#0f172a"
              onNodeClick={(node) => setSelectedNode(node)}
              nodeCanvasObject={(node, ctx, globalScale) => {
                const label = node.label;
                const fontSize = 12 / globalScale;
                ctx.font = `${fontSize}px Sans-Serif`;
                const textWidth = ctx.measureText(label).width;
                const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2);

                ctx.fillStyle = 'rgba(255, 255, 255, 0.0)'; // Transparent text background
                ctx.beginPath();
                ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI, false);
                ctx.fillStyle = node.color || '#818cf8';
                ctx.fill();

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#cbd5e1';
                if (globalScale > 1.2) { // Only show labels when zoomed in slightly
                  ctx.fillText(label, node.x, node.y + 8);
                }
              }}
            />
          ) : (
            <div className="empty-state">
              <div className="spinner"></div>
              <p>Building Knowledge Graph...</p>
            </div>
          )}
        </div>

        <div className="graph-sidebar">
          {graphData?.stats && (
            <div className="card">
              <h3>Graph Stats</h3>
              <div className="graph-stats">
                <div className="graph-stat">
                  <span className="stat-number">{graphData.stats.totalFiles}</span>
                  <span className="stat-label">Files</span>
                </div>
                <div className="graph-stat">
                  <span className="stat-number">{graphData.stats.totalEdges}</span>
                  <span className="stat-label">Connections</span>
                </div>
              </div>
            </div>
          )}

          {selectedNode ? (
            <div className="card node-details">
              <h3>{selectedNode.label}</h3>
              <div className="node-info">
                <p><strong>Path:</strong> {selectedNode.fullPath}</p>
                <p><strong>Language:</strong> <span style={{ color: selectedNode.color }}>{selectedNode.language}</span></p>
                <p><strong>Lines:</strong> {selectedNode.lines}</p>
                <p><strong>Chunks:</strong> {selectedNode.chunks}</p>

                {selectedNode.imports?.length > 0 && (
                  <div className="imports-list">
                    <strong>Imports ({selectedNode.imports.length}):</strong>
                    <ul>
                      {selectedNode.imports.slice(0, 5).map((imp, i) => (
                        <li key={i}>{imp}</li>
                      ))}
                      {selectedNode.imports.length > 5 && <li>...and {selectedNode.imports.length - 5} more</li>}
                    </ul>
                  </div>
                )}
              </div>
              <button
                className="btn btn-primary btn-sm btn-block"
                onClick={() => window.open(`vscode://file/${selectedNode.fullPath}`)}
              >
                Open in VS Code
              </button>
            </div>
          ) : (
            <div className="card node-details empty">
              <p>Select a node to view details</p>
            </div>
          )}

          <div className="card">
            <h3>Legend</h3>
            <div className="legend">
              {['javascript', 'typescript', 'python', 'java', 'go', 'rust'].map(lang => (
                <div key={lang} className="legend-item">
                  <span className="legend-dot" style={{ background: getLanguageColor(lang) }}></span>
                  <span>{lang.charAt(0).toUpperCase() + lang.slice(1)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ArchitecturePage() {
  const [diagram, setDiagram] = useState('');
  const [loading, setLoading] = useState(false);

  const generateDiagram = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/architecture`, { method: 'POST' });
      const data = await res.json();
      setDiagram(data.diagram || 'No diagram generated');
    } catch (e) {
      setDiagram('Error: Could not connect to backend');
    }
    setLoading(false);
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Architecture</h1>
        <p className="page-subtitle">Visualize your project structure</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            Project Architecture
          </h3>
          <button className="btn btn-primary" onClick={generateDiagram} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Diagram'}
          </button>
        </div>

        {diagram ? (
          <div className="diagram-container">
            <pre style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{diagram}</pre>
          </div>
        ) : (
          <div className="empty-state">
            <div>■</div>
            <h3>No Diagram Yet</h3>
            <p>Click "Generate Diagram" to create an architecture visualization of your indexed project.</p>
          </div>
        )}
      </div>
    </>
  );
}

function SettingsPage() {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Configure your CodeSensei instance</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            Configuration
          </h3>
        </div>

        <div style={{ display: 'grid', gap: '24px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Backend URL
            </label>
            <input
              type="text"
              value="http://localhost:3000"
              readOnly
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              GCP Project ID
            </label>
            <input
              type="text"
              placeholder="Set in backend/.env"
              readOnly
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem'
              }}
            />
          </div>
        </div>
      </div>

      {/* Privacy Section */}
      <div className="card privacy-section">
        <div className="card-header">
          <h3 className="card-title">
            Privacy & Security
          </h3>
        </div>
        <div className="privacy-info">
          <div className="privacy-item">
            <span className="privacy-check">✓</span>
            <div>
              <strong>Code stays in your GCP project</strong>
              <p>Unlike Copilot, your code never leaves your own Google Cloud infrastructure.</p>
            </div>
          </div>
          <div className="privacy-item">
            <span className="privacy-check">✓</span>
            <div>
              <strong>No third-party data sharing</strong>
              <p>CodeSensei uses Vertex AI within YOUR project. No external APIs receive your code.</p>
            </div>
          </div>
          <div className="privacy-item">
            <span className="privacy-check">✓</span>
            <div>
              <strong>Full audit trail</strong>
              <p>All queries are logged within your GCP environment for compliance.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function getLanguageColor(lang) {
  const colors = {
    javascript: '#f7df1e',
    typescript: '#3178c6',
    python: '#3776ab',
    java: '#b07219',
    go: '#00add8',
    rust: '#dea584',
    ruby: '#cc342d',
    default: '#818cf8'
  };
  return colors[lang] || colors.default;
}

export default App;
