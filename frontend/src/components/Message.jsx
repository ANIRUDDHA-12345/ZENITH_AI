import { Check, Copy, RotateCw, Pencil, AlertCircle, Paperclip } from 'lucide-react';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { readMedia } from '../utils/storage.js';

function StoredImage({ mediaId, name }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl;
    readMedia(mediaId).then((blob) => {
      if (!blob) throw new Error('Image not found');
      objectUrl = URL.createObjectURL(blob);
      if (active) setUrl(objectUrl);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId]);
  if (failed) return <span className="attachment-unavailable">Image unavailable in local storage</span>;
  if (!url) return <span className="attachment-loading">Loading image…</span>;
  return <a className="message-image-link" href={url} download={name} title="Download image"><img src={url} alt={name} /></a>;
}

function CodeBlock({ children, className }) {
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, '');
  const language = /language-(\w+)/.exec(className ?? '')?.[1] ?? 'code';
  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="code-frame">
      <div className="code-heading"><span>{language}</span><button onClick={copyCode} aria-label="Copy code">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}</button></div>
      <pre><code className={className}>{code}</code></pre>
    </div>
  );
}

export default function Message({ message, onCopy, onRegenerate, onEdit, isLastAssistant, onRetry }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  async function copyMessage() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
    onCopy?.();
  }
  return (
    <article className={`message-row ${isUser ? 'user-row' : 'assistant-row'}`}>
      {!isUser && <div className="assistant-avatar"><span className="mini-star">✳</span></div>}
      <div className="message-content">
        <div className="message-byline">{isUser ? 'You' : 'ZENITH'}<time>{message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</time></div>
        <div className={`message-body ${isUser ? 'user-bubble' : ''} ${message.error ? 'message-error' : ''}`}>
          {message.error ? <><AlertCircle size={16} /><span>{message.content}</span></> : isUser
            ? <p>{message.content}</p>
            : <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={{
              code({ children, className, ...props }) {
                return className ? <CodeBlock className={className}>{children}</CodeBlock> : <code className="inline-code" {...props}>{children}</code>;
              },
            }}>{message.content || ''}</ReactMarkdown>}
        </div>
        {!message.error && message.attachments?.length > 0 && <div className="message-attachments">
          {message.attachments.map((attachment) => attachment.kind === 'image'
            ? <StoredImage key={attachment.id} mediaId={attachment.mediaId} name={attachment.name} />
            : <span className="message-document" key={attachment.id}><Paperclip size={13} />{attachment.name}</span>)}
        </div>}
        {!message.error && message.mediaId && <div className="generated-image"><StoredImage mediaId={message.mediaId} name={message.fileName ?? 'zenith-generated-image.webp'} /></div>}
        {!message.pending && (
          <div className="message-actions">
            {message.content && <button onClick={copyMessage} aria-label="Copy message">{copied ? <Check size={14} /> : <Copy size={14} />}</button>}
            {isUser && <button onClick={() => onEdit?.(message)} aria-label="Edit message"><Pencil size={14} /></button>}
            {!isUser && isLastAssistant && (message.error
              ? <button onClick={() => onRetry?.()} aria-label="Retry response"><RotateCw size={14} /></button>
              : <button onClick={() => onRegenerate?.()} aria-label="Regenerate response"><RotateCw size={14} /></button>)}
          </div>
        )}
      </div>
    </article>
  );
}
