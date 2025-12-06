import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import WorkflowBuilder from './WorkflowBuilder'
import BacktestPage from './pages/BacktestPage'
import Dashboard from './pages/Dashboard'
import Analytics from './pages/Analytics'
import Account from './pages/Account'
import BackButton from './components/BackButton'
import './workflow_builder.css'

const App = () => {
  // Initialize route from URL query `?route=...` so opened links can deep-link into pages
  const query = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams('');
  const initialRoute = query.get('route') || 'home';
  const [route, setRoute] = useState(initialRoute);
  const navigate = (r) => setRoute(r);
  return (
    <React.StrictMode>
      <div style={{ display: route === 'builder' ? 'block' : 'none' }}>
        <WorkflowBuilder onNavigate={navigate} />
      </div>
      {route === 'home' && <Dashboard onNavigate={navigate} />}
      {route === 'backtest' && <BacktestPage onNavigate={navigate} />}
      {route === 'analytics' && <Analytics onNavigate={navigate} />}
      {route === 'account' && <Account onNavigate={navigate} />}
      {route === 'billing' && <div style={{ padding: 24 }}>Billing / Subscription (placeholder)</div>}
      {route === 'help' && <div style={{ padding: 24 }}>Help / Documentation (placeholder)</div>}
    </React.StrictMode>
  );
};

const root = createRoot(document.getElementById('root'))
root.render(<App />)
