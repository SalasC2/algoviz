import { useState } from 'react';
import { supabase } from '../../../utils/supabase';

import "./BetaSignup.css";

interface BetaSignupProps {
  source: string;
  onSignIn: () => void;
}

export const BetaSignup = ({ source, onSignIn }: BetaSignupProps) => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const handleSubmit = async () => {
    if (!email.trim()) return;
    setStatus('loading');
    const { error } = await (supabase as any)
      .from('beta_signups')
      .insert({ email: email.trim().toLowerCase(), source });

    if (error && error.code !== '23505') {
      setStatus('error');
    } else {
      setStatus('done');
    }
  };

  if (status === 'done') return (
    <p className="beta-confirm">You're on the list — we'll be in touch.</p>
  );

  return (
    <div className="beta-form">
      <input
        className="beta-input"
        type="email"
        placeholder="your@email.com"
        value={email}
        onChange={e => setEmail(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
      />
      <button
        className="beta-btn"
        onClick={handleSubmit}
        disabled={status === 'loading'}
      >
        {status === 'loading' ? 'Sending...' : 'Request Access'}
      </button>
      {status === 'error' && (
        <p className="beta-error">Something went wrong. Try again.</p>
      )}
      <p className="beta-already">
        Already have access?{' '}
        <button className="beta-signin-link" onClick={onSignIn}>
          Sign in here
        </button>
      </p>
    </div>
  );
};