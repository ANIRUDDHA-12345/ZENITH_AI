import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Atom, AudioLines, Menu, Plus, ShieldCheck, Sparkles, WandSparkles } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import Composer from './components/Composer.jsx';
import Message from './components/Message.jsx';
import PreferencesDialog from './components/PreferencesDialog.jsx';
import Brand from './components/Brand.jsx';
import { generateImage, streamChat } from './services/api.js';
import { MAX_ATTACHMENTS, prepareAttachment } from './utils/attachments.js';
import { deleteMedia, readConversations, readMediaDataUrl, readPreferences, saveMedia, writeConversations, writePreferences } from './utils/storage.js';

const starterPrompts = [
  { icon: Atom, label: 'Explore an idea', prompt: 'Explain a fascinating idea that changed how people see the world.' },
  { icon: WandSparkles, label: 'Create something', prompt: 'Help me brainstorm an original creative project.' },
  { icon: AudioLines, label: 'Solve a challenge', prompt: 'Help me break down a challenging problem into clear steps.' },
];

function makeConversation() {
  return { id: crypto.randomUUID(), title: 'New conversation', messages: [], updatedAt: new Date().toISOString() };
}

function downloadConversation(conversation) {
  const blob = new Blob([JSON.stringify(conversation, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${conversation.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'zenith-conversation'}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function toProviderMessage(message) {
  const attachments = message.attachments ?? [];
  if (!attachments.length) return { role: message.role, content: message.content };

  const documentText = attachments
    .filter((attachment) => attachment.kind === 'document')
    .map((attachment) => `Attached document: ${attachment.name}\n${attachment.text}`);
  const text = [message.content, ...documentText].filter(Boolean).join('\n\n');
  const images = await Promise.all(attachments
    .filter((attachment) => attachment.kind === 'image')
    .map(async (attachment) => ({
      type: 'image_url',
      image_url: { url: await readMediaDataUrl(attachment.mediaId) },
    })));
  if (!images.length) return { role: message.role, content: text };
  return { role: message.role, content: [{ type: 'text', text: text || 'Please review the attached image.' }, ...images] };
}

export default function App() {
  const [conversations, setConversations] = useState(readConversations);
  const [activeId, setActiveId] = useState(null);
  const [preferences, setPreferences] = useState(readPreferences);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [composerMode, setComposerMode] = useState('chat');
  const bottomRef = useRef(null);
  const abortRef = useRef(null);
  const current = conversations.find((chat) => chat.id === activeId) ?? null;
  const messages = current?.messages ?? [];

  useEffect(() => {
    try { writeConversations(conversations); }
    catch { setToast('Could not save locally. Your browser storage may be full.'); }
  }, [conversations]);
  useEffect(() => { writePreferences({ theme: preferences.theme, instructions: preferences.instructions }); }, [preferences.theme, preferences.instructions]);
  useEffect(() => { document.documentElement.dataset.theme = preferences.theme; }, [preferences.theme]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const updateConversation = useCallback((id, updater) => {
    setConversations((items) => items.map((item) => item.id === id ? updater(item) : item));
  }, []);

  function newConversation() {
    if (busy) abortRef.current?.abort();
    setEditing(null);
    clearPendingAttachments();
    setComposerMode('chat');
    setActiveId(null);
    setShowWorkspace(true);
  }

  const runAssistant = useCallback(async (conversationId, precedingMessages) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    const responseId = crypto.randomUUID();
    updateConversation(conversationId, (chat) => ({
      ...chat,
      messages: [...chat.messages, { id: responseId, role: 'assistant', content: '', pending: true, createdAt: new Date().toISOString() }],
      updatedAt: new Date().toISOString(),
    }));
    try {
      const requestHistory = preferences.instructions.trim()
        ? [{ role: 'system', content: preferences.instructions.trim() }, ...precedingMessages.slice(-39)]
        : precedingMessages.slice(-40);
      const requestMessages = await Promise.all(requestHistory.map(toProviderMessage));
      await streamChat(requestMessages, {
        signal: controller.signal,
        onText: (chunk) => updateConversation(conversationId, (chat) => ({
          ...chat,
          messages: chat.messages.map((message) => message.id === responseId
            ? { ...message, content: message.content + chunk }
            : message),
        })),
      });
      updateConversation(conversationId, (chat) => ({
        ...chat,
        messages: chat.messages.map((message) => message.id === responseId ? { ...message, pending: false } : message),
        updatedAt: new Date().toISOString(),
      }));
    } catch (error) {
      if (error.name === 'AbortError') {
        updateConversation(conversationId, (chat) => ({
          ...chat,
          messages: chat.messages.filter((message) => message.id !== responseId || message.content).map((message) => message.id === responseId ? { ...message, pending: false } : message),
        }));
      } else {
        updateConversation(conversationId, (chat) => ({
          ...chat,
          messages: chat.messages.map((message) => message.id === responseId
            ? { ...message, content: error.message, pending: false, error: true }
            : message),
        }));
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [preferences.instructions, updateConversation]);

  const runImageGeneration = useCallback(async (conversationId, prompt, attachments = []) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    const responseId = crypto.randomUUID();
    updateConversation(conversationId, (chat) => ({
      ...chat,
      messages: [...chat.messages, { id: responseId, role: 'assistant', content: '', imageGeneration: true, pending: true, createdAt: new Date().toISOString() }],
      updatedAt: new Date().toISOString(),
    }));
    try {
      const referenceImages = await Promise.all(attachments
        .filter((attachment) => attachment.kind === 'image')
        .map((attachment) => readMediaDataUrl(attachment.mediaId)));
      const dataUrl = await generateImage(prompt, { signal: controller.signal, referenceImages });
      const response = await fetch(dataUrl);
      if (!response.ok) throw new Error('The generated image could not be saved in this browser.');
      const mediaId = await saveMedia(await response.blob());
      const mediaType = dataUrl.slice(5, dataUrl.indexOf(';'));
      const extension = mediaType === 'image/webp' ? 'webp' : mediaType === 'image/jpeg' ? 'jpg' : 'png';
      updateConversation(conversationId, (chat) => ({
        ...chat,
        messages: chat.messages.map((message) => message.id === responseId
          ? { ...message, content: '', mediaId, fileName: `zenith-ai-image.${extension}`, pending: false }
          : message),
        updatedAt: new Date().toISOString(),
      }));
    } catch (error) {
      if (error.name === 'AbortError') {
        updateConversation(conversationId, (chat) => ({ ...chat, messages: chat.messages.filter((message) => message.id !== responseId) }));
      } else {
        updateConversation(conversationId, (chat) => ({
          ...chat,
          messages: chat.messages.map((message) => message.id === responseId
            ? { ...message, content: error.message, pending: false, error: true }
            : message),
        }));
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [updateConversation]);

  function removePendingAttachment(id) {
    const attachment = pendingAttachments.find((item) => item.id === id);
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    if (attachment?.mediaId) deleteMedia(attachment.mediaId).catch(() => setToast('Could not remove the image from local storage.'));
    setPendingAttachments((items) => items.filter((item) => item.id !== id));
  }

  async function addAttachments(files, mode) {
    const available = MAX_ATTACHMENTS - pendingAttachments.length;
    if (available <= 0) {
      setToast(`Attach up to ${MAX_ATTACHMENTS} files per message.`);
      return;
    }
    for (const file of files.slice(0, available)) {
      try {
        const prepared = await prepareAttachment(file, mode);
        const { blob, ...attachment } = prepared;
        if (blob) {
          attachment.mediaId = await saveMedia(blob);
          attachment.previewUrl = URL.createObjectURL(blob);
        }
        setPendingAttachments((items) => [...items, attachment]);
      } catch (error) {
        setToast(error.message);
      }
    }
    if (files.length > available) setToast(`Attach up to ${MAX_ATTACHMENTS} files per message.`);
  }

  function clearPendingAttachments() {
    pendingAttachments.forEach((attachment) => {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      if (attachment.mediaId) deleteMedia(attachment.mediaId).catch(() => setToast('Could not remove an image from local storage.'));
    });
    setPendingAttachments([]);
  }

  async function sendMessage(text, attachmentsToSend = pendingAttachments, mode = composerMode) {
    const trimmedText = text.trim();
    if ((!trimmedText && !attachmentsToSend.length) || busy) return;
    if (mode === 'image' && !trimmedText) {
      setToast('Describe the image you want to create.');
      return;
    }
    setEditing(null);
    let chat = current;
    let prior = chat?.messages ?? [];
    if (editing) {
      const index = prior.findIndex((message) => message.id === editing.id);
      const savedAttachments = attachmentsToSend.map(({ previewUrl, ...attachment }) => attachment);
      prior = [...prior.slice(0, index), { ...editing, content: trimmedText, attachments: [...(editing.attachments ?? []), ...savedAttachments], createdAt: new Date().toISOString() }];
      updateConversation(chat.id, (item) => ({ ...item, title: item.messages.length < 2 ? trimmedText.slice(0, 42) : item.title, messages: prior, updatedAt: new Date().toISOString() }));
    } else {
      if (!chat) {
        chat = makeConversation();
        chat.title = trimmedText.slice(0, 42);
        setActiveId(chat.id);
        setConversations((items) => [chat, ...items]);
      } else {
        const title = chat.messages.length === 0 ? trimmedText.slice(0, 42) : chat.title;
        chat = { ...chat, title };
      }
      const savedAttachments = attachmentsToSend.map(({ previewUrl, ...attachment }) => attachment);
      const userMessage = { id: crypto.randomUUID(), role: 'user', content: trimmedText || 'Please review the attached files.', attachments: savedAttachments, createdAt: new Date().toISOString() };
      prior = [...(chat.messages ?? []), userMessage];
      updateConversation(chat.id, (item) => ({ ...item, title: chat.title, messages: prior, updatedAt: new Date().toISOString() }));
    }
    attachmentsToSend.forEach((attachment) => {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    });
    setPendingAttachments([]);
    if (mode === 'image') await runImageGeneration(chat.id, trimmedText, attachmentsToSend);
    else await runAssistant(chat.id, prior);
  }

  async function retryResponse() {
    if (!current || busy) return;
    const preceding = messages.slice(0, -1);
    updateConversation(current.id, (chat) => ({ ...chat, messages: preceding }));
    if (messages[messages.length - 1]?.imageGeneration) {
      const lastUserMessage = preceding[preceding.length - 1];
      await runImageGeneration(current.id, lastUserMessage.content, lastUserMessage.attachments ?? []);
    } else {
      await runAssistant(current.id, preceding);
    }
  }

  async function regenerateResponse() {
    if (!current || busy) return;
    const preceding = messages.slice(0, -1);
    updateConversation(current.id, (chat) => ({ ...chat, messages: preceding }));
    if (messages[messages.length - 1]?.imageGeneration) {
      const lastUserMessage = preceding[preceding.length - 1];
      await runImageGeneration(current.id, lastUserMessage.content, lastUserMessage.attachments ?? []);
    } else {
      await runAssistant(current.id, preceding);
    }
  }

  function editMessage(message) {
    setEditing(message);
    requestAnimationFrame(() => {
      const input = document.querySelector('.composer textarea');
      input?.focus();
    });
  }

  const handleGlobalKeys = useCallback((event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      newConversation();
      document.querySelector('.composer textarea')?.focus();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      document.querySelector('.search-field input')?.focus();
    }
    if (event.key === 'Escape' && busy) abortRef.current?.abort();
  }, [busy]);
  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, [handleGlobalKeys]);

  const orderedConversations = useMemo(() => [...conversations].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)), [conversations]);
  const showWelcome = showWorkspace && messages.length === 0 && !busy;

  return (
    <div className={`app-shell ${showWorkspace ? 'workspace-active' : 'landing-active'}`}>
      {!showWorkspace ? (
        <main className="landing-page">
          <div className="cosmos cosmos-one" /><div className="cosmos cosmos-two" /><div className="star-field" />
          <header className="landing-nav">
            <Brand />
            <nav><a href="#capabilities">Capabilities</a><a href="#vision">Our vision</a></nav>
            <button className="nav-cta" onClick={() => setShowWorkspace(true)}>Open workspace <ArrowRight size={15} /></button>
          </header>
          <section className="hero-section">
            <div className="hero-orbit"><div className="orbit orbit-a" /><div className="orbit orbit-b" /><div className="hero-core"><span>✳</span></div><i className="orbit-dot dot-a" /><i className="orbit-dot dot-b" /><i className="orbit-dot dot-c" /></div>
            <div className="hero-copy"><div className="hero-overline"><span className="status-pulse" /> A NEW PERSPECTIVE, EVERY DAY</div>
              <h1>Where curiosity<br />meets <span>possibility.</span></h1>
              <p>Think bigger. Explore deeper. Create without boundaries.</p>
              <button className="hero-button" onClick={() => setShowWorkspace(true)}>Start exploring <ArrowRight size={17} /></button>
              <div className="hero-caption"><ShieldCheck size={14} /> Private by design · Your conversations stay in your browser</div>
            </div>
            <div className="hero-coordinate">37° 46' 49.2" N<br />122° 25' 09.1" W</div>
            <a className="scroll-indicator" href="#capabilities">DISCOVER <ArrowDown size={13} /></a>
          </section>
          <section className="capabilities-section" id="capabilities">
            <div className="section-heading"><span className="eyebrow">A HIGHER KIND OF THINKING</span><h2>Space to wonder.<br /><span>Power to make.</span></h2></div>
            <div className="feature-grid">
              <article><span className="feature-icon"><Sparkles size={19} /></span><h3>Ideas, unfolded</h3><p>Go from a passing question to a rich understanding, one thoughtful exchange at a time.</p><span className="feature-index">01 / EXPLORE</span></article>
              <article><span className="feature-icon cyan-icon"><WandSparkles size={19} /></span><h3>Make the unexpected</h3><p>Shape a first draft, find a fresh angle, or give form to the idea you can’t quite let go.</p><span className="feature-index">02 / CREATE</span></article>
              <article><span className="feature-icon blue-icon"><Atom size={19} /></span><h3>Think with clarity</h3><p>Untangle complex questions into understandable pieces and meaningful next steps.</p><span className="feature-index">03 / DISCOVER</span></article>
            </div>
          </section>
          <section className="vision-section" id="vision"><div className="vision-glow" /><span className="eyebrow">INTELLIGENCE BEYOND BOUNDARIES.</span><p>A little more perspective can change everything.</p><button className="text-cta" onClick={() => setShowWorkspace(true)}>Find your next idea <ArrowRight size={15} /></button></section>
          <footer className="landing-footer"><Brand /><span>Thoughtfully made for what’s next.</span><span>© 2026 ZENITH AI</span></footer>
        </main>
      ) : (
        <div className="workspace">
          <Sidebar conversations={orderedConversations} activeId={activeId} onSelect={setActiveId} onNew={newConversation}
            onRename={(id, title) => updateConversation(id, (chat) => ({ ...chat, title }))}
            onClear={(id) => updateConversation(id, (chat) => ({ ...chat, title: 'New conversation', messages: [], updatedAt: new Date().toISOString() }))}
            onDelete={(id) => { setConversations((items) => items.filter((chat) => chat.id !== id)); if (activeId === id) setActiveId(null); }}
            preferences={preferences} onPreferences={setPreferences} onExport={downloadConversation}
            mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
          <main className="chat-main">
            <header className="workspace-header">
              <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
              <div className="workspace-breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{current?.title ?? 'New conversation'}</strong></div>
              <div className="header-right"><span className="secure-label"><span /> Private session</span><button className="header-new-button" onClick={newConversation}><Plus size={16} /><span>New chat</span></button></div>
            </header>
            <div className={`chat-scroll ${showWelcome ? 'welcome-scroll' : ''}`}>
              {showWelcome ? <section className="welcome-panel">
                <div className="welcome-emblem"><span>✳</span><i /></div>
                <span className="eyebrow">YOUR SPACE TO EXPLORE</span>
                <h1>What’s on your<br /><span>mind today?</span></h1>
                <p>Bring a question, a half-formed thought, or a challenge.<br />We’ll find a way forward together.</p>
                <div className="starter-grid">{starterPrompts.map(({ icon: Icon, label, prompt }) => <button key={label} onClick={() => sendMessage(prompt)}><Icon size={17} /><span>{label}</span><ArrowRight size={14} /></button>)}</div>
              </section> : <section className="message-list" aria-live="polite">
                {messages.map((message, index) => <Message key={message.id} message={message} isLastAssistant={index === messages.length - 1 && message.role === 'assistant'} onEdit={editMessage} onRetry={retryResponse} onRegenerate={regenerateResponse} />)}
                {busy && messages[messages.length - 1]?.pending && !messages[messages.length - 1]?.content && <div className="typing-indicator"><span /><span /><span /> <small>{messages[messages.length - 1]?.imageGeneration ? 'Creating your image' : 'ZENITH is thinking'}</small></div>}
                <div ref={bottomRef} />
              </section>}
            </div>
            <div className="composer-dock">
              {editing && <div className="editing-banner"><span>Editing your message</span><button onClick={() => setEditing(null)} aria-label="Cancel edit">Cancel</button></div>}
              <Composer key={editing?.id ?? 'new-composer'} onSend={sendMessage} onStop={() => abortRef.current?.abort()} busy={busy} initialValue={editing?.content ?? ''}
                attachments={pendingAttachments} mode={composerMode} onModeChange={setComposerMode}
                onAttachment={addAttachments} onRemoveAttachment={removePendingAttachment}
                onVoice={() => setToast('Voice input is not available yet.')} />
              <p className="composer-disclaimer">{composerMode === 'image' ? 'Image generation uses your configured OpenRouter model and may incur provider charges.' : 'ZENITH AI can make mistakes. Check important information.'}</p>
            </div>
          </main>
          {preferences.settingsOpen && <PreferencesDialog preferences={preferences} onChange={(next) => setPreferences((currentPreferences) => ({ ...currentPreferences, theme: next.theme, instructions: next.instructions }))} onClose={() => setPreferences((currentPreferences) => ({ ...currentPreferences, settingsOpen: false }))} />}
          {toast && <div className="toast-message" role="status">{toast}</div>}
        </div>
      )}
    </div>
  );
}
