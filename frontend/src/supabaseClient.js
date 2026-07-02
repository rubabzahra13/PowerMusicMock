import { createClient } from '@supabase/supabase-js';

// If VITE_SUPABASE_URL is not set, we default to the project's Supabase instance URL.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://thnrekngjwtnjkksqomf.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
