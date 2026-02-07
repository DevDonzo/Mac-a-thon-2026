import { useState, useEffect, useRef } from 'react';
import './App.css';
import ForceGraph2D from 'react-force-graph-2d';
import mermaid from 'mermaid';
import {
  Activity,
  MessageSquare,
  GitGraph,
  Layers,
  CheckCircle,
  XCircle,
  Trash2,
  Search,
  Send,
  Cpu,
  Shield,
  Zap,
  Code,
  Terminal,
  ArrowRight
} from 'lucide-react';

const API_URL = 'http://localhost:3000';

mermaid.initialize({
  startOnLoad: true,
  theme: 'base',
  securityLevel: 'loose',
  flowchart: {
    curve: 'basis',
    htmlLabels: true,
    useMaxWidth: false
  },
  themeVariables: {
    primaryColor: '#000000',
    primaryTextColor: '#ededed',
    primaryBorderColor: '#27272a',
    lineColor: '#ededed',
    secondaryColor: '#0a0a0a',
    tertiaryColor: '#171717',
    fontSize: '14px',
    fontFamily: 'Inter',
    nodeBorder: '#27272a',
    mainBkg: '#0a0a0a',
    textColor: '#ededed',
  }
});

function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [status, setStatus] = useState({ ready: false, index: null });
  const [loading, setLoading] = useState(true);
  const [mentorMode, setMentorMode] = useState(false);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/health`);
      if (!res.ok) throw new Error('Backend responded with error');
      const data = await res.json();
      setStatus({ ready: true, ...data });
      setLoading(false);
    } catch (e) {
      console.error('Status fetch failed:', e);
      setStatus({ ready: false, index: null, error: e.message });
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
            <Cpu size={24} />
            <span>CodeSensei</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-section-title">Main</div>
            <NavItem
              icon={<Activity size={18} />}
              label="Overview"
              active={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}
            />
            <NavItem
              icon={<MessageSquare size={18} />}
              label="RAG Chat"
              active={activeTab === 'rag'}
              onClick={() => setActiveTab('rag')}
            />
            <NavItem
              icon={<GitGraph size={18} />}
              label="Code DNA"
              active={activeTab === 'codedna'}
              onClick={() => setActiveTab('codedna')}
            />
          </div>

          <div className="nav-section">
            <div className="nav-section-title">Analysis</div>
            <NavItem
              icon={<Layers size={18} />}
              label="Architecture"
              active={activeTab === 'architecture'}
              onClick={() => setActiveTab('architecture')}
            />
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="status-card">
            <div className="status-row">
              <span className="status-label">Backend</span>
              <span className="status-value">
                {status.ready ? <CheckCircle size={14} className="text-success" /> : <XCircle size={14} className="text-error" />}
                <span style={{ marginLeft: '8px' }}>{status.ready ? 'Online' : 'Offline'}</span>
              </span>
            </div>
            <div className="status-row">
              <span className="status-label">Vertex AI</span>
              <span className="status-value">
                {status.vertexAI === 'connected' ? <CheckCircle size={14} className="text-success" /> : <XCircle size={14} className="text-error" />}
                <span style={{ marginLeft: '8px' }}>{status.vertexAI === 'connected' ? 'Ready' : 'Off'}</span>
              </span>
            </div>
            <div className="status-row" style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
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
        {!status.ready && !loading && (
          <div className="card" style={{ borderLeft: '4px solid var(--text-primary)', background: 'var(--bg-secondary)' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><XCircle size={20} /> Backend Disconnected</h3>
            <p style={{ margin: '8px 0 0 0', opacity: 0.7 }}>Ensure the server is running on port 3000.</p>
          </div>
        )}

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
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <div className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function OverviewPage({ stats, status, loading, mentorMode }) {
  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <span>Connecting...</span>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Overview</h1>
        <p className="page-subtitle">System status and project metrics.</p>
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
          value={mentorMode ? 'Active' : 'Diff'}
          label="Mentor Mode"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div className="card feature-card">
          <div className="feature-header">
            <Search size={24} />
            <h3>RAG Context</h3>
          </div>
          <p>Retrieve relevant code from your project before answering. See exactly which files influenced each response.</p>
        </div>

        <div className="card feature-card">
          <div className="feature-header">
            <GitGraph size={24} />
            <h3>Knowledge Graph</h3>
          </div>
          <p>Interactive visualization of your codebase. Explore file relationships, dependencies, and architecture.</p>
        </div>

        <div className="card feature-card">
          <div className="feature-header">
            <Code size={24} />
            <h3>Source Citations</h3>
          </div>
          <p>Every AI response includes clickable source citations. Jump directly to the exact file and line.</p>
        </div>
      </div>

      {/* Privacy Hero Banner Moved to Bottom */}
      <div className="privacy-hero" style={{ marginTop: '24px' }}>
        <div className="privacy-hero-content">
          <div className="privacy-hero-icon"><Shield size={32} /></div>
          <div>
            <h3>Enterprise-Grade Privacy</h3>
            <p>Your code NEVER leaves your Google Cloud project. Full data sovereignty.</p>
          </div>
        </div>
        <div className="privacy-badges">
          <span className="badge">SOC 2 Ready</span>
          <span className="badge">Your GCP</span>
          <span className="badge">Zero Sharing</span>
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
  const [recentChats, setRecentChats] = useState([]);
  const [chatId, setChatId] = useState(Date.now());
  const [confirmClear, setConfirmClear] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, retrievalSteps]);

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
      messages: newMessages,
      mentorMode
    };

    const others = recentChats.filter(c => c.id !== chatId);
    const updated = [chatSession, ...others].slice(0, 20);
    setRecentChats(updated);
    localStorage.setItem('codesensei_chats', JSON.stringify(updated));
  };

  const loadPastChat = (chat) => {
    setChatId(chat.id);
    setMessages(chat.messages || []);
    if (!chat.messages) {
      setMessages([{ role: 'user', content: chat.query, timestamp: chat.timestamp }]);
    }
  };

  const clearHistory = () => {
    setRecentChats([]);
    localStorage.removeItem('codesensei_chats');
    startNewChat();
    setConfirmClear(false);
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

    // Visual feedback steps
    const steps = [
      { label: 'Analyzing Intent', icon: <Search size={14} /> },
      { label: 'Scanning Codebase', icon: <Terminal size={14} /> },
      { label: 'Reading Context', icon: <Code size={14} /> },
      { label: 'Synthesizing Response', icon: <Zap size={14} /> },
    ];

    try {
      // Parallel simulated steps for UI while waiting
      for (let i = 0; i < steps.length; i++) {
        setRetrievalSteps(prev => [...prev, { ...steps[i], status: 'active' }]);
        await new Promise(r => setTimeout(r, 400));
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
          context: newHistory.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n'),
          mentorMode
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Server error');
      }

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
    } catch (e) {
      console.error('Chat error:', e);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${e.message}`,
        isError: true,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setLoading(false);
      setRetrievalSteps([]);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Chat</h1>
          <p className="page-subtitle">
            {mentorMode ? 'Mentor Mode Active' : 'Ask questions about your codebase'}
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={startNewChat}>
          + New Chat
        </button>
      </div>

      <div className="rag-layout">
        {/* Chat Container */}
        <div className="chat-container">
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon"><MessageSquare size={48} /></div>
                <h3>CodeSensei Ready</h3>
                <p>Context-aware AI assistant for your project.</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.role}`}>
                <div className="message-avatar">
                  {msg.role === 'user' ? <Activity size={18} /> : <Cpu size={18} />}
                </div>
                <div className="message-bubble">
                  <div className="message-content">
                    {msg.content}
                  </div>

                  {msg.sources && msg.sources.length > 0 && (
                    <div className="sources-grid">
                      {msg.sources.map((src, idx) => (
                        <div key={idx} className="mini-source-card" onClick={() => window.open(`vscode://file/${src.path}:${src.startLine}`)}>
                          <div className="mini-source-path">{src.path}</div>
                          <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>Lines {src.lines}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="message-meta">
                    {new Date(msg.timestamp || Date.now()).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}

            {loading && retrievalSteps.length > 0 && (
              <div className="retrieval-indicator">
                <div className="step-spinner"></div>
                <span>{retrievalSteps.findLast(s => s.status === 'active')?.label || 'Thinking...'}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-area">
            <div className="chat-input-wrapper">
              <textarea
                className="chat-input"
                placeholder="Ask about your code..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                className="chat-send-btn"
                onClick={handleSend}
                disabled={loading || !input.trim()}
              >
                <ArrowRight size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* History Sidebar */}
        <aside className="rag-history-sidebar">
          <div className="history-header">
            <h3>Recent</h3>
            {recentChats.length > 0 && !confirmClear && (
              <button className="btn-icon" onClick={() => setConfirmClear(true)}>
                <Trash2 size={16} />
              </button>
            )}
            {confirmClear && (
              <div className="confirm-actions">
                <span>Sure?</span>
                <button className="confirm-btn yes" onClick={clearHistory}>Yes</button>
                <button className="confirm-btn no" onClick={() => setConfirmClear(false)}>No</button>
              </div>
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
                <div className="history-meta">
                  <span>{new Date(chat.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
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
          <button className="btn btn-secondary" onClick={loadGraph} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={16} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Rescanning...' : 'Refresh Graph'}
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


// Initialize mermaid logic moved to top of file for theme consistency

import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

function Mermaid({ chart }) {
  const ref = useRef(null);

  useEffect(() => {
    if (chart && ref.current) {
      ref.current.removeAttribute('data-processed');
      mermaid.contentLoaded();
    }
  }, [chart]);

  return (
    <div className="mermaid-wrapper">
      <TransformWrapper
        initialScale={1}
        initialPositionX={0}
        initialPositionY={0}
        centerOnInit={true}
      >
        <TransformComponent
          wrapperStyle={{ width: "100%", height: "100%" }}
          contentStyle={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}
        >
          <div ref={ref} className="mermaid" style={{ cursor: 'grab' }}>
            {chart}
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}

function ArchitecturePage() {
  const [diagram, setDiagram] = useState('');
  const [loading, setLoading] = useState(false);

  const generateDiagram = async () => {
    setLoading(true);
    setDiagram(''); // Clear old diagram
    try {
      const res = await fetch(`${API_URL}/api/architecture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();

      setDiagram((data.diagram || '').trim());
    } catch (e) {
      console.error('Failed to generate diagram:', e);
      setDiagram('Error: Could not connect to backend');
    }
    setLoading(false);
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Architecture</h1>
        <p className="page-subtitle">Automatic system design visualization powered by Gemini</p>
      </div>

      <div className="card architecture-card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 className="card-title" style={{ margin: 0 }}>
            System Architecture
          </h3>
          <button
            className={`btn ${loading ? 'btn-secondary' : 'btn-primary'}`}
            onClick={generateDiagram}
            disabled={loading}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="spinner-sm"></div> Analyzing Codebase...
              </span>
            ) : 'Generate Diagram'}
          </button>
        </div>

        <div className="architecture-viewport">
          {diagram && !loading ? (
            <Mermaid chart={diagram} />
          ) : (
            <div className={`architecture-empty ${loading ? 'loading' : ''}`}>
              {loading ? (
                <div className="analysis-indicator">
                  <div className="pulse-circle"></div>
                  <p>Gemini is mapping dependencies and grouping components...</p>
                </div>
              ) : (
                <>
                  <div className="empty-icon"><Layers size={48} /></div>
                  <h3>Ready to Map Architecture</h3>
                  <p>Analyze your indexed files and generate a living architectural diagram.</p>
                </>
              )}
            </div>
          )}
        </div>
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
