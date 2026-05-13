import { trpc } from './lib/trpc';
import { useState, useEffect } from 'react';
import { useSSE } from './lib/sse';
import { useAuth } from './lib/auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/trpc';

export function App() {
  const { token, user, loading, login, register, setupFirstUser, logout } = useAuth();
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'setup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    fetch(`${API_URL}/auth.check`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(j => { if (j.result?.data?.needsSetup) setAuthMode('setup'); })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'system-ui' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!token) {
    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthError(null);
      setAuthBusy(true);
      try {
        if (authMode === 'login') await login(email, password);
        else if (authMode === 'register') await register(email, password);
        else await setupFirstUser(email, password);
      } catch (err: any) {
        setAuthError(err.message);
      } finally {
        setAuthBusy(false);
      }
    };

    const switchMode = () => {
      if (authMode === 'login') setAuthMode('register');
      else if (authMode === 'register') setAuthMode('setup');
      else setAuthMode('login');
    };

    const modeLabel = authMode === 'login' ? 'Sign In' : authMode === 'register' ? 'Create Account' : 'First-Time Setup';

    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'system-ui', background: '#f5f5f5' }}>
        <form onSubmit={handleSubmit} style={{ background: 'white', padding: '40px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', width: '360px' }}>
          <h1 style={{ marginTop: 0, textAlign: 'center' }}>Hermes Research Hub</h1>
          <h2 style={{ textAlign: 'center', color: '#666', fontWeight: 'normal', fontSize: '16px', marginBottom: '24px' }}>{modeLabel}</h2>

          {authError && (
            <p style={{ color: '#dc3545', background: '#f8d7da', padding: '10px', borderRadius: '4px', fontSize: '14px', marginBottom: '16px' }}>{authError}</p>
          )}

          <input
            type="email" placeholder="Email" value={email} required
            onChange={e => setEmail(e.target.value)}
            style={{ width: '100%', padding: '10px', marginBottom: '12px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
          <input
            type="password" placeholder="Password" value={password} required minLength={6}
            onChange={e => setPassword(e.target.value)}
            style={{ width: '100%', padding: '10px', marginBottom: '20px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />

          <button type="submit" disabled={authBusy}
            style={{ width: '100%', padding: '12px', background: '#007acc', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px' }}>
            {authBusy ? 'Please wait...' : modeLabel}
          </button>

          <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '13px', color: '#888' }}>
            <button type="button" onClick={switchMode} style={{ background: 'none', border: 'none', color: '#007acc', cursor: 'pointer', textDecoration: 'underline', fontSize: '13px' }}>
              {authMode === 'login' ? 'Create an account' : authMode === 'register' ? 'First-time setup?' : 'Have an account? Sign in'}
            </button>
          </p>
        </form>
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState<'profiles' | 'research' | 'logs'>('profiles');
  const [selectedProfile, setSelectedProfile] = useState<number | null>(null);

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Hermes Site Research Hub</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', color: '#666' }}>{user?.email}</span>
          <button onClick={logout} style={{ padding: '6px 12px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
            Sign Out
          </button>
        </div>
      </div>

      <nav style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #ccc', paddingBottom: '10px' }}>
        <button onClick={() => setActiveTab('profiles')} style={{ padding: '8px 16px', background: activeTab === 'profiles' ? '#007acc' : '#f0f0f0', color: activeTab === 'profiles' ? 'white' : 'black', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Profiles
        </button>
        <button onClick={() => setActiveTab('research')} style={{ padding: '8px 16px', background: activeTab === 'research' ? '#007acc' : '#f0f0f0', color: activeTab === 'research' ? 'white' : 'black', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Research
        </button>
        <button onClick={() => setActiveTab('logs')} style={{ padding: '8px 16px', background: activeTab === 'logs' ? '#007acc' : '#f0f0f0', color: activeTab === 'logs' ? 'white' : 'black', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Logs
        </button>
      </nav>

      {activeTab === 'profiles' && <ProfilesTab onSelect={setSelectedProfile} selectedId={selectedProfile} />}
      {activeTab === 'research' && <ResearchTab profileId={selectedProfile} />}
      {activeTab === 'logs' && <LogsTab />}
    </div>
  );
}

function ProfilesTab({ onSelect, selectedId }: { onSelect: (id: number | null) => void; selectedId: number | null }) {
  const { data: profiles, refetch } = trpc.profiles.list.useQuery();
  const createProfile = trpc.profiles.create.useMutation({ onSuccess: () => refetch() });
  const deleteProfile = trpc.profiles.delete.useMutation({ onSuccess: () => refetch() });

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [credentials, setCredentials] = useState('');

  const handleCreate = () => {
    if (!name || !url) return;
    createProfile.mutate({ name, url, credentials });
    setName('');
    setUrl('');
    setCredentials('');
  };

  return (
    <div>
      <h2>Manage Profiles</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <div>
          <h3>Create Profile</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
            <input placeholder="URL (e.g., https://example.com)" value={url} onChange={e => setUrl(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
            <textarea placeholder="Credentials (optional, JSON)" value={credentials} onChange={e => setCredentials(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', minHeight: '60px' }} />
            <button onClick={handleCreate} disabled={createProfile.isPending} style={{ padding: '10px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              {createProfile.isPending ? 'Creating...' : 'Create Profile'}
            </button>
          </div>
        </div>

        <div>
          <h3>Profiles List</h3>
          {profiles?.length === 0 && <p>No profiles yet</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
            {profiles?.map(profile => {
              const profileId = Number(profile.id);
              return (
                <div key={String(profile.id)} style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: selectedId === profileId ? '#e3f2fd' : 'white' }}>
                  <div>
                    <strong>{String(profile.name)}</strong>
                    <br />
                    <small>{String(profile.url)}</small>
                  </div>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button onClick={() => onSelect(profileId === selectedId ? null : profileId)} style={{ padding: '5px 10px', background: selectedId === profileId ? '#007acc' : '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                      {selectedId === profileId ? 'Selected' : 'Select'}
                    </button>
                    <button onClick={() => deleteProfile.mutate({ id: profileId })} style={{ padding: '5px 10px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResearchTab({ profileId }: { profileId: number | null }) {
  const [url, setUrl] = useState('');
  const [prompt, setPrompt] = useState('');
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { messages, connected } = useSSE(activeSessionId);

  const sessionsQuery = trpc.sessions.list.useQuery({ profileId: profileId || undefined }, {
    refetchInterval: autoRefresh ? 3000 : false
  });

  const createSession = trpc.sessions.create.useMutation({
    onSuccess: (data) => {
      setUrl('');
      setPrompt('');
      if (data?.sessionId) {
        setActiveSessionId(data.sessionId);
      }
      sessionsQuery.refetch();
    }
  });
  const startSessionMutation = trpc.sessions.start.useMutation({
    onSuccess: (data) => {
      sessionsQuery.refetch();
      if (data?.sessionId) {
        setActiveSessionId(data.sessionId);
      }
    }
  });

  const handleStartResearch = async () => {
    if (!prompt || !profileId) return;

    createSession.mutate({
      profileId: profileId,
      prompt,
      url: url || undefined
    }, {
      onSuccess: (data) => {
        if (data?.sessionId) {
          startSessionMutation.mutate({ id: data.sessionId });
        }
      }
    });
  };

  return (
    <div>
      <h2>Site Research</h2>
      {!profileId ? (
        <p style={{ color: '#dc3545' }}>Please select a profile first</p>
      ) : (
        <>
          <div style={{ marginBottom: '20px' }}>
            <h3>New Research Task</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input placeholder="URL (optional)" value={url} onChange={e => setUrl(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
              <textarea placeholder="What do you want to research?" value={prompt} onChange={e => setPrompt(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', minHeight: '80px' }} />
              <button onClick={handleStartResearch} disabled={createSession.isPending || startSessionMutation.isPending || !prompt} style={{ padding: '10px', background: '#007acc', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                {startSessionMutation.isPending ? 'Research Starting...' : 'Start Research'}
              </button>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Session History</h3>
              <button onClick={() => setAutoRefresh(!autoRefresh)} style={{
                padding: '5px 10px',
                background: autoRefresh ? '#28a745' : '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}>
                {autoRefresh ? 'Auto-refresh: ON' : 'Auto-refresh: OFF'}
              </button>
            </div>
            {sessionsQuery.data?.length === 0 && <p>No sessions yet</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {sessionsQuery.data?.map(session => (
                <div key={session.sessionId} style={{ padding: '15px', border: '1px solid #ccc', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div>
                      <strong>Session #{session.sessionId}</strong>
                      {session.provider && (
                        <span style={{ marginLeft: '10px', fontSize: '12px', color: '#666' }}>
                          {session.provider}/{session.model}
                        </span>
                      )}
                    </div>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      background: session.status === 'completed' ? '#28a745' : session.status === 'running' ? '#007acc' : session.status === 'error' ? '#dc3545' : '#6c757d',
                      color: 'white'
                    }}>
                      {session.status}
                    </span>
                  </div>
                  <p style={{ margin: '5px 0', color: '#666' }}>{session.prompt}</p>
                  {session.result && (
                    <details style={{ marginTop: '10px' }}>
                      <summary style={{ cursor: 'pointer', color: '#007acc' }}>View Result</summary>
                      <pre style={{ background: '#f5f5f5', padding: '10px', borderRadius: '4px', maxHeight: '200px', overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                        {session.result}
                      </pre>
                    </details>
                  )}
                  {session.error && (
                    <p style={{ color: '#dc3545', marginTop: '10px' }}>Error: {session.error}</p>
                  )}
                  {session.logs && session.logs.length > 0 && (
                    <details style={{ marginTop: '10px' }}>
                      <summary style={{ cursor: 'pointer', color: '#666' }}>View Logs ({session.logs.length})</summary>
                      <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '10px', borderRadius: '4px', maxHeight: '150px', overflow: 'auto', fontSize: '12px' }}>
                        {session.logs.join('\n')}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>

          {activeSessionId && (
            <div style={{ marginTop: '20px', padding: '15px', border: '2px solid #007acc', borderRadius: '4px', background: '#f0f8ff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ margin: 0 }}>Live Logs (Session #{activeSessionId})</h3>
                <span style={{ fontSize: '12px', color: connected ? '#28a745' : '#dc3545' }}>
                  {connected ? '● Connected' : '○ Disconnected'}
                </span>
              </div>
              <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '10px', borderRadius: '4px', maxHeight: '200px', overflow: 'auto', fontSize: '12px' }}>
                {messages.map((msg, i) => {
                  const prefix = msg.type === 'error' ? '[ERROR] ' : msg.type === 'complete' ? '[DONE] ' : '';
                  return <div key={i} style={{ color: msg.type === 'error' ? '#f48771' : msg.type === 'complete' ? '#89d185' : '#d4d4d4' }}>
                    {prefix}{msg.message || msg.result?.substring(0, 200)}
                  </div>;
                })}
                {messages.length === 0 && <span style={{ color: '#666' }}>Waiting for logs...</span>}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LogsTab() {
  const sessionsQuery = trpc.sessions.list.useQuery();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#28a745';
      case 'running': return '#007acc';
      case 'error': return '#dc3545';
      default: return '#6c757d';
    }
  };

  return (
    <div>
      <h2>System Logs</h2>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <p>Recent activities and session statuses</p>
        <button onClick={() => sessionsQuery.refetch()} style={{ padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Refresh
        </button>
      </div>

      <div style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '15px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '13px', maxHeight: '500px', overflow: 'auto' }}>
        {sessionsQuery.data?.length === 0 && <p style={{ color: '#888' }}>No logs yet</p>}
        {sessionsQuery.data?.map((session) => (
          <div key={session.sessionId} style={{ marginBottom: '15px', borderLeft: `3px solid ${getStatusColor(session.status)}`, paddingLeft: '10px' }}>
            <div>[{new Date(session.createdAt).toLocaleString()}] Session #{session.sessionId} - <span style={{ color: getStatusColor(session.status) }}>{session.status.toUpperCase()}</span>
            {session.provider && <span style={{ color: '#888' }}> ({session.provider}/{session.model})</span>}
            </div>
            <div style={{ color: '#888', marginTop: '5px' }}>Prompt: {session.prompt}</div>
            {session.error && <div style={{ color: '#f48771', marginTop: '5px' }}>Error: {session.error}</div>}
            {session.result && <div style={{ color: '#89d185', marginTop: '5px' }}>Result: {session.result.substring(0, 100)}...</div>}
            {session.logs && session.logs.length > 0 && (
              <details style={{ marginTop: '5px' }}>
                <summary style={{ cursor: 'pointer', color: '#007acc' }}>View {session.logs.length} logs</summary>
                <div style={{ color: '#666', marginTop: '5px' }}>
                  {session.logs.map((log, i) => (
                    <div key={i}>{log}</div>
                  ))}
                </div>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
