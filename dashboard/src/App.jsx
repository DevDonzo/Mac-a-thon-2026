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
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [retrievalSteps, setRetrievalSteps] = useState([]);
  const [currentStep, setCurrentStep] = useState(-1);
  const [recentChats, setRecentChats] = useState([]);
  const [chatId, setChatId] = useState(Date.now());
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, retrievalSteps]);

  // Load recent chats
  useEffect(() => {
    const saved = localStorage.getItem('codesensei_chats');
    if (saved) {
      try {
        setRecentChats(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse chats', e);
      }
    }
  }, []);

  const saveToHistory = (newMessages) => {
    if (newMessages.length === 0) return;

    const lastUserMsg = newMessages.findLast(m => m.role === 'user')?.content || 'New Chat';
    const lastAiMsg = newMessages.findLast(m => m.role === 'assistant')?.content || '...';

    const chatSession = {
      id: chatId,
      query: lastUserMsg,
      preview: lastAiMsg.substring(0, 60) + '...',
      timestamp: new Date().toISOString(),
      messages: newMessages, // Save full transcript
      mentorMode
    };

    const others = recentChats.filter(c => c.id !== chatId);
    const updated = [chatSession, ...others].slice(0, 20);
    setRecentChats(updated);
    localStorage.setItem('codesensei_chats', JSON.stringify(updated));
  };

  const loadPastChat = (chat) => {
    setChatId(chat.id);
    setMessages(chat.messages || []); // Support legacy format fallback
    if (!chat.messages) {
      // Legacy fallback: if old format, just show the query
      setMessages([{ role: 'user', content: chat.query, timestamp: chat.timestamp }]);
    }
  };

  const clearHistory = () => {
    if (confirm('Clear all chat history?')) {
      setRecentChats([]);
      localStorage.removeItem('codesensei_chats');
      startNewChat();
    }
  };

  const startNewChat = () => {
    setChatId(Date.now());
    setMessages([]);
    setRetrievalSteps([]);
    setInput('');
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg = { role: 'user', content: input, timestamp: new Date().toISOString() };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setLoading(true);
    setRetrievalSteps([]);

    // Simulate RAG steps for UI
    const steps = [
      { label: 'Analyzing Intent...', icon: '🧠' },
      { label: 'Searching Codebase...', icon: '🔍' },
      { label: 'Reading Context...', icon: '📖' },
      { label: 'Generating Answer...', icon: '✨' },
    ];

    try {
      // Fake progress for visual feedback
      for (let i = 0; i < steps.length; i++) {
        setRetrievalSteps(prev => [...prev, { ...steps[i], status: 'active' }]);
        await new Promise(r => setTimeout(r, 600));
        setRetrievalSteps(prev => {
          const copy = [...prev];
          copy[i].status = 'complete';
          return copy;
        });
      }

      const res = await fetch(`${API_URL}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userMsg.content,
          // Send last 4 messages as conversational context
          context: newHistory.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n'),
          mentorMode
        })
      });

      const data = await res.json();

      const aiMsg = {
        role: 'assistant',
        content: data.answer,
        sources: data.sources,
        timestamp: new Date().toISOString(),
        metadata: data.metadata
      };

      const finalMessages = [...newHistory, aiMsg];
      setMessages(finalMessages);
      saveToHistory(finalMessages);
      setRetrievalSteps([]); // Clear steps after done

    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${e.message}. Please check if the backend is running.`,
        isError: true
      }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="page-title">RAG Chat</h1>
            <p className="page-subtitle">
              {mentorMode ? 'Mentor Mode Active 🎓' : 'Ask questions about your codebase'}
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={startNewChat}>
            + New Chat
          </button>
        </div>
      </div>

      <div className="rag-layout">
        {/* Chat Area */}
        <div className="chat-container">
          <div className="chat-messages">
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', marginTop: '100px', opacity: 0.6 }}>
                <h2>👋 Hi there!</h2>
                <p>I've indexed your codebase. Ask me anything!</p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setInput('Explain the project structure')}>Explain Project</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setInput('Find any bugs in server.js')}>Find Bugs</button>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.role}`}>
                <div className="message-avatar">
                  {msg.role === 'user' ? '👤' : '🤖'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                  <div className="message-content">
                    {msg.content}
                  </div>

                  {/* Sources (only for assistant) */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="sources-grid">
                      {msg.sources.map((src, idx) => (
                        <div key={idx} className="mini-source-card" onClick={() => window.open(`vscode://file/${src.path}:${src.startLine}`)}>
                          <div className="mini-source-path">{src.path}</div>
                          <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>Lines {src.lines}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="message-meta">
                    {new Date(msg.timestamp || Date.now()).toLocaleTimeString()}
                    {msg.metadata && <span> • {msg.metadata.timeMs}ms</span>}
                  </div>
                </div>
              </div>
            ))}

            {/* Visualizing Retrieval Process in Chat */}
            {loading && retrievalSteps.length > 0 && (
              <div className="retrieval-indicator">
                <div className="step-spinner"></div>
                <span>{retrievalSteps.findLast(s => s.status === 'active')?.label || 'Thinking...'}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="chat-input-area">
            <div className="chat-input-wrapper">
              <textarea
                className="chat-input"
                placeholder="Type your question here... (Enter to send)"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                className="chat-send-btn"
                onClick={handleSend}
                disabled={loading || !input.trim()}
              >
                ➤
              </button>
            </div>
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
              <div
                key={chat.id}
                className={`history-item ${chat.id === chatId ? 'active' : ''}`}
                onClick={() => loadPastChat(chat)}
              >
                <div className="history-query">{chat.query}</div>
                <div className="history-preview">{chat.preview}</div>
                <div className="history-meta">
                  <span>{new Date(chat.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
            {recentChats.length === 0 && (
              <div className="history-empty">No history</div>
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
