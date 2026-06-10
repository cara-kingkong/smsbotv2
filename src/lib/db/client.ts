import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;
let _serviceClient: SupabaseClient | null = null;

/**
 * Browser / anon-key client — respects RLS.
 * Use in Astro pages and client-side code.
 */
export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }

  // Server-side singleton: cookies are the source of truth, so the client must
  // not persist or auto-rotate sessions. Leaving these on caused the shared
  // client to rotate refresh tokens across requests, invalidating cookie tokens
  // and logging users out long before the 7-day cookie expired.
  _client = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return _client;
}

/**
 * Service-role client — bypasses RLS.
 * Use ONLY in Netlify Functions and background jobs.
 */
export function getServiceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient;

  const url = process.env.SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  _serviceClient = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return _serviceClient;
}

/**
 * Create a per-request client with user's access token for SSR pages.
 */
export function getAuthenticatedClient(accessToken: string): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}
