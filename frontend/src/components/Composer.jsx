import { ArrowUp, Paperclip, Mic, Square, X } from 'lucide-react';
import { useRef, useState } from 'react';

export default function Composer({ onSend, onStop, busy, initialValue = '', onAttachment, onVoice }) {
  const [text, setText] = useState(initialValue);
  const textarea = useRef(null);
  function submit(event) {
    event.preventDefault();
    if (text.trim() && !busy) {
      onSend(text.trim());
      setText('');
      if (textarea.current) textarea.current.style.height = 'auto';
    }
  }
  function update(event) {
    setText(event.target.value);
    event.target.style.height = 'auto';
    event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`;
  }
  return (
    <form className="composer" onSubmit={submit}>
      <textarea ref={textarea} value={text} onChange={update} onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(event); }
      }} placeholder="Ask anything, explore everything..." aria-label="Message ZENITH AI" rows={1} disabled={busy} />
      <div className="composer-footer">
        <div className="composer-tools">
          <button type="button" aria-label="Attach files (not available yet)" title="File attachments are not available yet" onClick={onAttachment}><Paperclip size={16} /><span>Attach</span></button>
          <span className="tool-divider" />
          <button type="button" aria-label="Voice input (not available yet)" title="Voice input is not available yet" onClick={onVoice}><Mic size={16} /></button>
          <span className="composer-hint">Shift + Enter for a new line</span>
        </div>
        {busy
          ? <button className="send-button stop-button" type="button" onClick={onStop} aria-label="Stop generating"><Square size={14} fill="currentColor" /></button>
          : <button className="send-button" type="submit" disabled={!text.trim()} aria-label="Send message"><ArrowUp size={18} /></button>}
      </div>
    </form>
  );
}
