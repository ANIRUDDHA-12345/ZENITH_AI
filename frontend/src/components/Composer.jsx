import { ArrowUp, ImagePlus, Paperclip, Mic, Square, X } from 'lucide-react';
import { useRef, useState } from 'react';

export default function Composer({ onSend, onStop, busy, initialValue = '', attachments = [], mode = 'chat', onModeChange, onAttachment, onRemoveAttachment, onVoice }) {
  const [text, setText] = useState(initialValue);
  const textarea = useRef(null);
  const fileInput = useRef(null);
  function submit(event) {
    event.preventDefault();
    if ((text.trim() || attachments.length) && !busy) {
      onSend(text.trim(), attachments, mode);
      setText('');
      if (textarea.current) textarea.current.style.height = 'auto';
    }
  }
  function update(event) {
    setText(event.target.value);
    event.target.style.height = 'auto';
    event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`;
  }
  const canSubmit = mode === 'image' ? Boolean(text.trim()) : Boolean(text.trim() || attachments.length);
  return (
    <form className="composer" onSubmit={submit}>
      {attachments.length > 0 && <div className="composer-attachments">
        {attachments.map((attachment) => <div className="composer-attachment" key={attachment.id}>
          {attachment.kind === 'image' ? <img src={attachment.previewUrl} alt="" /> : <Paperclip size={14} />}
          <span title={attachment.name}>{attachment.name}</span>
          <button type="button" onClick={() => onRemoveAttachment(attachment.id)} aria-label={`Remove ${attachment.name}`}><X size={13} /></button>
        </div>)}
      </div>}
      <textarea ref={textarea} value={text} onChange={update} onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(event); }
      }} placeholder={mode === 'image' ? 'Describe the image you want to create...' : 'Ask anything, explore everything...'} aria-label={mode === 'image' ? 'Describe an image to create' : 'Message ZENITH AI'} rows={1} disabled={busy} />
      <input ref={fileInput} className="visually-hidden" type="file" multiple
        accept={mode === 'image' ? 'image/png,image/jpeg,image/webp' : 'image/png,image/jpeg,image/webp,.pdf,.docx,.txt,.md,.csv,.json'}
        onChange={(event) => { onAttachment(Array.from(event.target.files ?? []), mode); event.target.value = ''; }} />
      <div className="composer-footer">
        <div className="composer-tools">
          <button type="button" aria-label={mode === 'image' ? 'Attach reference images' : 'Attach images or documents'} title={mode === 'image' ? 'Attach reference images' : 'Attach images or documents'} onClick={() => fileInput.current?.click()} disabled={busy}><Paperclip size={16} /><span>Attach</span></button>
          <span className="tool-divider" />
          <button type="button" aria-label="Voice input (not available yet)" title="Voice input is not available yet" onClick={onVoice}><Mic size={16} /></button>
          <button type="button" className={`image-mode-toggle${mode === 'image' ? ' selected' : ''}`} onClick={() => onModeChange(mode === 'image' ? 'chat' : 'image')} disabled={busy || (mode === 'chat' && attachments.some((attachment) => attachment.kind === 'document'))} aria-pressed={mode === 'image'}>
            <ImagePlus size={15} /><span>{mode === 'image' ? 'Chat' : 'Create image'}</span>
          </button>
          <span className="composer-hint">Shift + Enter for a new line</span>
        </div>
        {busy
          ? <button className="send-button stop-button" type="button" onClick={onStop} aria-label="Stop generating"><Square size={14} fill="currentColor" /></button>
          : <button className="send-button" type="submit" disabled={!canSubmit} aria-label={mode === 'image' ? 'Create image' : 'Send message'}><ArrowUp size={18} /></button>}
      </div>
    </form>
  );
}
