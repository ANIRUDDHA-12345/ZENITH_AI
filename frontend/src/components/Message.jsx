import { Check, Copy, RotateCw, Pencil, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

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
        {!message.pending && (
          <div className="message-actions">
            <button onClick={copyMessage} aria-label="Copy message">{copied ? <Check size={14} /> : <Copy size={14} />}</button>
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
