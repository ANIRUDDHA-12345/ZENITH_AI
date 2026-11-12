import { Sparkles } from 'lucide-react';

export default function Brand({ compact = false }) {
  return (
    <a className={`brand${compact ? ' brand-compact' : ''}`} href="#" aria-label="ZENITH AI home">
      <span className="brand-mark" aria-hidden="true"><Sparkles size={20} strokeWidth={1.7} /></span>
      {!compact && <span className="brand-name">ZENITH<span>AI</span></span>}
    </a>
  );
}
