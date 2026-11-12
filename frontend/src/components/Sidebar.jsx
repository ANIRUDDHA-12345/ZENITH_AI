import { useMemo, useState } from 'react';
import { Plus, Search, MessageSquare, MoreHorizontal, Pencil, Trash2, X, Settings2, Download, Sun, Moon, Menu } from 'lucide-react';
import Brand from './Brand.jsx';

export default function Sidebar({ conversations, activeId, onSelect, onNew, onRename, onClear, onDelete, preferences, onPreferences, onExport, mobileOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [menuId, setMenuId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');
  const filtered = useMemo(() => conversations.filter((chat) => chat.title.toLowerCase().includes(query.toLowerCase())), [conversations, query]);
  function startRename(chat) { setEditingId(chat.id); setDraft(chat.title); setMenuId(null); }
  function finishRename(id) { if (draft.trim()) onRename(id, draft.trim()); setEditingId(null); }
  return (
    <>
      {mobileOpen && <button className="sidebar-backdrop" onClick={onClose} aria-label="Close navigation" />}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-top"><Brand /><button className="icon-button mobile-close" onClick={onClose} aria-label="Close sidebar"><X size={18} /></button></div>
        <button className="new-chat-button" onClick={() => { onNew(); onClose(); }}><Plus size={17} /> New conversation <span>⌘ K</span></button>
        <label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" /><kbd>⌘F</kbd></label>
        <div className="history-label">YOUR SPACE <span>{filtered.length}</span></div>
        <div className="conversation-list">
          {filtered.map((chat) => <div key={chat.id} className={`conversation-item ${chat.id === activeId ? 'active' : ''}`}>
            {editingId === chat.id ? <input className="rename-input" autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => finishRename(chat.id)} onKeyDown={(event) => { if (event.key === 'Enter') finishRename(chat.id); if (event.key === 'Escape') setEditingId(null); }} /> :
              <button className="conversation-select" onClick={() => { onSelect(chat.id); onClose(); }}><MessageSquare size={15} /><span>{chat.title}</span></button>}
            <button className="conversation-menu-button" onClick={() => setMenuId(menuId === chat.id ? null : chat.id)} aria-label={`Options for ${chat.title}`}><MoreHorizontal size={17} /></button>
            {menuId === chat.id && <div className="conversation-menu"><button onClick={() => startRename(chat)}><Pencil size={14} /> Rename</button><button onClick={() => { onClear(chat.id); setMenuId(null); }}><X size={14} /> Clear conversation</button><button onClick={() => { onExport(chat); setMenuId(null); }}><Download size={14} /> Export</button><button className="danger-action" onClick={() => { onDelete(chat.id); setMenuId(null); }}><Trash2 size={14} /> Delete</button></div>}
          </div>)}
          {!filtered.length && <p className="empty-search">{query ? 'No conversations found.' : 'Your conversations will appear here.'}</p>}
        </div>
        <div className="sidebar-bottom">
          <button className="settings-button" onClick={() => onPreferences({ ...preferences, settingsOpen: true })}><Settings2 size={16} /><span>Preferences</span></button>
          <div className="profile-card"><div className="profile-orb">Z</div><div><strong>ZENITH</strong><small>Personal workspace</small></div><span className="offline-dot" title="Local workspace" /></div>
        </div>
      </aside>
    </>
  );
}
