import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate('/dashboard', { replace: true });
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    const userId = authData.user?.id;
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profileError || !profile || (profile.role !== 'admin' && profile.role !== 'staff')) {
      await supabase.auth.signOut();
      setError("You don't have access to this portal");
      setLoading(false);
      return;
    }

    navigate('/dashboard', { replace: true });
  };

  const inputStyle = (field: 'email' | 'password'): React.CSSProperties => ({
    width: '100%',
    height: 48,
    padding: '0 14px',
    fontSize: 15,
    color: 'var(--text-primary)',
    background: 'var(--surface)',
    border: `1.5px solid ${focusedField === field ? 'var(--brand)' : 'var(--border)'}`,
    borderRadius: 'var(--radius-sm)',
    outline: 'none',
    transition: 'border-color var(--transition), box-shadow var(--transition)',
    boxShadow: focusedField === field ? '0 0 0 3px rgba(75, 166, 234, 0.12)' : 'none',
    fontFamily: 'inherit',
  });

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: 'var(--surface-secondary)',
    }}>
      {/* Left panel */}
      <div style={{
        flex: 1,
        display: 'none',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px 56px',
        background: 'linear-gradient(145deg, #0f1117 0%, #1a2236 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
      className="login-panel"
      >
        {/* Background accent */}
        <div style={{
          position: 'absolute',
          top: -120,
          right: -120,
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(75,166,234,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute',
          bottom: -80,
          left: -80,
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(75,166,234,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40,
            height: 40,
            background: 'var(--brand)',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M5 17H3a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="9" y="11" width="14" height="10" rx="2" stroke="white" strokeWidth="2"/>
              <circle cx="12" cy="16" r="1" fill="white"/>
            </svg>
          </div>
          <span style={{ color: 'white', fontWeight: 700, fontSize: 18, letterSpacing: '-0.3px' }}>
            HomestaCars
          </span>
        </div>

        {/* Middle content */}
        <div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(75,166,234,0.12)',
            border: '1px solid rgba(75,166,234,0.2)',
            borderRadius: 20,
            padding: '6px 14px',
            marginBottom: 28,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand)' }} />
            <span style={{ color: 'var(--brand)', fontSize: 13, fontWeight: 500 }}>Istanbul, Turkey</span>
          </div>
          <h2 style={{
            color: 'white',
            fontSize: 36,
            fontWeight: 700,
            lineHeight: 1.2,
            letterSpacing: '-0.8px',
            marginBottom: 16,
          }}>
            Manage your fleet<br />with precision.
          </h2>
          <p style={{
            color: 'rgba(255,255,255,0.5)',
            fontSize: 16,
            lineHeight: 1.6,
            maxWidth: 340,
          }}>
            Full operational control across Şişli and Kayaşehir branches — reservations, vehicles, and investor reports in one place.
          </p>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 32 }}>
          {[
            { label: 'Branches', value: '2' },
            { label: 'Founded', value: '2025' },
            { label: 'Fleet', value: 'Premium' },
          ].map(stat => (
            <div key={stat.label}>
              <div style={{ color: 'white', fontWeight: 700, fontSize: 20, letterSpacing: '-0.3px' }}>
                {stat.value}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 2 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div style={{
        width: '100%',
        maxWidth: 480,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '48px 40px',
        background: 'var(--surface)',
        boxShadow: '-1px 0 0 var(--border)',
      }}>
        {/* Mobile logo */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 48,
        }}
        className="login-mobile-logo"
        >
          <div style={{
            width: 36,
            height: 36,
            background: 'var(--brand)',
            borderRadius: 9,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M5 17H3a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="9" y="11" width="14" height="10" rx="2" stroke="white" strokeWidth="2"/>
              <circle cx="12" cy="16" r="1" fill="white"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.3px' }}>HomestaCars</span>
        </div>

        <div style={{ marginBottom: 36 }}>
          <h1 style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: '-0.5px',
            marginBottom: 8,
            color: 'var(--text-primary)',
          }}>
            HomestaCars
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
            Team Portal — Staff & Admin Access
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--text-primary)',
                marginBottom: 6,
              }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                placeholder="you@homestacars.com"
                style={inputStyle('email')}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--text-primary)',
                marginBottom: 6,
              }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                placeholder="••••••••"
                style={inputStyle('password')}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div style={{
                background: 'var(--error-bg)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
              }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginTop: 1, flexShrink: 0 }}>
                  <circle cx="8" cy="8" r="7" stroke="#ef4444" strokeWidth="1.5"/>
                  <path d="M8 5v3.5M8 11h.01" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span style={{ fontSize: 14, color: 'var(--error)', lineHeight: 1.4 }}>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              style={{
                height: 48,
                background: loading || !email || !password ? '#a8d4f5' : 'var(--brand)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontSize: 15,
                fontWeight: 600,
                cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
                transition: 'background var(--transition), transform var(--transition)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontFamily: 'inherit',
                marginTop: 4,
              }}
              onMouseEnter={e => {
                if (!loading && email && password) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--brand-dark)';
                }
              }}
              onMouseLeave={e => {
                if (!loading && email && password) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--brand)';
                }
              }}
            >
              {loading ? (
                <>
                  <div style={{
                    width: 16,
                    height: 16,
                    border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: 'white',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                  }} />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </div>
        </form>

        <p style={{
          color: 'var(--text-muted)',
          fontSize: 13,
          textAlign: 'center',
          marginTop: 36,
        }}>
          HomestaCars Team Portal · Istanbul
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (min-width: 900px) {
          .login-panel { display: flex !important; }
          .login-mobile-logo { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default LoginPage;
