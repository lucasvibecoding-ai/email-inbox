'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import EmailList from '@/components/EmailList';
import EmailView from '@/components/EmailView';
import ComposeModal from '@/components/ComposeModal';
import { Email } from '@/lib/types';

export default function Home() {
  const [folder, setFolder] = useState('inbox');
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [thread, setThread] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [replyTo, setReplyTo] = useState<Email | null>(null);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ folder });
    if (search) params.set('search', search);
    const res = await fetch(`/api/emails?${params}`);
    const data = await res.json();
    setEmails(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [folder, search]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  // Poll for new emails every 15s
  useEffect(() => {
    const interval = setInterval(fetchEmails, 15000);
    return () => clearInterval(interval);
  }, [fetchEmails]);

  const selectEmail = async (email: Email) => {
    setSelectedEmail(email);
    const res = await fetch(`/api/emails/${email.id}`);
    const data = await res.json();
    setThread(data.thread || []);
    // Mark read locally
    setEmails((prev) => prev.map((e) => (e.id === email.id ? { ...e, is_read: true } : e)));
  };

  const handleStar = async (id: string, starred: boolean) => {
    await fetch(`/api/emails/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_starred: starred }),
    });
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, is_starred: starred } : e)));
  };

  const handleArchive = async (id: string) => {
    await fetch(`/api/emails/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_archived: true }),
    });
    setSelectedEmail(null);
    fetchEmails();
  };

  const handleTrash = async (id: string) => {
    await fetch(`/api/emails/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_trash: true }),
    });
    setSelectedEmail(null);
    fetchEmails();
  };

  const handleSend = async (data: {
    to: string;
    cc?: string;
    subject: string;
    text: string;
    html: string;
    inReplyTo?: string;
    references?: string[];
  }) => {
    setSending(true);
    try {
      const res = await fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.success) {
        setShowCompose(false);
        setReplyTo(null);
        fetchEmails();
      } else {
        alert(`Send failed: ${result.error}`);
      }
    } finally {
      setSending(false);
    }
  };

  const handleReply = (email: Email) => {
    setReplyTo(email);
    setShowCompose(true);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        currentFolder={folder}
        onFolderChange={(f) => {
          setFolder(f);
          setSelectedEmail(null);
        }}
        onCompose={() => {
          setReplyTo(null);
          setShowCompose(true);
        }}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Email list panel */}
        <div className="w-80 border-r border-[var(--border)] flex flex-col bg-white">
          <div className="p-3 border-b border-[var(--border)]">
            <input
              type="text"
              placeholder="Search emails..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg outline-none focus:border-[var(--primary)] transition-colors"
            />
          </div>
          <EmailList
            emails={emails}
            selectedId={selectedEmail?.id || null}
            onSelect={selectEmail}
            onStar={handleStar}
            loading={loading}
          />
        </div>

        {/* Email detail panel */}
        <div className="flex-1 flex flex-col bg-[var(--background)]">
          {selectedEmail ? (
            <EmailView
              email={selectedEmail}
              thread={thread}
              onReply={handleReply}
              onArchive={handleArchive}
              onTrash={handleTrash}
              onBack={() => setSelectedEmail(null)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-[var(--muted)]">
              Select an email to read
            </div>
          )}
        </div>
      </div>

      {showCompose && (
        <ComposeModal
          replyTo={replyTo}
          onSend={handleSend}
          onClose={() => {
            setShowCompose(false);
            setReplyTo(null);
          }}
          sending={sending}
        />
      )}
    </div>
  );
}
