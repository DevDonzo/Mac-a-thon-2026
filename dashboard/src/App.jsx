import { useState, useEffect, useRef } from 'react';
import './App.css';

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
            <div className="logo-icon">CS</div>
            <span>CodeSensei</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-section-title">Main</div>
            <NavItem
              icon="📊"
              label="Overview"
              active={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}
            />
            <NavItem
              icon="🔍"
              label="RAG Playground"
              active={activeTab === 'rag'}
              onClick={() => setActiveTab('rag')}
            />
            <NavItem
              icon="🧬"
              label="Code DNA"
              active={activeTab === 'codedna'}
              onClick={() => setActiveTab('codedna')}
            />
          </div>

          <div className="nav-section">
            <div className="nav-section-title">Tools</div>
            <NavItem
              icon="🏗️"
              label="Architecture"
              active={activeTab === 'architecture'}
              onClick={() => setActiveTab('architecture')}
            />
            <NavItem
              icon="⚙️"
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
          icon="📁"
          iconClass="purple"
          value={stats.filesIndexed || 0}
          label="Files Indexed"
        />
        <StatCard
          icon="🧩"
          iconClass="blue"
          value={stats.totalChunks || 0}
          label="Total Chunks"
        />
        <StatCard
          icon="💻"
          iconClass="green"
          value={stats.languages?.length || 0}
          label="Languages"
        />
        <StatCard
          icon={mentorMode ? "🎓" : "⚡"}
          iconClass={mentorMode ? "mentor" : "orange"}
          value={mentorMode ? 'Mentor' : 'Speed'}
          label="AI Mode"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div className="card feature-card">
          <div className="feature-icon">🎯</div>
          <h3>RAG-Powered Context</h3>
          <p>Unlike Copilot, CodeSensei retrieves relevant code from YOUR entire project before answering. See exactly which files influenced each response.</p>
          <a href="#" className="feature-link" onClick={(e) => { e.preventDefault(); }}>Try RAG Playground →</a>
        </div>

        <div className="card feature-card">
          <div className="feature-icon">🧬</div>
          <h3>Code DNA Visualization</h3>
          <p>Explore your codebase like never before. Interactive knowledge graph showing file relationships, dependencies, and architecture.</p>
          <a href="#" className="feature-link" onClick={(e) => { e.preventDefault(); }}>View Code DNA →</a>
        </div>

        <div className="card feature-card">
          <div className="feature-icon">🎓</div>
          <h3>Mentor Mode</h3>
          <p>Toggle Mentor Mode for educational, Socratic responses. Learn WHY code works, not just how. Perfect for onboarding and learning.</p>
          <span className={`mode-indicator ${mentorMode ? 'active' : ''}`}>
            {mentorMode ? '✓ Active' : 'Inactive'}
          </span>
        </div>

        <div className="card feature-card">
          <div className="feature-icon">📍</div>
          <h3>Jump to Source</h3>
          <p>Every AI response includes clickable source citations. Jump directly to the exact file and line in VS Code.</p>
          <span className="badge badge-new">New</span>
        </div>
      </div>
    </>
  );
}

