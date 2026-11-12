import { X, Moon, Sun, Sparkles } from 'lucide-react';

export default function PreferencesDialog({ preferences, onChange, onClose }) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="preferences-dialog" role="dialog" aria-modal="true" aria-labelledby="preferences-title">
        <div className="dialog-title"><div><span className="eyebrow">PERSONALIZE YOUR SPACE</span><h2 id="preferences-title">Preferences</h2></div><button className="icon-button" onClick={onClose} aria-label="Close preferences"><X size={18} /></button></div>
        <label className="preference-label">Appearance</label>
        <div className="theme-options">
          <button className={preferences.theme === 'dark' ? 'selected' : ''} onClick={() => onChange({ ...preferences, theme: 'dark' })}><Moon size={16} /> Dark</button>
          <button className={preferences.theme === 'light' ? 'selected' : ''} onClick={() => onChange({ ...preferences, theme: 'light' })}><Sun size={16} /> Light</button>
        </div>
        <label className="preference-label" htmlFor="instructions"><Sparkles size={14} /> Custom instructions <span>OPTIONAL</span></label>
        <textarea id="instructions" className="instructions-input" value={preferences.instructions} onChange={(event) => onChange({ ...preferences, instructions: event.target.value })} placeholder="Tell ZENITH how you'd like it to respond..." maxLength={1200} />
        <p className="dialog-note">Saved in this browser only. Instructions are sent with your chat requests.</p>
        <button className="dialog-done" onClick={onClose}>Done</button>
      </section>
    </div>
  );
}
