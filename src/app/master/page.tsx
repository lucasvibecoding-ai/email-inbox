'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface MasterEmail {
  id: string;
  message_id: string | null;
  from_address: string;
  from_name: string | null;
  subject: string | null;
  text_body: string | null;
  preview: string;
  created_at: string;
  references: string[] | null;
  ai_status: string | null;
  ai_category: string | null;
  ai_confidence: number | null;
  ai_draft: string | null;
  ai_reason: string | null;
  account: { id: string; displayName: string; email: string; domain: string } | null;
}

interface Counts {
  needs_you: number;
  replied: number;
  no_reply: number;
  spam: number;
  all: number;
}

const TABS: { id: keyof Counts; label: string }[] = [
  { id: 'needs_you', label: 'Needs you' },
  { id: 'replied', label: 'Replied' },
  { id: 'no_reply', label: 'No reply' },
  { id: 'spam', label: 'Spam' },
  { id: 'all', label: 'All' },
];

function statusMeta(s: string | null): { label: string; cls: string } {
  switch (s) {
    case 'needs_human':
      return { label: 'Needs you', cls: 'bg-amber-100 text-amber-800' };
    case 'error':
      return { label: 'Triage error', cls: 'bg-red-100 text-red-700' };
    case 'auto_replied':
      return { label: 'Replied', cls: 'bg-green-100 text-green-700' };
    case 'no_reply_needed':
      return { label: 'No reply', cls: 'bg-gray-100 text-gray-500' };
    default:
      return { label: 'Pending', cls: 'bg-blue-50 text-blue-600' };
  }
}

