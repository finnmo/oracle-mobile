import { useState, useEffect, useCallback } from 'react';
import { AdminPub } from '../types';
import {
  getAdminToken, setAdminToken, clearAdminToken,
  adminAnnounce, adminReset, adminOpenRatings, adminCloseRatings,
  adminListPubs, adminAddPub, adminUpdatePub, adminDeletePub,
  adminGetBranding, adminUpdateBranding, clearAccessJwt,
} from '../api';
import { useBranding } from '../context/BrandingContext';
import { BrandIcon } from './BrandIcon';
import { DEFAULT_BRANDING, applyBranding, readIconFile } from '../branding';
import { BrandingSettings } from '../types';

interface Props {
  onBack: () => void;
}

export default function AdminPage({ onBack }: Props) {
  const { branding, setBranding } = useBranding();
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [authErr, setAuthErr] = useState<string | null>(null);
  const [showTokenFallback, setShowTokenFallback] = useState(false);
  const [token, setToken] = useState(getAdminToken() ?? '');

  const probeAuth = useCallback(async () => {
    setChecking(true);
    setAuthErr(null);
    try {
      await adminListPubs();
      setAuthed(true);
    } catch (e) {
      setAuthed(false);
      setAuthErr(e instanceof Error ? e.message : 'Could not reach admin API');
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
    clearAccessJwt();
    setAuthed(false);
    setToken('');
  };

  return (
    <div className="app app--admin">
      <header className="header header--admin">
        <div className="header-inner">
          <button type="button" className="admin-back-btn" onClick={onBack}>← Back</button>
          <BrandIcon className="header-bench" branding={branding} />
          <h1>{branding.title}</h1>
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
            {authErr && (
              <p className="inline-error" style={{ marginBottom: 12 }}>{authErr}</p>
            )}
            {!authErr && (
              <p className="inline-error" style={{ marginBottom: 12 }}>
                Error — contact the site admin.
              </p>
            )}
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
            <BrandingPanel
              onSaved={setBranding}
              onUnauthorized={() => { clearAdminToken(); setAuthed(false); }}
            />
            <RoundPanel onUnauthorized={() => { clearAdminToken(); setAuthed(false); }} />
            <PubPanel onUnauthorized={() => { clearAdminToken(); setAuthed(false); }} />
          </>
        )}
      </main>
    </div>
  );
}

// ── Site branding ─────────────────────────────────────────────────────────────

function BrandingPanel({
  onSaved,
  onUnauthorized,
}: {
  onSaved: (b: BrandingSettings) => void;
  onUnauthorized: () => void;
}) {
  const [form, setForm] = useState<BrandingSettings>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [iconName, setIconName] = useState<string | null>(null);

  useEffect(() => {
    adminGetBranding()
      .then(setForm)
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'Failed to load branding';
        setErr(msg);
        if (msg.includes('Unauthorized')) onUnauthorized();
      })
      .finally(() => setLoading(false));
  }, [onUnauthorized]);

  const patch = (updates: Partial<BrandingSettings>) => {
    setForm((prev) => ({ ...prev, ...updates }));
    setSaved(false);
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    try {
      const icons = await readIconFile(file);
      patch(icons);
      setIconName(file.name);
    } catch (uploadErr) {
      setErr(uploadErr instanceof Error ? uploadErr.message : 'Icon upload failed');
    }
    e.target.value = '';
  };

  const handleClearIcon = () => {
    patch({ iconSvg: null, faviconDataUrl: null });
    setIconName(null);
  };

  const handleReset = () => {
    setForm({ ...DEFAULT_BRANDING });
    setIconName(null);
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setErr(null);
    setSaved(false);
    try {
      const next = await adminUpdateBranding(form);
      setForm(next);
      applyBranding(next);
      onSaved(next);
      setSaved(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setErr(msg);
      if (msg.includes('Unauthorized')) onUnauthorized();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="card-label">Site branding</div>
      <p className="text-muted admin-branding-hint">
        Customise colours, title, and icon for a redeployable instance. Changes apply site-wide after save.
      </p>

      {loading && <div className="spinner" style={{ margin: '16px auto' }} />}
      {err && <p className="inline-error">{err}</p>}

      {!loading && (
        <>
          <div className="admin-branding-preview" aria-hidden>
            <div
              className="admin-branding-preview-header"
              style={{ background: form.mainColor, color: '#f7f3ea' }}
            >
              <BrandIcon className="header-bench" branding={form} />
              <span>{form.title || 'Title'}</span>
            </div>
            <div
              className="admin-branding-preview-body"
              style={{ background: form.backgroundColor }}
            >
              <span
                className="admin-branding-swatch"
                style={{ background: form.accentColor }}
              />
              Accent
            </div>
          </div>

          <label className="admin-branding-field">
            <span className="admin-branding-label">Page title</span>
            <input
              className="admin-input"
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
              maxLength={80}
              placeholder="Weekly Picker"
            />
          </label>

          <div className="admin-branding-colors">
            <label className="admin-branding-field admin-branding-field--color">
              <span className="admin-branding-label">Main colour</span>
              <span className="admin-color-input">
                <input
                  type="color"
                  value={form.mainColor}
                  onChange={(e) => patch({ mainColor: e.target.value })}
                  aria-label="Main colour"
                />
                <input
                  className="admin-input"
                  value={form.mainColor}
                  onChange={(e) => patch({ mainColor: e.target.value })}
                  spellCheck={false}
                />
              </span>
              <span className="admin-branding-hint-inline">Header bar</span>
            </label>

            <label className="admin-branding-field admin-branding-field--color">
              <span className="admin-branding-label">Accent colour</span>
              <span className="admin-color-input">
                <input
                  type="color"
                  value={form.accentColor}
                  onChange={(e) => patch({ accentColor: e.target.value })}
                  aria-label="Accent colour"
                />
                <input
                  className="admin-input"
                  value={form.accentColor}
                  onChange={(e) => patch({ accentColor: e.target.value })}
                  spellCheck={false}
                />
              </span>
              <span className="admin-branding-hint-inline">Buttons &amp; highlights</span>
            </label>

            <label className="admin-branding-field admin-branding-field--color">
              <span className="admin-branding-label">Background colour</span>
              <span className="admin-color-input">
                <input
                  type="color"
                  value={form.backgroundColor}
                  onChange={(e) => patch({ backgroundColor: e.target.value })}
                  aria-label="Background colour"
                />
                <input
                  className="admin-input"
                  value={form.backgroundColor}
                  onChange={(e) => patch({ backgroundColor: e.target.value })}
                  spellCheck={false}
                />
              </span>
            </label>
          </div>

          <div className="admin-branding-icon">
            <span className="admin-branding-label">Icon</span>
            <p className="admin-branding-hint-inline">
              Used in the header and browser tab. SVG or PNG, max 150 KB.
            </p>
            <div className="admin-branding-icon-row">
              <label className="btn btn-secondary admin-icon-upload">
                {iconName ?? (form.iconSvg || form.faviconDataUrl ? 'Replace icon' : 'Upload icon')}
                <input
                  type="file"
                  accept="image/svg+xml,image/png,image/webp,image/jpeg,.svg"
                  onChange={handleIconUpload}
                  hidden
                />
              </label>
              {(form.iconSvg || form.faviconDataUrl) && (
                <button type="button" className="btn btn-secondary" onClick={handleClearIcon}>
                  Reset to default
                </button>
              )}
            </div>
          </div>

          <div className="admin-branding-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save branding'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleReset} disabled={saving}>
              Reset form
            </button>
          </div>

          {saved && <p className="admin-branding-saved">Branding saved.</p>}
        </>
      )}
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
