// utils/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

console.log(supabaseUrl)

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'public' },
  global: {
    fetch: (url, options = {}) => {
      return fetch(url, { ...options, signal: AbortSignal.timeout(5000) })
    }
  }
})

export const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin
        }
    })
}

export const signOut = async () => {
    await supabase.auth.signOut();
}