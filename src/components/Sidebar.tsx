'use client';

interface SidebarProps {
  currentFolder: string;
  onFolderChange: (folder: string) => void;
  onCompose: () => void;
}

const folders = [
  { id: 'inbox', label: 'Inbox', icon: '📥' },
  { id: 'sent', label: 'Sent', icon: '📤' },
  { id: 'starred', label: 'Starred', icon: '⭐' },
  { id: 'archived', label: 'Archive', icon: '📦' },
  { id: 'trash', label: 'Trash', icon: '🗑️' },
];

export default function Sidebar({ currentFolder, onFolderChange, onCompose }: SidebarProps) {
  return (
    <div className="w-56 bg-white border-r border-[var(--border)] flex flex-col h-full">
      <div className="p-4">
        <button
          onClick={onCompose}
          className="w-full bg-[var(--primary)] text-white rounded-lg px-4 py-2.5 font-medium hover:bg-[var(--primary-hover)] transition-colors cursor-pointer"
        >
          Compose
        </button>
      </div>
      <nav className="flex-1 px-2">
        {folders.map((folder) => (
          <button
            key={folder.id}
            onClick={() => onFolderChange(folder.id)}
            className={`w-full text-left px-3 py-2 rounded-lg mb-0.5 flex items-center gap-2 text-sm cursor-pointer transition-colors ${
              currentFolder === folder.id
                ? 'bg-blue-50 text-[var(--primary)] font-medium'
                : 'text-[var(--foreground)] hover:bg-[var(--hover)]'
            }`}
          >
            <span>{folder.icon}</span>
            {folder.label}
          </button>
        ))}
      </nav>
      <div className="p-4 text-xs text-[var(--muted)] border-t border-[var(--border)]">
        hello@mycandlebusiness.com
      </div>
    </div>
  );
}
