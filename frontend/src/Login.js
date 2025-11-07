import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function Login({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverConnected, setServerConnected] = useState(null);

  const SERVER = 'http://localhost:5001';

  // Test server connection on mount
  useEffect(() => {
    async function testConnection() {
      try {
        const res = await axios.get(`${SERVER}/api/health`, { 
          timeout: 5000,
          headers: {
            'Accept': 'application/json'
          }
        });
        if (res.data && res.data.ok) {
          setServerConnected(true);
          console.log('✅ Backend server connected');
        } else {
          setServerConnected(false);
        }
      } catch (err) {
        setServerConnected(false);
        console.error('❌ Backend server not reachable:', err.message);
        console.error('Full error:', err);
      }
    }
    testConnection();
  }, []);

  function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validation
    if (!email || !password) {
      setError('Email and password are required');
      setLoading(false);
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }

    if (isRegister && !name) {
      setError('Name is required for registration');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const payload = isRegister ? { email, password, name } : { email, password };

      const res = await axios.post(`${SERVER}${endpoint}`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 10000, // Increased timeout to 10 seconds
        withCredentials: false
      });

      if (res.data && res.data.ok && res.data.token) {
        // Store token in localStorage
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        
        // Call parent callback
        if (onLogin) {
          onLogin(res.data.token, res.data.user);
        }
        // Don't set loading to false here as we're navigating away
      } else {
        const errorMsg = (res.data && res.data.error) ? res.data.error : 'Authentication failed';
        setError(errorMsg);
        setLoading(false);
      }
    } catch (err) {
      console.error('Login error:', err);
      let errorMessage = 'Network error';
      
      if (err.code === 'ECONNREFUSED' || err.code === 'ERR_NETWORK') {
        errorMessage = 'Cannot connect to server. Please make sure the backend is running on http://localhost:5001';
      } else if (err.code === 'ECONNABORTED') {
        errorMessage = 'Request timeout. Please try again.';
      } else if (err.response) {
        // Server responded with error status
        if (err.response.data && err.response.data.error) {
          errorMessage = err.response.data.error;
        } else if (err.response.status === 401) {
          errorMessage = 'Invalid email or password';
        } else if (err.response.status === 400) {
          errorMessage = err.response.data?.error || 'Invalid request. Please check your input.';
        } else if (err.response.status === 500) {
          errorMessage = 'Server error. Please try again later.';
        } else {
          errorMessage = `Error: ${err.response.status} ${err.response.statusText}`;
        }
      } else if (err.request) {
        // Request was made but no response received
        errorMessage = 'No response from server. Please check if the backend is running.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setLoading(false);
    }
  }

  function toggleMode() {
    setIsRegister(!isRegister);
    setError('');
    setPassword('');
    setName('');
  }

  return (
    <>
      <div className="bg-blur-1"></div>
      <div className="bg-blur-2"></div>
      <div className="bg-blur-3"></div>
      <div className="login-container" style={{ position: 'relative', zIndex: 10 }}>
        <div className="panel login-panel" style={{ 
          position: 'relative', 
          zIndex: 11,
          background: 'rgba(16, 18, 37, 0.95)',
          backdropFilter: 'blur(10px)',
          padding: '32px',
          borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
        }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div className="logo" style={{ margin: '0 auto 16px' }}>OCR</div>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Document OCR Search</h1>
          <div className="muted">{isRegister ? 'Create your account' : 'Sign in to continue'}</div>
        </div>

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
                Name
              </label>
              <input
                type="text"
                className="search-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                disabled={loading}
              />
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
              Email
            </label>
            <input
              type="email"
              className="search-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              disabled={loading}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
              Password
            </label>
            <input
              type="password"
              className="search-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={loading}
            />
          </div>

          {serverConnected === false && (
            <div style={{ 
              marginBottom: 16, 
              padding: 12, 
              background: 'rgba(245, 158, 11, 0.15)', 
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: 8,
              color: '#f59e0b',
              fontSize: 13,
              lineHeight: '1.5'
            }}>
              ⚠️ Cannot connect to backend server.
              <br />
              <span style={{ fontSize: 12, opacity: 0.9 }}>
                Make sure the backend is running on http://localhost:5001
              </span>
            </div>
          )}
          
          {serverConnected === true && (
            <div style={{ 
              marginBottom: 16, 
              padding: 8, 
              background: 'rgba(16, 185, 129, 0.1)', 
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 8,
              color: '#10b981',
              fontSize: 12,
              textAlign: 'center'
            }}>
              ✅ Connected to backend server
            </div>
          )}

          {error && (
            <div style={{ 
              marginBottom: 16, 
              padding: 12, 
              background: 'rgba(239, 68, 68, 0.1)', 
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 8,
              color: '#ef4444',
              fontSize: 14
            }}>
              {error}
            </div>
          )}

          <button 
            type="submit" 
            className="btn primary" 
            style={{ width: '100%', marginBottom: 16 }}
            disabled={loading}
          >
            {loading ? 'Please wait...' : (isRegister ? 'Register' : 'Login')}
          </button>

          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              onClick={toggleMode}
              className="btn"
              style={{ 
                background: 'transparent', 
                border: 'none', 
                color: '#7c3aed', 
                textDecoration: 'underline', 
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1
              }}
              disabled={loading}
            >
              {isRegister ? 'Already have an account? Login' : "Don't have an account? Register"}
            </button>
          </div>
        </form>
        </div>
      </div>
    </>
  );
}

