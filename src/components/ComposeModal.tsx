'use client';

import { Email } from '@/lib/types';
import { useState } from 'react';

interface ComposeModalProps {
  replyTo?: Email | null;
  onSend: (data: {
    to: string;
    cc?: string;
    subject: string;
    text: string;
    html: string;
    inReplyTo?: string;
    references?: string[];
  }) => void;
  onClose: () => void;
  sending: boolean;
}

export default function ComposeModal({ replyTo, onSend, onClose, sending }: ComposeModalProps) {
  const [to, setTo] = useState(replyTo ? replyTo.from_address : '');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(
    replyTo ? (replyTo.subject?.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject || ''}`) : ''
  );
  const [body, setBody] = useState(
    replyTo
      ? `\n\n--- On ${new Date(replyTo.created_at).toLocaleString()}, ${replyTo.from_name || replyTo.from_address} wrote ---\n${replyTo.text_body || ''}`
      : ''
  );
  const [mode, setMode] = useState<'text' | 'html'>('text');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const refs = replyTo?.references ? [...replyTo.references] : [];
    if (replyTo?.message_id) refs.push(replyTo.message_id);

    let html: string;
    let text: string;

    if (mode === 'html') {
      html = body;
      // Strip tags for plain text fallback
      text = body.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    } else {
      text = body;
      html = `<div style="font-family: sans-serif; white-space: pre-wrap;">${body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>`;
    }

    onSend({
      to,
      cc: cc || undefined,
      subject,
      text,
      html,
      inReplyTo: replyTo?.message_id || undefined,
      references: refs.length ? refs : undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-end justify-center z-50 p-4">
      <div className="bg-white rounded-t-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h3 className="font-semibold">{replyTo ? 'Reply' : 'New Email'}</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode(mode === 'text' ? 'html' : 'text')}
              className={`text-xs px-2 py-1 rounded cursor-pointer ${
                mode === 'html'
                  ? 'bg-blue-100 text-[var(--primary)]'
                  : 'bg-gray-100 text-[var(--muted)]'
              }`}
            >
              {mode === 'html' ? 'HTML' : 'Plain Text'}
            </button>
            <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)] text-xl cursor-pointer">
              ×
            </button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-4 py-2 border-b border-[var(--border)]">
            <input
              type="text"
              placeholder="To"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full outline-none text-sm py-1"
              required
            />
          </div>
          <div className="px-4 py-2 border-b border-[var(--border)]">
            <input
              type="text"
              placeholder="Cc"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className="w-full outline-none text-sm py-1"
            />
          </div>
          <div className="px-4 py-2 border-b border-[var(--border)]">
            <input
              type="text"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full outline-none text-sm py-1"
            />
          </div>
          {mode === 'html' && (
            <div className="px-4 py-1 bg-gray-50 border-b border-[var(--border)] text-xs text-[var(--muted)]">
              Write raw HTML — it will be sent as-is
            </div>
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={mode === 'html' ? '<h1>Hello!</h1>\n<p>Your HTML email here...</p>' : 'Write your email...'}
            className={`flex-1 px-4 py-3 outline-none resize-none text-sm min-h-[200px] ${
              mode === 'html' ? 'font-mono text-xs' : ''
            }`}
          />
          <div className="flex justify-between items-center px-4 py-3 border-t border-[var(--border)]">
            <button
              type="submit"
              disabled={sending || !to}
              className="bg-[var(--primary)] text-white px-6 py-2 rounded-md text-sm font-medium hover:bg-[var(--primary-hover)] disabled:opacity-50 cursor-pointer"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
            >
              Discard
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
