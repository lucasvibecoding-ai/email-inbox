'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  attachments?: { id: string; filename: string | null; content_type: string | null; size: number | null }[];
}

// A message in the expanded row's conversation, from GET /api/emails/[id].
interface ThreadEmail {
  id: string;
  direction: 'inbound' | 'outbound';
  from_name: string | null;
  from_address: string;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  created_at: string;
  attachments?: { id: string; filename: string | null; content_type: string | null; size: number | null }[];
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

/** Readable body for a thread message: plain text if present, else de-tagged HTML. */
function bodyText(m: ThreadEmail): string {
  if (m.text_body && m.text_body.trim()) return m.text_body;
  if (m.html_body) {
    return m.html_body
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  return '(no body)';
}

// Where a reply stops being new text and starts quoting what came before.
// Covers the English, French and Outlook header styles seen in this mailbox,
// plus a bare run of underscores and ">" quoting.
const QUOTE_MARKERS: RegExp[] = [
  /^-{2,}\s*On .+/m,
  /^On .+ wrote:\s*$/m,
  /^_{5,}\s*$/m,
  /^De\s*:\s.+/m,
  /^From:\s.+/m,
  /^Le .+ a écrit\s*:/m,
  /^>{1,}\s?/m,
];

/**
 * Split a body into the new text and the quoted history below it. Every
 * message in a thread tends to quote the whole conversation, which is pure
 * duplication once the thread is displayed message by message. Nothing is
 * discarded: the quoted part goes behind a disclosure.
 */
function splitQuote(body: string): { main: string; quoted: string } {
  let cut = -1;
  for (const re of QUOTE_MARKERS) {
    const m = body.match(re);
    if (m?.index !== undefined && (cut === -1 || m.index < cut)) cut = m.index;
  }
  // Ignore a marker so early that the message would be left empty.
  if (cut <= 0) return { main: body, quoted: '' };
  return { main: body.slice(0, cut).trim(), quoted: body.slice(cut).trim() };
}

/** The person behind an account, without the course suffix. */
function personName(displayName: string | undefined): string {
  if (!displayName) return 'You';
  return displayName.split(/\s+[-–—]\s+/)[0].trim() || 'You';
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
  const [thread, setThread] = useState<ThreadEmail[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const expandedIdRef = useRef<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [autoSend, setAutoSend] = useState(false);
  const [autoAck, setAutoAck] = useState(true);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/master?tab=${tab}`);
    if (!res.ok) return;
    const data = await res.json();
    setCounts(data.counts);
    setAutoSend(!!data.autoSend);
    if (typeof data.autoAck === 'boolean') setAutoAck(data.autoAck);
    setEmails(data.emails || []);
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    setExpandedId(null);
    fetchData();
  }, [fetchData]);

  // Poll every 15s, but only while the tab is on screen. This view pulls 200
  // rows per poll and was the single biggest consumer of the Supabase egress
  // quota when left open in a background tab. Switching back to it refreshes
  // immediately. Telegram alerts are unaffected: they are sent server-side
  // from the inbound webhook, not from this poll.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval === null) interval = setInterval(fetchData, 15000);
    };
    const stop = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchData();
        start();
      } else {
        stop();
      }
    };
    // No fetch here: the effect above already loads on mount and on tab change.
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stop();
    };
  }, [fetchData]);

  const toggle = async (e: MasterEmail) => {
    if (expandedId === e.id) {
      expandedIdRef.current = null;
      setExpandedId(null);
      setThread([]);
      return;
    }
    expandedIdRef.current = e.id;
    setExpandedId(e.id);
    setDraft(e.ai_draft || '');
    setThread([]);
    setThreadLoading(true);
    try {
      // GET returns the whole thread oldest first AND marks the email read,
      // which is what the PATCH this replaces used to do on its own.
      // light=1: this view renders plain text only, so it must not pull
      // html_body for the whole conversation.
      const res = await fetch(`/api/emails/${e.id}?light=1`);
      const data = await res.json();
      if (expandedIdRef.current !== e.id) return; // a newer row was opened
      const rows: ThreadEmail[] = Array.isArray(data.thread) ? data.thread : [];
      setThread(rows.length ? rows : data.email ? [data.email] : []);
    } catch {
      if (expandedIdRef.current === e.id) setThread([]);
    } finally {
      if (expandedIdRef.current === e.id) setThreadLoading(false);
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

  const toggleAutoAck = async () => {
    const next = !autoAck;
    if (
      !next &&
      !window.confirm(
        'Turn OFF the auto acknowledgement? New senders will stop receiving the "your email arrived" note until you turn it back on.',
      )
    ) {
      return;
    }
    setAutoAck(next);
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoAck: next }),
    });
    if (!res.ok) {
      setAutoAck(!next);
      alert('Could not change the setting.');
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
          <button
            onClick={toggleAutoAck}
            title="When ON, a fixed 'your email arrived' note is sent once per new conversation, to non-spam first-time emails only. Replies, bounces and automated senders never get one."
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors cursor-pointer ${
              autoAck
                ? 'bg-green-50 border-green-300 text-green-700'
                : 'bg-gray-50 border-[var(--border)] text-[var(--muted)]'
            }`}
          >
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${autoAck ? 'bg-green-500' : 'bg-gray-400'}`} />
            Auto acknowledge: {autoAck ? 'ON' : 'OFF'}
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
                    {(e.attachments?.length ?? 0) > 0 && (
                      <span className="shrink-0 text-xs" title="Has attachments">📎</span>
                    )}
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
                      {/* Conversation, oldest first */}
                      <div className="bg-white rounded-lg border border-[var(--border)] p-4">
                        <div className="text-xs text-[var(--muted)] mb-2">
                          With <span className="font-medium text-[var(--foreground)]">{e.from_name || ''} &lt;{e.from_address}&gt;</span>
                          <br />
                          To {e.account?.email || '—'}
                          {thread.length > 1 && (
                            <span> · {thread.length} messages in this conversation</span>
                          )}
                        </div>
                        <div className="text-sm font-medium mb-3">{e.subject || '(no subject)'}</div>

                        {threadLoading ? (
                          <div className="text-sm text-[var(--muted)]">Loading conversation…</div>
                        ) : thread.length === 0 ? (
                          <div className="text-sm whitespace-pre-wrap text-[var(--foreground)] max-h-72 overflow-y-auto">
                            {e.text_body || e.preview || '(no body)'}
                          </div>
                        ) : (
                          <div className="space-y-3 max-h-96 overflow-y-auto">
                            {thread.map((m) => {
                              const isOwner = m.direction === 'outbound';
                              const isCurrent = m.id === e.id;
                              return (
                                <div
                                  key={m.id}
                                  className={`rounded-md border p-3 ${
                                    isOwner
                                      ? 'bg-[var(--background)] border-[var(--border)]'
                                      : 'bg-white border-[var(--border)]'
                                  } ${isCurrent ? 'ring-1 ring-[var(--primary)]' : ''}`}
                                >
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="text-xs font-medium truncate">
                                      {isOwner
                                        ? personName(e.account?.displayName)
                                        : m.from_name || m.from_address}
                                      {isOwner && (
                                        <span className="ml-1 font-normal text-[var(--muted)]">(you)</span>
                                      )}
                                    </span>
                                    <span className="shrink-0 text-[11px] text-[var(--muted)]">
                                      {new Date(m.created_at).toLocaleString()}
                                      {isCurrent && thread.length > 1 && ' · this one'}
                                    </span>
                                  </div>
                                  {(() => {
                                    const { main, quoted } = splitQuote(bodyText(m));
                                    return (
                                      <>
                                        <div className="text-sm whitespace-pre-wrap text-[var(--foreground)]">
                                          {main || '(no new text)'}
                                        </div>
                                        {quoted && (
                                          <details className="mt-2">
                                            <summary className="text-xs text-[var(--muted)] cursor-pointer hover:text-[var(--foreground)]">
                                              show quoted text
                                            </summary>
                                            <div className="mt-1 pl-3 border-l-2 border-[var(--border)] text-xs whitespace-pre-wrap text-[var(--muted)]">
                                              {quoted}
                                            </div>
                                          </details>
                                        )}
                                      </>
                                    );
                                  })()}
                                  {(m.attachments?.length ?? 0) > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2 border-t border-[var(--border)] pt-2">
                                      {m.attachments!.map((a) => (
                                        <a
                                          key={a.id}
                                          href={`/api/attachments/${a.id}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--hover)] text-[var(--primary)]"
                                        >
                                          📎 {a.filename || 'attachment'}
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
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
