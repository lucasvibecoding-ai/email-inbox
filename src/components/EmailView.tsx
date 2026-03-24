'use client';

import { Email } from '@/lib/types';
import { useState } from 'react';

interface EmailViewProps {
  email: Email;
  thread: Email[];
  onReply: (email: Email) => void;
  onArchive: (id: string) => void;
  onTrash: (id: string) => void;
  onBack: () => void;
}

export default function EmailView({ email, thread, onReply, onArchive, onTrash, onBack }: EmailViewProps) {
  const [showHtml, setShowHtml] = useState(true);
  const displayThread = thread.length > 1 ? thread : [email];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)] bg-white shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer">
            ← Back
          </button>
          <h2 className="text-lg font-semibold truncate">{email.subject || '(no subject)'}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onReply(email)}
            className="px-3 py-1.5 text-sm bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary-hover)] cursor-pointer"
          >
            Reply
          </button>
          <button
            onClick={() => onArchive(email.id)}
            className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-md hover:bg-[var(--hover)] cursor-pointer"
          >
            Archive
          </button>
          <button
            onClick={() => onTrash(email.id)}
            className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-md hover:bg-[var(--hover)] text-red-600 cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {displayThread.map((msg) => (
          <div key={msg.id} className="bg-white rounded-lg border border-[var(--border)] p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="font-medium text-sm">
                  {msg.direction === 'inbound' ? (msg.from_name || msg.from_address) : 'Me'}
                </span>
                <span className="text-xs text-[var(--muted)] ml-2">
                  &lt;{msg.from_address}&gt;
                </span>
              </div>
              <span className="text-xs text-[var(--muted)]">
                {new Date(msg.created_at).toLocaleString()}
              </span>
            </div>
            <div className="text-xs text-[var(--muted)] mb-3">
              To: {msg.to_addresses?.join(', ')}
              {msg.cc_addresses?.length ? ` | Cc: ${msg.cc_addresses.join(', ')}` : ''}
            </div>

            {msg.html_body && showHtml ? (
              <div className="prose prose-sm max-w-none">
                <div dangerouslySetInnerHTML={{ __html: msg.html_body }} />
              </div>
            ) : (
              <pre className="whitespace-pre-wrap text-sm font-sans">{msg.text_body || ''}</pre>
            )}

            {msg.html_body && (
              <button
                onClick={() => setShowHtml(!showHtml)}
                className="mt-2 text-xs text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
              >
                {showHtml ? 'Show plain text' : 'Show HTML'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
