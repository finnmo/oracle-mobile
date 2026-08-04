import { useState, useEffect, useCallback } from 'react';
import { AdminPub } from '../types';
import {
  getAdminToken, setAdminToken, clearAdminToken,
  adminAnnounce, adminReset, adminOpenRatings, adminCloseRatings,
  adminListPubs, adminAddPub, adminUpdatePub, adminDeletePub,
} from '../api';

interface Props {
  onBack: () => void;
}

export default function AdminPage({ onBack }: Props) {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [showTokenFallback, setShowTokenFallback] = useState(false);
  const [token, setToken] = useState(getAdminToken() ?? '');

  const probeAuth = useCallback(async () => {
    setChecking(true);
    try {
      await adminListPubs();
      setAuthed(true);
    } catch {
      setAuthed(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    probeAuth();
  }, [probeAuth]);

  const handleTokenLogin = () => {
    const t = token.trim().replace(/[^\x20-\x7E]/g, '');
    if (!t) return;
    setAdminToken(t);
    probeAuth();
  };

  const handleLogout = () => {
    clearAdminToken();
    setAuthed(false);
    setToken('');
  };

  return (
    <div className="app app--admin">
      <header className="header header--admin">
        <div className="header-inner">
          <button type="button" className="admin-back-btn" onClick={onBack}>← Back</button>
          <h1>The Oracle</h1>
          <span className="header-admin-label">Admin</span>
          {authed && (
            <button type="button" className="admin-logout-btn btn btn-secondary" onClick={handleLogout}>
              Logout
            </button>
          )}
        </div>
        <div className="header-rule" aria-hidden="true" />
      </header>

      <main className="app-main app-main--admin">
        {checking && (
          <div className="card loading-card">
            <div className="spinner" />
          </div>
        )}

        {!checking && !authed && (
          <div className="card">
            <div className="card-label">Admin access</div>
            <p className="inline-error" style={{ marginBottom: 12 }}>
              Error — contact the site admin.
            </p>
            <button className="btn btn-primary btn-full" onClick={() => { window.location.href = '/admin'; }}>
              Retry
            </button>

            <details
              className="admin-token-fallback"
              open={showTokenFallback}
              onToggle={(e) => setShowTokenFallback((e.target as HTMLDetailsElement).open)}
              style={{ marginTop: 16 }}
            >
              <summary>Use API token instead</summary>
              <input
                type="password"
                className="admin-input"
                placeholder="Admin token"
                value={token}
                onChange={e => setToken(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleTokenLogin()}
                style={{ marginTop: 10 }}
              />
              <button className="btn btn-secondary btn-full" style={{ marginTop: 10 }} onClick={handleTokenLogin}>
                Login with token
              </button>
            </details>
          </div>
        )}

        {!checking && authed && (
          <>
            <RoundPanel onUnauthorized={() => { clearAdminToken(); setAuthed(false); }} />
            <PubPanel onUnauthorized={() => { clearAdminToken(); setAuthed(false); }} />
          </>
        )}
      </main>
    </div>
  );
}

// ── Round management ──────────────────────────────────────────────────────────

function RoundPanel({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [result, setResult]   = useState<string | null>(null);
  const [err, setErr]         = useState<string | null>(null);
  const [busy, setBusy]       = useState(false);
  const [selectedPubId, setSelectedPubId] = useState('');
  const [pubs, setPubs]       = useState<AdminPub[]>([]);

  useEffect(() => {
    adminListPubs()
      .then((list) => setPubs(list.filter((p) => p.active)))
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'Failed to load pubs';
        setErr(msg);
        if (msg.includes('Unauthorized')) onUnauthorized();
      });
  }, [onUnauthorized]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setResult(null);
    setErr(null);
    try {
      const res = await action();
      setResult(JSON.stringify(res, null, 2));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error';
      setErr(msg);
      if (msg.includes('Unauthorized')) onUnauthorized();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-label">Round control</div>

      <div className="admin-actions">
        <button className="btn btn-primary" onClick={() => run(() => adminAnnounce({ force: true }))} disabled={busy}>
          Announce random
        </button>
        <button className="btn btn-secondary" onClick={() => run(() => adminOpenRatings())} disabled={busy}>
          Open ratings
        </button>
        <button className="btn btn-secondary" onClick={() => run(() => adminCloseRatings())} disabled={busy}>
          Close ratings
        </button>
        <button className="btn btn-secondary" onClick={() => run(() => adminReset())} disabled={busy}>
          Reset
        </button>
      </div>

      <div className="admin-custom-announce">
        <select
          className="admin-input"
          value={selectedPubId}
          onChange={(e) => setSelectedPubId(e.target.value)}
          aria-label="Select pub to announce"
        >
          <option value="">Select a pub…</option>
          {pubs.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button
          className="btn btn-primary"
          onClick={() => run(() => adminAnnounce({ pubId: selectedPubId }))}
          disabled={busy || !selectedPubId}
        >
          Announce this pub
        </button>
      </div>

      {busy   && <p className="text-muted" style={{ marginTop: 10 }}>Working…</p>}
      {err    && <p className="inline-error" style={{ marginTop: 10 }}>{err}</p>}
      {result && (
        <pre className="admin-result">{result}</pre>
      )}
    </div>
  );
}

// ── Pub management ────────────────────────────────────────────────────────────

function PubPanel({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [pubs, setPubs]       = useState<AdminPub[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState<string | null>(null);
  const [name, setName]       = useState('');
  const [address, setAddress] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const [adding, setAdding]   = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await adminListPubs();
      setPubs(list);
      setErr(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load pubs';
      setErr(msg);
      if (msg.includes('Unauthorized')) onUnauthorized();
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!name.trim()) return;
    setAdding(true);
    try {
      await adminAddPub(name.trim(), address.trim() || undefined, mapsUrl.trim() || undefined);
      setName(''); setAddress(''); setMapsUrl('');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Add failed');
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (pub: AdminPub) => {
    try {
      await adminUpdatePub(pub.id, { active: pub.active ? 0 : 1 } as Partial<AdminPub>);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const handleDelete = async (pub: AdminPub) => {
    if (!confirm(`Delete "${pub.name}"? If it has round history it will be deactivated instead.`)) return;
    try {
      await adminDeletePub(pub.id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className="card">
      <div className="card-label">Pub management</div>

      {loading && <div className="spinner" style={{ margin: '16px auto' }} />}
      {err && <p className="inline-error">{err}</p>}

      <div className="admin-pub-list">
        {pubs.map(pub => (
          <div key={pub.id} className={`admin-pub-row ${!pub.active ? 'admin-pub-row--inactive' : ''}`}>
            <div className="admin-pub-info">
              <span className="admin-pub-name">{pub.name}</span>
              <span className="admin-pub-addr">{pub.address ?? '—'}</span>
            </div>
            <div className="admin-pub-actions">
              <button
                className={`btn admin-pub-toggle ${pub.active ? 'btn-secondary' : 'btn-primary'}`}
                onClick={() => handleToggle(pub)}
              >
                {pub.active ? 'Deactivate' : 'Activate'}
              </button>
              <button className="btn admin-pub-delete btn-secondary" onClick={() => handleDelete(pub)}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="admin-add-pub">
        <div className="card-label" style={{ marginBottom: 8 }}>Add pub</div>
        <input className="admin-input" placeholder="Name *" value={name} onChange={e => setName(e.target.value)} />
        <input className="admin-input" placeholder="Address" value={address} onChange={e => setAddress(e.target.value)} />
        <input className="admin-input" placeholder="Google Maps URL" value={mapsUrl} onChange={e => setMapsUrl(e.target.value)} />
        <button
          className="btn btn-primary btn-full"
          onClick={handleAdd}
          disabled={adding || !name.trim()}
        >
          {adding ? 'Adding…' : 'Add pub'}
        </button>
      </div>
    </div>
  );
}