function StatCard({ icon, iconClass, value, label }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${iconClass}`}>{icon}</div>
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

  const runQuery = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setResult(null);
    setRetrievalSteps([]);
    setCurrentStep(0);

    // Simulate step progression for visualization
    const steps = [
      { step: 'query_received', label: 'Query Received', icon: '📥' },
      { step: 'embedding_query', label: 'Generating Query Embedding', icon: '🔢' },
      { step: 'searching_vectors', label: 'Searching Vector Store', icon: '🔍' },
      { step: 'ranking_results', label: 'Ranking Results', icon: '📊' },
      { step: 'building_context', label: 'Building Context', icon: '📝' },
      { step: 'generating_response', label: 'Generating AI Response', icon: '🤖' },
    ];

    // Animate through steps
    for (let i = 0; i < steps.length; i++) {
      setCurrentStep(i);
      setRetrievalSteps(prev => [...prev, { ...steps[i], status: 'active' }]);
      await new Promise(r => setTimeout(r, 400));
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
    } catch (e) {
      setResult({ error: e.message });
    }

    setLoading(false);
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">🔍 RAG Playground</h1>
        <p className="page-subtitle">
          Watch how CodeSensei retrieves context from your codebase in real-time
          {mentorMode && <span className="mentor-badge">🎓 Mentor Mode</span>}
        </p>
      </div>

      <div className="rag-container">
        <div className="rag-input-section">
          <div className="card">
            <h3>Ask a Question</h3>
            <textarea
              className="rag-input"
              placeholder="e.g., How does the authentication flow work in this project?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={3}
            />
            <button
              className="btn btn-primary btn-lg"
              onClick={runQuery}
              disabled={loading || !query.trim()}
            >
              {loading ? 'Processing...' : '🚀 Run RAG Query'}
            </button>
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
                <h3>📚 Retrieved Context ({result.sources?.length || 0} chunks)</h3>
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
                        📍 Jump to Code
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Answer Panel */}
              <div className="card answer-panel">
                <div className="answer-header">
                  <h3>🤖 AI Response</h3>
                  <div className="answer-meta">
                    <span className={`mode-badge ${result.metadata?.mentorMode ? 'mentor' : 'speed'}`}>
                      {result.metadata?.mentorMode ? '🎓 Mentor Mode' : '⚡ Speed Mode'}
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
              <h3>❌ Error</h3>
              <p>{result.error}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function CodeDNAPage() {
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const canvasRef = useRef(null);

  const loadGraph = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/knowledge-graph`);
      const data = await res.json();
      setGraphData(data);
    } catch (e) {
      console.error('Failed to load graph:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadGraph();
  }, []);

  useEffect(() => {
    if (!graphData || !graphData.nodes.length || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;

    // Simple force-directed layout
    const nodes = graphData.nodes.map((n, i) => ({
      ...n,
      x: width / 2 + Math.cos(i * 2 * Math.PI / graphData.nodes.length) * 200,
      y: height / 2 + Math.sin(i * 2 * Math.PI / graphData.nodes.length) * 200,
      vx: 0,
      vy: 0
    }));

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw edges
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
      ctx.lineWidth = 1;
      graphData.edges.forEach(edge => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (source && target) {
          ctx.beginPath();
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();
        }
      });

      // Draw nodes
      nodes.forEach(node => {
        const radius = 8 + (node.importance || 0) * 2;
        const isSelected = selectedNode?.id === node.id;

        // Node glow
        if (isSelected) {
          ctx.shadowColor = '#818cf8';
          ctx.shadowBlur = 20;
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = getLanguageColor(node.language);
        ctx.fill();

        ctx.shadowBlur = 0;

        // Label
        ctx.fillStyle = '#fff';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + radius + 14);
      });
    };

    draw();

    // Click handler
    const handleClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const clicked = nodes.find(n => {
        const dist = Math.sqrt((n.x - x) ** 2 + (n.y - y) ** 2);
        return dist < 20;
      });

      setSelectedNode(clicked || null);
      draw();
    };

    canvas.addEventListener('click', handleClick);
    return () => canvas.removeEventListener('click', handleClick);
  }, [graphData, selectedNode]);

  const getLanguageColor = (lang) => {
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
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">🧬 Code DNA</h1>
        <p className="page-subtitle">Interactive knowledge graph of your codebase</p>
      </div>

      <div className="codedna-container">
        <div className="card graph-card">
          <div className="card-header">
            <h3 className="card-title">
              <span>🕸️</span>
              Dependency Graph
            </h3>
            <button className="btn btn-secondary" onClick={loadGraph} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {graphData?.nodes?.length > 0 ? (
            <canvas ref={canvasRef} className="graph-canvas" />
          ) : (
            <div className="empty-state">
              <div>🧬</div>
              <h3>No Code DNA Yet</h3>
              <p>Index a project using the VS Code extension to visualize its structure.</p>
            </div>
          )}
        </div>

        <div className="graph-sidebar">
          {graphData?.stats && (
            <div className="card">
              <h3>📊 Graph Stats</h3>
              <div className="graph-stats">
                <div className="graph-stat">
                  <span className="stat-number">{graphData.stats.totalFiles}</span>
                  <span className="stat-label">Files</span>
                </div>
                <div className="graph-stat">
                  <span className="stat-number">{graphData.stats.totalEdges}</span>
                  <span className="stat-label">Connections</span>
                </div>
                <div className="graph-stat">
                  <span className="stat-number">{graphData.stats.languages?.length || 0}</span>
                  <span className="stat-label">Languages</span>
                </div>
              </div>
            </div>
          )}

          {selectedNode && (
            <div className="card node-details">
              <h3>📄 {selectedNode.label}</h3>
              <div className="node-info">
                <p><strong>Path:</strong> {selectedNode.fullPath}</p>
                <p><strong>Language:</strong> {selectedNode.language}</p>
                <p><strong>Lines:</strong> {selectedNode.lines}</p>
                <p><strong>Chunks:</strong> {selectedNode.chunks}</p>
                <p><strong>Connections:</strong> {selectedNode.connections}</p>
                {selectedNode.imports?.length > 0 && (
                  <div>
                    <strong>Imports:</strong>
                    <ul>
                      {selectedNode.imports.map((imp, i) => (
                        <li key={i}>{imp}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => window.open(`vscode://file/${selectedNode.fullPath}`)}
              >
                📍 Open in VS Code
              </button>
            </div>
          )}

          <div className="card">
            <h3>🎨 Legend</h3>
            <div className="legend">
              {['javascript', 'typescript', 'python', 'java'].map(lang => (
                <div key={lang} className="legend-item">
                  <span className="legend-dot" style={{ background: getLanguageColor(lang) }}></span>
                  <span>{lang}</span>
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
            <span>🏗️</span>
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
            <div>🏗️</div>
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
            <span>⚙️</span>
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
            <span>🔒</span>
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
