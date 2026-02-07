import React, { useEffect, useState } from 'react';
import mermaid from 'mermaid';
import { Layout, Brain, Activity, Settings, Code, FileText } from 'lucide-react';
import './App.css';

mermaid.initialize({
  startOnLoad: true,
  theme: 'base',
  themeVariables: {
    primaryColor: '#007acc',
    primaryTextColor: '#fff',
    primaryBorderColor: '#007acc',
    lineColor: '#f8f8f2',
    secondaryColor: '#00b4d8',
    tertiaryColor: '#1e1e1e',
  }
});

function App() {
  const [diagram, setDiagram] = useState('graph TD\nA[Client] --> B[API Gateway]\nB --> C[Auth0]\nB --> D[Backend Service]');
  const [activeTab, setActiveTab] = useState('architecture');

  useEffect(() => {
    mermaid.contentLoaded();
  }, [diagram]);

  const SidebarItem = ({ icon: Icon, label, id }) => (
    <div
      className={`sidebar-item ${activeTab === id ? 'active' : ''}`}
      onClick={() => setActiveTab(id)}
    >
      <Icon size={20} />
      <span>{label}</span>
    </div>
  );

  return (
    <div className="dashboard-container">
      <div className="sidebar">
        <h1 className="gradient-text">CodeSensei</h1>
        <div style={{ marginTop: '2rem', flex: 1 }}>
          <SidebarItem icon={Layout} label="Architecture" id="architecture" />
          <SidebarItem icon={Activity} label="Impact Map" id="impact" />
          <SidebarItem icon={Brain} label="Mentor Feed" id="mentor" />
          <SidebarItem icon={FileText} label="Documentation" id="docs" />
        </div>
        <div className="sidebar-item">
          <Settings size={20} />
          <span>Settings</span>
        </div>
      </div>

      <div className="main-content">
        <header style={{ marginBottom: '2rem' }}>
          <h2>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} View</h2>
          <p style={{ opacity: 0.6 }}>Real-time project intelligence</p>
        </header>

        {activeTab === 'architecture' && (
          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3>Live System Map</h3>
              <button
                onClick={() => setDiagram('graph LR\n  A[Frontend] -- API --> B[Node.js]\n  B -- Vertex AI --> C[Gemini]\n  B -- Store --> D[Firebase]')}
                style={{ background: 'var(--primary)', border: 'none', color: 'white', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}
              >
                Refresh Map
              </button>
            </div>
            <div id="mermaid-container" key={diagram}>
              <pre className="mermaid">
                {diagram}
              </pre>
            </div>
          </div>
        )}

        {activeTab === 'mentor' && (
          <div className="glass-card">
            <h3>Mentor Insights</h3>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)' }}>
                <p style={{ fontWeight: 'bold' }}>🥋 Design Pattern: Factory Pattern</p>
                <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                  I see you're creating multiple backend services. Consider using a common Factory to simplify the instantiation process...
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