function siteLabel(account: MasterEmail['account']): string {
  if (!account) return 'unknown';
  return account.domain.replace(/\.(com|net|org|io)$/, '');
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default function MasterView() {
  const [tab, setTab] = useState<keyof Counts>('needs_you');
  const [counts, setCounts] = useState<Counts>({ needs_you: 0, replied: 0, no_reply: 0, spam: 0, all: 0 });
  const [emails, setEmails] = useState<MasterEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [autoSend, setAutoSend] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/master?tab=${tab}`);
    if (!res.ok) return;
    const data = await res.json();
    setCounts(data.counts);
    setAutoSend(!!data.autoSend);
    setEmails(data.emails || []);
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    setExpandedId(null);
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const toggle = (e: MasterEmail) => {
    if (expandedId === e.id) {
      setExpandedId(null);
    } else {
      setExpandedId(e.id);
      setDraft(e.ai_draft || '');
      // Opening it here counts as "seen" — mark it read in the main inbox too.
      fetch(`/api/emails/${e.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_read: true }),
      }).catch(() => {});
    }
  };

  const send = async (e: MasterEmail) => {
    if (!e.account) {
      alert('This email is not mapped to a known course account, so it cannot be sent from here.');
      return;
    }
    if (!draft.trim()) return;
    setBusyId(e.id);
    try {
      const refs = e.references ? [...e.references] : [];
      if (e.message_id) refs.push(e.message_id);
      const subject = e.subject?.startsWith('Re:') ? e.subject : `Re: ${e.subject || ''}`;
      const html = `<div style="font-family: sans-serif; white-space: pre-wrap;">${escapeHtml(draft).replace(/\n/g, '<br>')}</div>`;
      const res = await fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: e.from_address,
          subject,
          text: draft,
          html,
          inReplyTo: e.message_id || undefined,
          references: refs.length ? refs : undefined,
          accountId: e.account.id,
          replyToEmailId: e.id,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setExpandedId(null);
        fetchData();
      } else {
        alert(`Send failed: ${result.error || 'unknown error'}`);
      }
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (e: MasterEmail) => {
    setBusyId(e.id);
    try {
      await fetch(`/api/emails/${e.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_status: 'no_reply_needed', is_read: true }),
      });
      setExpandedId(null);
      fetchData();
    } finally {
      setBusyId(null);
    }
  };

  const toggleAutoSend = async () => {
    const next = !autoSend;
    if (
      next &&
      !window.confirm(
        'Turn ON auto-send? The AI will start automatically sending replies to customers for questions it is confident about (access and pre-sale). Refunds, payments, complaints, and anything uncertain still wait for you.',
      )
    ) {
      return;
    }
    setAutoSend(next);
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoSend: next }),
    });
    if (!res.ok) {
      setAutoSend(!next);
      alert(
        'Could not change the setting. If auto-send has never been enabled, the app_settings table migration may still need to be run.',
      );
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[var(--background)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-white">
        <div>
          <h1 className="text-lg font-semibold">Master View</h1>
          <p className="text-xs text-[var(--muted)]">All inbound mail across every course, triaged by AI.</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={toggleAutoSend}
            title="When ON, the AI automatically sends replies it is confident about (access and pre-sale questions). Everything else still waits for you."
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors cursor-pointer ${
              autoSend
                ? 'bg-green-50 border-green-300 text-green-700'
                : 'bg-gray-50 border-[var(--border)] text-[var(--muted)]'
            }`}
          >
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${autoSend ? 'bg-green-500' : 'bg-gray-400'}`} />
            Auto-send AI emails: {autoSend ? 'ON' : 'OFF'}
          </button>
          <Link href="/" className="text-sm text-[var(--primary)] hover:underline">
            Inbox →
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-3 border-b border-[var(--border)] bg-white">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm rounded-t-lg cursor-pointer border-b-2 transition-colors ${
              tab === t.id
                ? 'border-[var(--primary)] text-[var(--primary)] font-medium'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs opacity-70">{counts[t.id]}</span>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-[var(--muted)] text-sm">Loading…</div>
        ) : emails.length === 0 ? (
          <div className="p-12 text-center text-[var(--muted)] text-sm">
            Nothing here. {tab === 'needs_you' ? 'No emails are waiting on you.' : ''}
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {emails.map((e) => {
              const meta = statusMeta(e.ai_status);
              const open = expandedId === e.id;
              const replied = e.ai_status === 'auto_replied';
              return (
                <div key={e.id} className="bg-white">
                  <button
                    onClick={() => toggle(e)}
                    className="w-full text-left px-6 py-3 flex items-center gap-3 hover:bg-[var(--hover)] cursor-pointer"
                  >
                    {e.ai_category === 'spam' && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold">
                        SPAM
                      </span>
                    )}
                    <span className="shrink-0 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-medium w-28 truncate" title={e.account?.displayName || ''}>
                      {siteLabel(e.account)}
                    </span>
                    <span className="shrink-0 w-40 truncate text-sm font-medium">
                      {e.from_name || e.from_address}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-sm">
                      <span className="text-[var(--foreground)]">{e.subject || '(no subject)'}</span>
                      <span className="text-[var(--muted)]"> — {e.preview}</span>
                    </span>
                    <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium ${meta.cls}`}>
                      {meta.label}
                    </span>
                    <span className="shrink-0 w-12 text-right text-xs text-[var(--muted)]">
                      {fmtTime(e.created_at)}
                    </span>
                    <span className="shrink-0 text-[var(--muted)] text-xs">{open ? '▾' : '▸'}</span>
                  </button>

                  {open && (
                    <div className="px-6 pb-5 grid grid-cols-1 md:grid-cols-2 gap-4 bg-[var(--background)]">
                      {/* Original */}
                      <div className="bg-white rounded-lg border border-[var(--border)] p-4">
                        <div className="text-xs text-[var(--muted)] mb-2">
                          From <span className="font-medium text-[var(--foreground)]">{e.from_name || ''} &lt;{e.from_address}&gt;</span>
                          <br />
                          To {e.account?.email || '—'}
                        </div>
                        <div className="text-sm font-medium mb-2">{e.subject || '(no subject)'}</div>
                        <div className="text-sm whitespace-pre-wrap text-[var(--foreground)] max-h-72 overflow-y-auto">
                          {e.text_body || e.preview || '(no body)'}
                        </div>
                      </div>

                      {/* AI reply */}
                      <div className="bg-white rounded-lg border border-[var(--border)] p-4 flex flex-col">
                        <div className="text-xs text-[var(--muted)] mb-2">
                          AI: <span className="font-medium">{(e.ai_category || 'untriaged').replace(/_/g, ' ')}</span>
                          {typeof e.ai_confidence === 'number' && (
                            <span> · {Math.round(e.ai_confidence * 100)}% confident</span>
                          )}
                          {e.ai_reason && <div className="mt-1 italic">{e.ai_reason}</div>}
                        </div>

                        {replied ? (
                          <div className="text-sm whitespace-pre-wrap text-[var(--foreground)] border-t border-[var(--border)] pt-2">
                            <div className="text-xs text-green-700 font-medium mb-1">✓ Reply sent</div>
                            {e.ai_draft || '(no draft on file)'}
                          </div>
                        ) : (
                          <>
                            <textarea
                              value={draft}
                              onChange={(ev) => setDraft(ev.target.value)}
                              placeholder="No draft — write a reply…"
                              className="flex-1 min-h-[180px] text-sm border border-[var(--border)] rounded-lg p-3 outline-none focus:border-[var(--primary)] resize-none whitespace-pre-wrap"
                            />
                            <div className="flex items-center gap-2 mt-3">
                              <button
                                onClick={() => send(e)}
                                disabled={busyId === e.id || !draft.trim() || !e.account}
                                className="bg-[var(--primary)] text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-[var(--primary-hover)] disabled:opacity-50 cursor-pointer"
                              >
                                {busyId === e.id ? 'Sending…' : `Send as ${e.account ? e.account.displayName.split(' - ')[0] : '—'}`}
                              </button>
                              <button
                                onClick={() => dismiss(e)}
                                disabled={busyId === e.id}
                                className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] px-3 py-2 cursor-pointer"
                              >
                                Dismiss (no reply)
                              </button>
                              <span className="ml-auto text-xs text-[var(--muted)]">
                                to {e.from_address}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
