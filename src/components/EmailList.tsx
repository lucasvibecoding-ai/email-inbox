'use client';

import { Email } from '@/lib/types';

interface EmailListProps {
  emails: Email[];
  selectedId: string | null;
  onSelect: (email: Email) => void;
  onStar: (id: string, starred: boolean) => void;
  loading: boolean;
}

function timeAgo(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function EmailList({ emails, selectedId, onSelect, onStar, loading }: EmailListProps) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--muted)]">
        Loading...
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--muted)]">
        No emails
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {emails.map((email) => (
        <div
          key={email.id}
          onClick={() => onSelect(email)}
          className={`px-4 py-3 border-b border-[var(--border)] cursor-pointer transition-colors ${
            selectedId === email.id ? 'bg-blue-50' : 'hover:bg-[var(--hover)]'
          } ${!email.is_read ? 'bg-white' : 'bg-gray-50/50'}`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className={`text-sm truncate ${!email.is_read ? 'font-semibold' : ''}`}>
              {email.direction === 'inbound'
                ? email.from_name || email.from_address
                : `To: ${email.to_addresses?.[0] || ''}`}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStar(email.id, !email.is_starred);
                }}
                className="text-sm cursor-pointer hover:scale-110 transition-transform"
              >
                {email.is_starred ? '⭐' : '☆'}
              </button>
              <span className="text-xs text-[var(--muted)]">
                {timeAgo(email.created_at)}
              </span>
            </div>
          </div>
          <div className={`text-sm truncate ${!email.is_read ? 'font-medium' : 'text-[var(--foreground)]'}`}>
            {email.subject || '(no subject)'}
          </div>
          <div className="text-xs text-[var(--muted)] truncate mt-0.5">
            {email.text_body?.slice(0, 100) || ''}
          </div>
        </div>
      ))}
    </div>
  );
}
