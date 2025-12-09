import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import WorkflowBuilder from './WorkflowBuilder'
import BacktestPage from './pages/BacktestPage'
import Dashboard from './pages/Dashboard'
import Analytics from './pages/Analytics'
import Account from './pages/Account'
import BackButton from './components/BackButton'
import './workflow_builder.css'

// Firebase auth
import { auth } from './firebase'
import { onAuthStateChanged } from 'firebase/auth'
import SignIn from './components/Auth/SignIn'

const App = () => {
  // Initialize route from URL query `?route=...` so opened links can deep-link into pages
  const query = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams('');
  const initialRoute = query.get('route') || 'home';
  const [route, setRoute] = useState(initialRoute);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const navigate = (r) => setRoute(r);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  if (authLoading) {
    return <div style={{padding:40,textAlign:'center'}}>Loading authentication...</div>
  }

  // If not signed in, show the SignIn component and block the app
  if (!user) {
    return <SignIn user={null} />
  }

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
