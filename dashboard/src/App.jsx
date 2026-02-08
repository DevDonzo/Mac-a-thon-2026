import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './App.css';
import ForceGraph2D from 'react-force-graph-2d';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ReactMarkdown from 'react-markdown';
import {
  Activity,
  MessageSquare,
  GitGraph,
  Layers,
  CheckCircle,
  XCircle,
  AlertCircle,
  Trash2,
  Search,
  Cpu,
  Shield,
  Code,
  ArrowRight,
  PanelRightOpen,
  PanelRightClose,
  Plus,
} from 'lucide-react';

const API_URL = 'http://localhost:3000';

function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [status, setStatus] = useState({ ready: false, index: null });
  const [loading, setLoading] = useState(true);
  const [mentorMode, setMentorMode] = useState(false);
  const mainRef = useRef(null);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to top when tab changes
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [activeTab]);

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
            <div className="nav-section-title">Builder</div>
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
                {status.ready ? <CheckCircle size={13} className="icon-success" /> : <XCircle size={13} className="icon-error" />}
                <span className="status-text">{status.ready ? 'Online' : 'Offline'}</span>
              </span>
            </div>
            <div className="status-row">
              <span className="status-label">Vertex AI</span>
              <span className="status-value">
                {status.vertexAI === 'connected' ? <CheckCircle size={13} className="icon-success" /> : <XCircle size={13} className="icon-error" />}
                <span className="status-text">{status.vertexAI === 'connected' ? 'Ready' : 'Off'}</span>
              </span>
            </div>
            <div className="status-row status-row-divider">
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
      <main className="main" ref={mainRef}>
        {/* Workspace Banner */}
        <div className={`workspace-banner ${status.indexing?.isIndexing ? 'indexing' :
          (status.workspace || stats.filesIndexed > 0) ? '' : 'empty'
          }`}>
          {status.indexing?.isIndexing ? (
            <div className="spinner-sm" />
          ) : (status.workspace || stats.filesIndexed > 0) ? (
            <CheckCircle size={16} className="icon-success banner-icon" />
          ) : (
            <AlertCircle size={16} className="icon-warning banner-icon" />
          )}
          <div className="workspace-banner-info">
            <div className="workspace-banner-label">
              {status.indexing?.isIndexing ? 'Indexing' :
                (status.workspace || stats.filesIndexed > 0) ? 'Indexed Workspace' : 'No Workspace'}
            </div>
            <div className="workspace-banner-path">
              {status.workspace ? (
                <>
                  {status.workspace}
                  {status.indexing?.isIndexing && status.indexing.currentFile && (
                    <span className="indexing-file">→ {status.indexing.currentFile}</span>
                  )}
                </>
              ) : stats.filesIndexed > 0 ? (
                <span className="text-secondary">
                  {stats.projectId || 'Project'} ({stats.filesIndexed} files indexed)
                </span>
              ) : (
                <span className="text-muted">Open a workspace in VS Code to begin</span>
              )}
            </div>
          </div>
          <div className="workspace-banner-count">
            {stats.filesIndexed || 0} files
          </div>
        </div>

        {!status.ready && !loading && (
          <div className="card disconnected-card">
            <h3 className="disconnected-title"><XCircle size={20} /> Backend Disconnected</h3>
            <p className="disconnected-text">Ensure the server is running on port 3000.</p>
          </div>
        )}

        {activeTab === 'overview' && (
          <OverviewPage stats={stats} status={status} loading={loading} mentorMode={mentorMode} />
        )}
        {activeTab === 'rag' && (
          <RAGPlaygroundPage mentorMode={mentorMode} status={status} />
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
  const [indexing, setIndexing] = useState(false);
  const [indexResult, setIndexResult] = useState(null);

  const handleIndexProject = async () => {
    setIndexing(true);
    setIndexResult(null);

    try {
      // Trigger re-index of last workspace
      const response = await fetch(`${API_URL}/api/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'workspace-reindex'
        })
      });

      const data = await response.json();
      setIndexResult(data.success ? 'success' : 'error');

      // Refresh page after 2 seconds
      setTimeout(() => window.location.reload(), 2000);
    } catch {
      setIndexResult('error');
    } finally {
      setIndexing(false);
    }
  };

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
        <div className="page-header-row">
          <div>
            <h1 className="page-title">Overview</h1>
            <p className="page-subtitle">
              {status.workspace
                ? `Workspace: ${status.workspace.split('/').pop()}`
                : 'System status and project metrics'}
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleIndexProject}
            disabled={indexing || !status.ready}
            title={!status.ready ? 'Backend is disconnected' : 'Refresh the project index'}
          >
            {indexing ? 'Indexing...' : 'Re-Index Project'}
          </button>
        </div>
        {indexResult === 'success' && (
          <div className="alert-card success">
            ✓ Workspace indexed successfully! Refreshing...
          </div>
        )}
        {indexResult === 'error' && (
          <div className="alert-card error">
            ✗ Indexing failed. Check backend logs.
          </div>
        )}
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
          value={mentorMode ? 'On' : 'Off'}
          label="Mentor Mode"
        />
      </div>

      <div className="features-grid">
        <div className="card feature-card">
          <div className="feature-header">
            <Search size={20} />
            <h3>RAG Context</h3>
          </div>
          <p>Retrieves relevant code from your project before answering. See which files influenced each response.</p>
        </div>

        <div className="card feature-card">
          <div className="feature-header">
            <GitGraph size={20} />
            <h3>Knowledge Graph</h3>
          </div>
          <p>Interactive visualization of your codebase. Explore file relationships and architecture.</p>
        </div>

        <div className="card feature-card">
          <div className="feature-header">
            <Code size={20} />
            <h3>Source Citations</h3>
          </div>
          <p>Every AI response includes clickable source citations. Jump to the exact file and line.</p>
        </div>
      </div>

      <div className="privacy-hero">
        <div className="privacy-hero-content">
          <div className="privacy-hero-icon"><Shield size={28} /></div>
          <div>
            <h3>Enterprise-Grade Privacy</h3>
            <p>Your code never leaves your Google Cloud project. Full data sovereignty.</p>
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

function RAGPlaygroundPage({ mentorMode, status }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [retrievalSteps, setRetrievalSteps] = useState([]);
  const [recentChats, setRecentChats] = useState([]);
  const [chatId, setChatId] = useState(Date.now());
  const [threadId, setThreadId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    // Only scroll if there are messages (don't scroll on initial mount)
    if (messages.length > 0) {
      scrollToBottom();
    }
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
      mentorMode,
      threadId // Store the Backboard threadId
    };

    const others = recentChats.filter(c => c.id !== chatId);
    const updated = [chatSession, ...others].slice(0, 20);
    setRecentChats(updated);
    localStorage.setItem('codesensei_chats', JSON.stringify(updated));
  };

  const loadPastChat = (chat) => {
    setChatId(chat.id);
    setThreadId(chat.threadId || null);
    setMessages(chat.messages || []);
    if (!chat.messages) {
      setMessages([{ role: 'user', content: chat.query, timestamp: chat.timestamp }]);
    }
  };

  const deleteChat = (chatIdToDelete) => {
    const updated = recentChats.filter(c => c.id !== chatIdToDelete);
    setRecentChats(updated);
    localStorage.setItem('codesensei_chats', JSON.stringify(updated));
    if (chatIdToDelete === chatId) {
      startNewChat();
    }
  };

  const startNewChat = async () => {
    setChatId(Date.now());
    setMessages([]);
    setRetrievalSteps([]);
    setThreadId(null);
    setInput('');

    // Fetch new Backboard thread if enabled
    try {
      const res = await fetch(`${API_URL}/api/chat/thread`, { method: 'POST' });
      const data = await res.json();
      if (data.id) setThreadId(data.id);
    } catch (e) {
      console.error('Failed to init thread', e);
    }
  };

  useEffect(() => {
    if (messages.length === 0 && !threadId) {
      startNewChat();
    }
  }, []);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg = { role: 'user', content: input, timestamp: new Date().toISOString() };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setLoading(true);
    setRetrievalSteps([]);

    try {
      const res = await fetch(`${API_URL}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userMsg.content,
          context: [{
            path: 'conversation',
            content: newHistory.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n')
          }],
          mentorMode,
          threadId // Pass threadId for memory
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Server error');
      }

      const data = await res.json();

      if (data?.metadata?.retrievalSteps?.length) {
        setRetrievalSteps(data.metadata.retrievalSteps);
      }

      // Sync threadId if backend auto-created it
      if (data.threadId && data.threadId !== threadId) {
        setThreadId(data.threadId);
      }

      const aiMsg = {
        role: 'assistant',
        content: data.answer,
        sources: data.sources,
        workspacePath: data.workspacePath, // Store workspace path from response
        timestamp: new Date().toISOString(),
        metadata: data.metadata,
        threadId: data.threadId // Keep record
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

  const deleteMessage = (index) => {
    const updated = messages.filter((_, i) => i !== index);
    setMessages(updated);
    saveToHistory(updated);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <div className="page-header page-header-row">
        <div>
          <h1 className="page-title">Chat</h1>
          <p className="page-subtitle">
            {mentorMode ? 'Mentor Mode Active' : 'Ask questions about your codebase'}
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary btn-sm" onClick={startNewChat}>
            <Plus size={14} /> New Chat
          </button>
          <button
            className="btn btn-secondary btn-sm btn-icon-only"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? 'Hide history' : 'Show history'}
          >
            {sidebarOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
        </div>
      </div>

      <div className="rag-layout">
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
                  {msg.role === 'user' ? <Activity size={16} /> : <Cpu size={16} />}
                </div>
                <div className="message-bubble">
                  <div className="message-content">
                    <ReactMarkdown
                      components={{
                        code({ node, children, ...props }) {
                          const isBlock = node?.position?.start?.line !== node?.position?.end?.line
                            || String(children).includes('\n');
                          return isBlock ? (
                            <pre className="code-block">
                              <code {...props}>{children}</code>
                            </pre>
                          ) : (
                            <code className="inline-code" {...props}>{children}</code>
                          );
                        },
                        pre: ({ children }) => <>{children}</>,
                        p: ({ children }) => <p className="md-p">{children}</p>,
                        ul: ({ children }) => <ul className="md-list">{children}</ul>,
                        ol: ({ children }) => <ol className="md-list md-ol">{children}</ol>,
                        li: ({ children }) => <li className="md-li">{children}</li>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>

                  {msg.sources && msg.sources.length > 0 && (() => {
                    const deduped = [];
                    const seen = new Set();
                    for (const src of msg.sources) {
                      const relPath = src.path.startsWith('/') ? src.path.slice(1) : src.path;
                      if (!seen.has(relPath)) {
                        seen.add(relPath);
                        deduped.push({ ...src, relPath });
                      }
                    }
                    return (
                    <div className="sources-grid">
                      {deduped.map((src, idx) => {
                        const wsPath = msg.workspacePath || status?.workspace || '/Users/hparacha/Projects/Mac-a-thon-2026';
                        const fullPath = `${wsPath}/${src.relPath}`;
                        const fileName = src.relPath.split('/').pop();
                        const dirPath = src.relPath.split('/').slice(0, -1).join('/');

                        return (
                          <a
                            key={idx}
                            className="mini-source-card"
                            href={`vscode://file${fullPath.startsWith('/') ? '' : '/'}${fullPath}:${src.startLine || 1}`}
                            title={fullPath}
                          >
                            <div className="mini-source-path">📄 {fileName}</div>
                            <div className="mini-source-lines">
                              {dirPath && <span>{dirPath}</span>}
                            </div>
                          </a>
                        );
                      })}
                    </div>
                    );
                  })()}

                  {msg.metadata?.retrievalSteps && msg.metadata.retrievalSteps.length > 0 && (
                    <div className="evidence-steps">
                      <div className="evidence-title">
                        <Search size={14} />
                        <span>Evidence Trail</span>
                      </div>
                      <ul className="evidence-list">
                        {msg.metadata.retrievalSteps.map((step, idx) => (
                          <li key={idx}>
                            <span className="evidence-step">
                              {step.step.replace(/_/g, ' ')}
                            </span>
                            <span className="evidence-meta">
                              {typeof step.timestamp === 'number' ? `${step.timestamp}ms` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="message-footer">
                    <div className="message-meta">
                      {new Date(msg.timestamp || Date.now()).toLocaleTimeString()}
                    </div>
                    <button
                      className="message-delete-btn"
                      onClick={() => deleteMessage(i)}
                      title="Delete message"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="retrieval-indicator">
                <div className="step-spinner" />
                <span>Thinking...</span>
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
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </div>

        {sidebarOpen && (
          <aside className="rag-history-sidebar">
            <div className="history-header">
              <h3>Recent</h3>
            </div>
            <div className="history-list">
              {recentChats.length === 0 && (
                <div className="history-empty">No chats yet</div>
              )}
              {recentChats.map((chat) => (
                <div
                  key={chat.id}
                  className={`history-item ${chat.id === chatId ? 'active' : ''}`}
                  onClick={() => loadPastChat(chat)}
                >
                  <div className="history-query">{chat.query}</div>
                  <div className="history-item-footer">
                    <span className="history-meta">
                      {new Date(chat.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button
                      className="history-delete-btn"
                      onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
                      title="Delete chat"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
    </>
  );
}

function CodeDNAPage() {
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [showSymbols, setShowSymbols] = useState(false);
  const [graphWidth, setGraphWidth] = useState(800);
  const containerRef = useRef(null);

  const getSymbolColor = (type) => {
    const colors = {
      'function': '#e5e5e5',
      'class': '#a0a0a0',
      'variable': '#777777',
      'const': '#d5d5d5'
    };
    return colors[type] || '#5a5a5a';
  };

  const loadGraph = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/knowledge-graph`);
      const data = await res.json();

      // Transform file nodes
      const fileNodes = data.nodes.map(n => ({
        ...n,
        id: n.id,
        val: (n.importance || 1) * 2,
        color: getLanguageColor(n.language),
        type: 'file'
      }));

      // Transform symbol nodes (if showSymbols is enabled)
      const symbolNodes = showSymbols && data.symbols ? data.symbols.map(s => ({
        ...s,
        val: 1,
        color: getSymbolColor(s.type),
        type: 'symbol',
        label: `${s.name} (${s.type})`
      })) : [];

      // Combine nodes
      const allNodes = [...fileNodes, ...symbolNodes];

      // Add edges for file imports
      const fileEdges = data.edges || [];

      // Add edges connecting symbols to their files (if showing symbols)
      const symbolEdges = showSymbols && data.symbols ? data.symbols.map(s => ({
        source: s.file,
        target: s.id,
        type: 'contains'
      })) : [];

      const allEdges = [...fileEdges, ...symbolEdges];

      setGraphData({ nodes: allNodes, links: allEdges });
    } catch (e) {
      console.error('Failed to load graph:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadGraph();
  }, [showSymbols]);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current) {
        setGraphWidth(containerRef.current.clientWidth || 800);
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">Code DNA</h1>
            <p className="page-subtitle">
              Interactive knowledge graph · {graphData.nodes.length} nodes · {graphData.links?.length || 0} edges
            </p>
          </div>
          <div className="page-header-actions">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showSymbols}
                onChange={(e) => setShowSymbols(e.target.checked)}
              />
              Show Symbols
            </label>
            <button className="btn btn-secondary" onClick={loadGraph} disabled={loading}>
              <Activity size={16} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Rescanning...' : 'Refresh Graph'}
            </button>
          </div>
        </div>
      </div>

      <div className="codedna-container">
        <div className="card graph-card" ref={containerRef}>
          <div className="graph-legend-overlay">
            <div className="graph-legend-title">Legend</div>
            <div className="graph-legend-items">
              <div className="graph-legend-item">
                <span className="graph-legend-dot" style={{ background: '#e5e5e5' }} />
                <span>JavaScript</span>
              </div>
              {showSymbols && (
                <>
                  <div className="graph-legend-item sub">
                    <span className="graph-legend-dot sm" style={{ background: '#e5e5e5' }} />
                    <span>Function</span>
                  </div>
                  <div className="graph-legend-item sub">
                    <span className="graph-legend-dot sm" style={{ background: '#a0a0a0' }} />
                    <span>Class</span>
                  </div>
                  <div className="graph-legend-item sub">
                    <span className="graph-legend-dot sm" style={{ background: '#777777' }} />
                    <span>Variable</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {graphData.nodes.length > 0 ? (
            <ForceGraph2D
              width={graphWidth}
              height={600}
              graphData={graphData}
              nodeLabel={(node) => `${node.label || node.name}\n${node.type === 'file' ? `${node.symbolCount || 0} symbols` : ''}`}
              nodeColor="color"
              nodeRelSize={6}
              linkColor={(link) => link.type === 'contains' ? 'rgba(160, 160, 160, 0.3)' : 'rgba(255,255,255,0.15)'}
              backgroundColor="#0a0a0a"
              onNodeClick={(node) => setSelectedNode(node)}
              cooldownTicks={100}
              d3AlphaDecay={0.05}
              d3VelocityDecay={0.4}
              d3Force={{
                charge: { strength: -40 },
                link: { distance: 20 },
                center: { strength: 0.8 }
              }}
              nodeCanvasObject={(node, ctx, globalScale) => {
                const label = node.label;
                const fontSize = 12 / globalScale;
                ctx.font = `${fontSize}px Sans-Serif`;

                ctx.fillStyle = 'rgba(255, 255, 255, 0.0)'; // Transparent text background
                ctx.beginPath();
                ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI, false);
                ctx.fillStyle = node.color || '#a0a0a0';
                ctx.fill();

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#d5d5d5';
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
                <p><strong>Language:</strong> <span className="node-lang-color" style={{ color: selectedNode.color }}>{selectedNode.language}</span></p>
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


const ARCHITECTURE_NODE_TYPE = 'architectureNode';

function sanitizeEdgeId(value) {
  return String(value || 'edge').replace(/[^a-zA-Z0-9-_]/g, '_');
}

function buildFlowFromAstGraph(astNodes = [], astEdges = []) {
  const sortedNodes = [...astNodes].sort((a, b) => a.fullPath.localeCompare(b.fullPath));
  const laneMap = new Map();

  sortedNodes.forEach((node) => {
    const lane = node.fullPath.includes('/') ? node.fullPath.split('/')[0] : 'root';
    if (!laneMap.has(lane)) {
      laneMap.set(lane, []);
    }
    laneMap.get(lane).push(node);
  });

  const flowNodes = [];
  const lanes = [...laneMap.keys()].sort();

  lanes.forEach((lane, laneIndex) => {
    const laneNodes = laneMap.get(lane) || [];
    laneNodes.forEach((node, rowIndex) => {
      flowNodes.push({
        id: node.fullPath,
        type: ARCHITECTURE_NODE_TYPE,
        position: {
          x: laneIndex * 340 + (rowIndex % 2) * 12,
          y: rowIndex * 190,
        },
        data: {
          label: node.label || node.fullPath.split('/').pop(),
          path: node.fullPath,
          language: node.language || 'text',
          kind: 'actual',
          goal: '',
          instructions: '',
          templateId: 'code-file',
          category: 'Code',
          icon: 'C',
        },
      });
    });
  });

  const validNodeIds = new Set(flowNodes.map((node) => node.id));
  const flowEdges = astEdges
    .filter((edge) => validNodeIds.has(edge.source) && validNodeIds.has(edge.target))
    .map((edge, index) => ({
      id: sanitizeEdgeId(`ast-${index}-${edge.source}-${edge.target}`),
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
      style: { stroke: '#a0a0a0', strokeWidth: 1.8 },
      data: { kind: 'actual' },
    }));

  return { nodes: flowNodes, edges: flowEdges };
}

const DRAFT_NODE_KIND = 'draft';
const COMPONENT_LIBRARY_TEMPLATES = [
  {
    id: 'blank-component',
    name: 'Blank Component',
    icon: 'BL',
    category: 'Custom',
    description: 'Start from scratch.',
    defaultInstructions: '',
  },
  {
    id: 'ui-screen',
    name: 'UI Screen',
    icon: 'UI',
    category: 'Frontend',
    description: 'User-facing page or screen.',
    defaultInstructions: '',
  },
  {
    id: 'api-route',
    name: 'API Route',
    icon: 'API',
    category: 'Backend',
    description: 'HTTP endpoint and request handling.',
    defaultInstructions: '',
  },
  {
    id: 'service-module',
    name: 'Service Module',
    icon: 'SV',
    category: 'Backend',
    description: 'Business logic and orchestration.',
    defaultInstructions: '',
  },
  {
    id: 'auth-module',
    name: 'Auth Service',
    icon: 'AU',
    category: 'Security',
    description: 'Login, sessions, and permissions.',
    defaultInstructions: '',
  },
  {
    id: 'worker-module',
    name: 'Worker',
    icon: 'WK',
    category: 'Async',
    description: 'Background jobs or scheduled tasks.',
    defaultInstructions: '',
  },
  {
    id: 'database-layer',
    name: 'Database Layer',
    icon: 'DB',
    category: 'Data',
    description: 'Queries, repositories, and persistence.',
    defaultInstructions: '',
  },
  {
    id: 'integration-adapter',
    name: 'Integration',
    icon: 'INT',
    category: 'External',
    description: 'Third-party APIs and adapters.',
    defaultInstructions: '',
  },
];

function getLibraryTemplate(templateId) {
  return COMPONENT_LIBRARY_TEMPLATES.find((template) => template.id === templateId) || COMPONENT_LIBRARY_TEMPLATES[0];
}

function createDraftNodeFromTemplate(template, nodes, dropPosition = null) {
  const draftCount = nodes.filter((node) => node.data?.kind === DRAFT_NODE_KIND).length;
  const maxY = nodes.reduce((highest, node) => Math.max(highest, node.position?.y || 0), 0);
  const nextNodeId = `draft-${template.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const fallbackPosition = {
    x: 120 + (draftCount % 2) * 340,
    y: Math.max(120 + Math.floor(draftCount / 2) * 190, maxY + 180),
  };

  const position = dropPosition
    ? {
      x: Math.round(dropPosition.x || 0),
      y: Math.round(dropPosition.y || 0),
    }
    : fallbackPosition;

  return {
    id: nextNodeId,
    type: ARCHITECTURE_NODE_TYPE,
    position,
    data: {
      label: `${template.name} ${draftCount + 1}`,
      path: '',
      language: '',
      kind: DRAFT_NODE_KIND,
      goal: template.defaultInstructions || '',
      instructions: template.defaultInstructions || '',
      templateId: template.id,
      category: template.category,
      icon: template.icon,
    },
  };
}

function buildBlueprintPayload(nodes, edges) {
  const visualNodes = nodes.map((node) => {
    const name = String(node.data?.label || '').trim();
    const instructions = String(node.data?.instructions || node.data?.goal || '').trim();
    const kind = node.data?.kind === DRAFT_NODE_KIND ? DRAFT_NODE_KIND : 'actual';

    return {
      id: node.id,
      type: node.type || ARCHITECTURE_NODE_TYPE,
      position: {
        x: Math.round(node.position?.x || 0),
        y: Math.round(node.position?.y || 0),
      },
      data: {
        label: name,
        name,
        goal: instructions,
        instructions,
        kind,
        path: node.data?.path || '',
        language: node.data?.language || '',
        templateId: node.data?.templateId || '',
        category: node.data?.category || '',
        icon: node.data?.icon || '',
      },
    };
  });

  const visualEdges = edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type || 'smoothstep',
    label: edge.label || '',
    kind: edge.data?.kind || 'visual',
  }));

  return {
    visualGraph: {
      nodes: visualNodes,
      edges: visualEdges,
    },
    blueprint: {
      nodes: visualNodes.map((node) => ({
        id: node.id,
        name: node.data.name,
        instructions: node.data.instructions,
        kind: node.data.kind,
        path: node.data.path,
        templateId: node.data.templateId,
        category: node.data.category,
      })),
      connections: visualEdges.map((edge) => ({
        id: edge.id,
        from: edge.source,
        to: edge.target,
        label: edge.label,
      })),
    },
  };
}

function ArchitectureFlowNode({ data, selected }) {
  const isDraft = data.kind === DRAFT_NODE_KIND;
  const hasInstructions = Boolean(String(data.instructions || data.goal || '').trim());
  const iconLabel = String(data.icon || (isDraft ? 'D' : 'C'))
    .trim()
    .slice(0, 3)
    .toUpperCase();

  return (
    <div className={`architecture-flow-node ${isDraft ? 'draft' : 'actual'} ${hasInstructions ? 'has-instructions' : ''} ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="architecture-flow-handle" />
      <div className="architecture-flow-node-head">
        <div className="architecture-flow-node-title-wrap">
          <span className={`architecture-flow-node-icon ${isDraft ? 'draft' : 'actual'}`}>
            {iconLabel || (isDraft ? 'D' : 'C')}
          </span>
          <span className="architecture-flow-node-title-text">{data.label || 'Untitled Component'}</span>
        </div>
        {hasInstructions && <span className="architecture-flow-node-ai-badge">AI</span>}
      </div>
      <div className="architecture-flow-node-sub">
        {isDraft ? 'Draft Component' : 'Code Component'}
      </div>
      {data.path && <div className="architecture-flow-node-path">{data.path}</div>}
      <Handle type="source" position={Position.Right} className="architecture-flow-handle" />
    </div>
  );
}

const architectureNodeTypes = {
  [ARCHITECTURE_NODE_TYPE]: ArchitectureFlowNode,
};

function ArchitecturePage() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const flowStageRef = useRef(null);
  const flowInstanceRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [isCommitting, setIsCommitting] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [graphMessage, setGraphMessage] = useState('');
  const [refactorPlan, setRefactorPlan] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editorName, setEditorName] = useState('');
  const [editorInstructions, setEditorInstructions] = useState('');
  const [showTutorial, setShowTutorial] = useState(false);
  const [isEditMode, setIsEditMode] = useState(true);

  const graphStats = useMemo(() => {
    const actualNodes = nodes.filter((node) => node.data?.kind === 'actual').length;
    const draftNodes = nodes.filter((node) => node.data?.kind === DRAFT_NODE_KIND).length;
    const instructedNodes = nodes.filter((node) => String(node.data?.instructions || node.data?.goal || '').trim()).length;
    return {
      actualNodes,
      draftNodes,
      instructedNodes,
      edgeCount: edges.length,
    };
  }, [nodes, edges]);

  const editingNode = useMemo(() => (
    nodes.find((node) => node.id === editingNodeId) || null
  ), [nodes, editingNodeId]);

  const openNodeEditor = useCallback((_, node) => {
    if (!isEditMode) return;
    setEditingNodeId(node.id);
    setEditorName(String(node.data?.label || '').trim());
    setEditorInstructions(String(node.data?.instructions || node.data?.goal || '').trim());
    setEditorOpen(true);
    setSyncError('');
    setSaveMessage('');
  }, [isEditMode]);

  const closeNodeEditor = () => {
    setEditorOpen(false);
  };

  const saveNodeEdits = () => {
    if (!editingNodeId) return;
    const nextName = editorName.trim() || 'Untitled Component';
    const nextInstructions = editorInstructions.trim();

    setNodes((currentNodes) => currentNodes.map((node) => (
      node.id === editingNodeId
        ? {
          ...node,
          data: {
            ...node.data,
            label: nextName,
            goal: nextInstructions,
            instructions: nextInstructions,
          },
        }
        : node
    )));

    setEditorOpen(false);
    setRefactorPlan(null);
    setSyncError('');
    setSaveMessage('Component saved.');
  };

  const loadArchitectureGraph = useCallback(async () => {
    setLoading(true);
    setSyncError('');
    setSaveMessage('');

    try {
      const res = await fetch(`${API_URL}/api/knowledge-graph`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to load architecture graph');
      }

      const flowGraph = buildFlowFromAstGraph(data.nodes || [], data.edges || []);
      setNodes(flowGraph.nodes);
      setEdges(flowGraph.edges);
      setGraphMessage(data.message || '');
      setRefactorPlan(null);
      setEditorOpen(false);
      setEditingNodeId(null);
    } catch (error) {
      console.error('Failed to load architecture graph:', error);
      setNodes([]);
      setEdges([]);
      setGraphMessage('');
      setSyncError(error.message || 'Failed to load architecture graph.');
    } finally {
      setLoading(false);
    }
  }, [setEdges, setNodes]);

  useEffect(() => {
    loadArchitectureGraph();
  }, [loadArchitectureGraph]);

  useEffect(() => {
    const hasSeen = window.localStorage.getItem('codesensei-architecture-tutorial') === 'seen';
    if (!hasSeen) {
      setShowTutorial(true);
    }
  }, []);

  useEffect(() => {
    if (!editorOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setEditorOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editorOpen]);

  useEffect(() => {
    if (!isEditMode) {
      setEditorOpen(false);
      setEditingNodeId(null);
    }
  }, [isEditMode]);

  const addDraftNodeFromTemplate = useCallback((templateId = 'blank-component', dropPosition = null) => {
    const template = getLibraryTemplate(templateId);

    setNodes((currentNodes) => [
      ...currentNodes,
      createDraftNodeFromTemplate(template, currentNodes, dropPosition),
    ]);

    setRefactorPlan(null);
    setSyncError('');
    setSaveMessage('');
  }, [setNodes]);

  const addDraftNode = () => {
    if (!isEditMode) return;
    addDraftNodeFromTemplate('blank-component');
  };

  const onTemplateDragStart = useCallback((event, templateId) => {
    if (!isEditMode) return;
    event.dataTransfer.setData('application/codesensei-template', templateId);
    event.dataTransfer.setData('text/plain', templateId);
    event.dataTransfer.effectAllowed = 'move';
  }, [isEditMode]);

  const onFlowDragOver = useCallback((event) => {
    if (!isEditMode) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, [isEditMode]);

  const onFlowDrop = useCallback((event) => {
    if (!isEditMode) return;
    event.preventDefault();
    const templateId = event.dataTransfer.getData('application/codesensei-template')
      || event.dataTransfer.getData('text/plain');
    if (!templateId) {
      return;
    }

    let dropPosition = null;
    if (flowInstanceRef.current?.screenToFlowPosition) {
      dropPosition = flowInstanceRef.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
    } else if (flowStageRef.current) {
      const bounds = flowStageRef.current.getBoundingClientRect();
      dropPosition = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
    }

    addDraftNodeFromTemplate(templateId, dropPosition);
  }, [addDraftNodeFromTemplate, isEditMode]);

  const saveBlueprintJson = () => {
    const payload = buildBlueprintPayload(nodes, edges).blueprint;
    const serialized = JSON.stringify(payload, null, 2);
    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codesensei-blueprint-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setSaveMessage('Blueprint JSON downloaded.');
    setSyncError('');
  };

  const onConnect = useCallback((connection) => {
    if (!isEditMode) return;
    if (!connection.source || !connection.target) {
      return;
    }

    setEdges((currentEdges) => addEdge({
      ...connection,
      id: sanitizeEdgeId(`visual-${Date.now()}-${connection.source}-${connection.target}`),
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
      style: { stroke: '#e6e6e6', strokeWidth: 2 },
      data: { kind: 'visual' },
    }, currentEdges));
    setRefactorPlan(null);
    setSyncError('');
    setSaveMessage('');
  }, [isEditMode, setEdges]);

  const commitDesignToCode = async () => {
    if (nodes.length === 0) {
      setSyncError('No architecture graph to commit. Index your project first.');
      return;
    }

    setIsCommitting(true);
    setSyncError('');
    setSaveMessage('');

    try {
      const payload = buildBlueprintPayload(nodes, edges);
      const res = await fetch(`${API_URL}/api/refactor-to-design`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Architecture sync failed');
      }

      setRefactorPlan(data);
    } catch (error) {
      console.error('Commit design to code failed:', error);
      setRefactorPlan(null);
      setSyncError(error.message || 'Failed to generate refactor plan from visual graph.');
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">Architecture</h1>
            <p className="page-subtitle">Draw your system visually. Click any box to add instructions for AI.</p>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-secondary" onClick={addDraftNode} disabled={loading || !isEditMode}>
              <Plus size={16} />
              Add Blank Node
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setIsEditMode((current) => !current)}
              disabled={loading}
            >
              {isEditMode ? 'Switch to View Mode' : 'Switch to Edit Mode'}
            </button>
            <button className="btn btn-secondary" onClick={saveBlueprintJson} disabled={loading || nodes.length === 0}>
              Save Blueprint JSON
            </button>
            <button className="btn btn-secondary" onClick={loadArchitectureGraph} disabled={loading}>
              <Activity size={16} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Refreshing...' : 'Refresh from AST'}
            </button>
            <button className="btn btn-primary" onClick={commitDesignToCode} disabled={loading || isCommitting || nodes.length === 0}>
              <ArrowRight size={16} className={isCommitting ? 'animate-pulse' : ''} />
              {isCommitting ? 'Syncing...' : 'Commit to Code'}
            </button>
          </div>
        </div>
      </div>

      {syncError && <div className="alert-card error architecture-sync-error">{syncError}</div>}
      {saveMessage && <div className="alert-card success architecture-sync-error">{saveMessage}</div>}

      <div className="card architecture-card">
        <div className="architecture-flow-shell">
          <aside className="architecture-library">
            <div className="architecture-library-head">
              <h3>Component Library</h3>
              <p>Drag a template onto the canvas or click Add.</p>
            </div>
            <div className="architecture-library-list">
              {COMPONENT_LIBRARY_TEMPLATES.map((template) => (
                <div
                  key={template.id}
                  className="architecture-library-item"
                  draggable={isEditMode && !loading}
                  onDragStart={(event) => onTemplateDragStart(event, template.id)}
                >
                  <div className="architecture-library-item-main">
                    <span className="architecture-library-item-icon">{template.icon}</span>
                    <div className="architecture-library-item-copy">
                      <strong>{template.name}</strong>
                      <p>{template.description}</p>
                    </div>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    type="button"
                    onClick={() => addDraftNodeFromTemplate(template.id)}
                    disabled={loading || !isEditMode}
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </aside>

          <div className="architecture-flow-canvas">
            {loading ? (
              <div className="architecture-flow-stage architecture-canvas-state">
                <div className="architecture-empty loading">
                  <div className="analysis-indicator">
                    <div className="pulse-circle" />
                    <p>Loading AST graph and preparing interactive canvas...</p>
                  </div>
                </div>
              </div>
            ) : nodes.length === 0 ? (
              <div
                className="architecture-flow-stage architecture-canvas-state"
                ref={flowStageRef}
                onDragOver={onFlowDragOver}
                onDrop={onFlowDrop}
              >
                <div className="architecture-empty">
                  <div className="empty-icon"><Layers size={48} /></div>
                  <h3>No Architecture Graph Yet</h3>
                  <p>{graphMessage || 'Index your project to populate real file nodes, or drag templates to start from scratch.'}</p>
                </div>
              </div>
            ) : (
              <div
                className="architecture-flow-stage"
                ref={flowStageRef}
                onDragOver={onFlowDragOver}
                onDrop={onFlowDrop}
              >
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeClick={isEditMode ? openNodeEditor : undefined}
                  onNodeDoubleClick={isEditMode ? openNodeEditor : undefined}
                  onInit={(instance) => {
                    flowInstanceRef.current = instance;
                  }}
                  nodeTypes={architectureNodeTypes}
                  nodesDraggable={isEditMode}
                  nodesConnectable={isEditMode}
                  elementsSelectable={isEditMode}
                  edgesFocusable={isEditMode}
                  fitView
                  fitViewOptions={{ padding: 0.22 }}
                  minZoom={0.2}
                  maxZoom={2.2}
                  defaultEdgeOptions={{
                    type: 'smoothstep',
                    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
                    style: { stroke: '#a0a0a0', strokeWidth: 1.8 },
                  }}
                >
                  <Background color="rgba(120, 120, 120, 0.2)" gap={24} size={1} />
                  <MiniMap
                    pannable
                    zoomable
                    nodeColor={(node) => (node.data?.kind === DRAFT_NODE_KIND ? '#e6e6e6' : '#a0a0a0')}
                    maskColor="rgba(0, 0, 0, 0.35)"
                  />
                  <Controls />
                  <Panel position="top-left" className="architecture-flow-panel">
                    <div>Actual: {graphStats.actualNodes}</div>
                    <div>Draft: {graphStats.draftNodes}</div>
                    <div>AI Notes: {graphStats.instructedNodes}</div>
                    <div>Edges: {graphStats.edgeCount}</div>
                  </Panel>
                  <Panel position="top-right" className="architecture-flow-panel subtle">
                    {isEditMode ? 'Edit mode: drag templates, connect nodes, and add instructions.' : 'View mode: pan and explore without changes.'}
                  </Panel>
                </ReactFlow>
              </div>
            )}
          </div>
        </div>
      </div>

      {showTutorial && (
        <div className="node-editor-overlay">
          <div className="node-editor-modal tutorial-modal" onClick={(event) => event.stopPropagation()}>
            <div className="node-editor-header">
              <div>
                <h3>Welcome to Architecture Builder</h3>
                <p>Learn by drawing. Select Got it when you are ready to start.</p>
              </div>
            </div>

            <div className="tutorial-steps">
              <div className="tutorial-step">
                <strong>1. Start with the library</strong>
                <p>Drag a template to the canvas or click Add. Draft nodes are ideas not in your code yet.</p>
              </div>
              <div className="tutorial-step">
                <strong>2. Connect ideas</strong>
                <p>Drag from a node handle to another to describe a dependency. Example: UI Screen uses Auth Service.</p>
              </div>
              <div className="tutorial-step">
                <strong>3. Add instructions</strong>
                <p>Click a node to describe what it should do in plain English. The AI uses this to refactor code.</p>
              </div>
              <div className="tutorial-step">
                <strong>4. Commit to Code</strong>
                <p>When ready, click Commit to Code to generate a refactor plan and review it before changes.</p>
              </div>
            </div>

            <div className="node-editor-footer">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  window.localStorage.setItem('codesensei-architecture-tutorial', 'seen');
                  setShowTutorial(false);
                }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {editorOpen && (
        <div className="node-editor-overlay" onClick={closeNodeEditor}>
          <div className="node-editor-modal" onClick={(event) => event.stopPropagation()}>
            <div className="node-editor-header">
              <div>
                <h3>Edit Component</h3>
                <p>{editingNode?.data?.kind === DRAFT_NODE_KIND ? 'Draft node' : 'Codebase node'}</p>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={closeNodeEditor}>
                <XCircle size={14} />
                Close
              </button>
            </div>

            <label className="node-editor-label">Component Name</label>
            <input
              className="node-editor-input"
              value={editorName}
              onChange={(event) => setEditorName(event.target.value)}
              placeholder="Login Screen"
            />

            <label className="node-editor-label">Instructions for AI</label>
            <textarea
              className="node-editor-textarea"
              value={editorInstructions}
              onChange={(event) => setEditorInstructions(event.target.value)}
              placeholder="Describe what this component should do in plain English..."
            />

            <div className="node-editor-footer">
              <button className="btn btn-secondary" onClick={closeNodeEditor}>Cancel</button>
              <button className="btn btn-primary" onClick={saveNodeEdits}>Save Component</button>
            </div>
          </div>
        </div>
      )}

      {refactorPlan && (
        <div className="card architecture-plan-card">
          <h3>Refactor Plan Preview</h3>
          <p className="architecture-plan-summary">
            {refactorPlan.summary || 'Review this plan before applying code changes.'}
          </p>

          {refactorPlan.comparison && (
            <div className="architecture-plan-metrics">
              <span>Current Edges: {refactorPlan.comparison.currentEdgeCount}</span>
              <span>Desired Edges: {refactorPlan.comparison.desiredEdgeCount}</span>
              <span>Mapped: {refactorPlan.comparison.mappedDesiredEdgeCount ?? 0}</span>
              <span>Coverage: {Math.round((refactorPlan.comparison.mappingCoverage || 0) * 100)}%</span>
            </div>
          )}

          {refactorPlan.warnings?.length > 0 && (
            <div className="alert-card error architecture-sync-error">
              {refactorPlan.warnings.join(' ')}
            </div>
          )}

          {refactorPlan.plan?.length > 0 ? (
            <ul className="architecture-plan-list">
              {refactorPlan.plan.map((item, index) => (
                <li key={item.id || `${item.type || 'change'}-${index}`} className="architecture-plan-item">
                  <div className="architecture-plan-item-head">
                    <strong>{(item.type || 'change').replace(/_/g, ' ')}</strong>
                    <span>{Math.round((item.confidence || 0) * 100)}%</span>
                  </div>
                  <p>{item.reason || item.description || 'No reason provided.'}</p>
                  <div className="architecture-plan-paths">
                    {item.filePath && <code>{item.filePath}</code>}
                    {item.fromPath && <code>{item.fromPath}</code>}
                    {item.toPath && <code>{item.toPath}</code>}
                    {item.importFrom && <code>{item.importFrom}</code>}
                    {item.importTo && <code>{item.importTo}</code>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="architecture-plan-empty">No deterministic plan items returned. Add goals/arrows and sync again.</p>
          )}

          {refactorPlan.questions?.length > 0 && (
            <div className="architecture-plan-questions">
              <strong>Needs confirmation:</strong>
              <ul>
                {refactorPlan.questions.map((question, index) => (
                  <li key={`${question}-${index}`}>{question}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function getLanguageColor(lang) {
  const colors = {
    javascript: '#e5e5e5',
    typescript: '#a0a0a0',
    python: '#d5d5d5',
    java: '#777777',
    go: '#a0a0a0',
    rust: '#d5d5d5',
    ruby: '#777777',
    default: '#a0a0a0',
  };
  return colors[lang] || colors.default;
}

export default App;
