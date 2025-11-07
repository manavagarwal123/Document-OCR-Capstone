import React, { useState, useEffect, useRef } from 'react';
import Upload from './Upload';
import Search from './Search';
import Login from './Login';

export default function App(){
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => {
    // Check if user is already logged in
    try {
      const token = localStorage.getItem('token');
      const userStr = localStorage.getItem('user');
      
      if (token && userStr) {
        try {
          const userData = JSON.parse(userStr);
          setIsAuthenticated(true);
          setUser(userData);
        } catch (e) {
          // Invalid user data, clear it
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      }
    } catch (e) {
      // localStorage might not be available, show login page
      console.warn('localStorage not available:', e);
    }
  }, []);

  function handleLogin(token, userData) {
    setIsAuthenticated(true);
    setUser(userData);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setUser(null);
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <>
      <div className="bg-blur-1"></div>
      <div className="bg-blur-2"></div>
      <div className="bg-blur-3"></div>
      <div className="app">
        <header className="header">
        <div className="brand">
          <div className="logo">OCR</div>
          <div>
            <h1>Document OCR Search</h1>
            <div className="sub">Upload documents, extract text, and search across pages.</div>
          </div>
        </div>
        <div style={{ textAlign:'right' }}>
          {user && (
            <div style={{ marginBottom: 8 }}>
              <div className="muted" style={{ fontSize: 13 }}>Welcome, {user.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>{user.email}</div>
            </div>
          )}
          <button className="btn" onClick={handleLogout} style={{ marginTop: 8 }}>
            Logout
          </button>
        </div>
      </header>

      <main className="layout">
        <aside>
          <Upload onUploadComplete={() => {
            // Refresh stats in Search component when upload completes
            if (searchRef.current && searchRef.current.refreshStats) {
              searchRef.current.refreshStats();
            }
          }} />
        </aside>

        <section>
          <Search ref={searchRef} />
          <div style={{ height:12 }} />
          <div className="panel" style={{ marginTop:12 }}>
            <h4 style={{ marginTop:0 }}>Tips</h4>
            <ul className="muted" style={{ marginTop:8 }}>
              <li>Use high-quality scans for better OCR results.</li>
              <li>Try language selection for non-English documents.</li>
              <li>Run your backend at http://localhost:5001 for full integration.</li>
            </ul>
          </div>
        </section>
      </main>
      </div>
    </>
  );
}