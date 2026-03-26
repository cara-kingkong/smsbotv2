import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface PublicSupabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

declare global {
  interface Window {
    __KONG_PUBLIC_CONFIG__?: PublicSupabaseConfig;
  }
}

function firstDefined(...values: Array<string | undefined>): string {
  return values.find((value) => value && value.length > 0) ?? '';
}

export function getPublicSupabaseConfig(): PublicSupabaseConfig {
  const runtimeConfig =
    typeof window === 'undefined' ? undefined : window.__KONG_PUBLIC_CONFIG__;

  const supabaseUrl = firstDefined(
    runtimeConfig?.supabaseUrl,
    (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env.PUBLIC_SUPABASE_URL,
  );
  const supabaseAnonKey = firstDefined(
    runtimeConfig?.supabaseAnonKey,
    (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env.PUBLIC_SUPABASE_ANON_KEY,
  );

  if (!supabaseUrl || !supabaseAnonKey) {
    // During SSR of Vue components, window and import.meta.env.PUBLIC_* may
    // not be available. Return empty strings so the component can render a
    // loading state; on the client the real values will be injected via
    // window.__KONG_PUBLIC_CONFIG__ from BaseLayout.
    if (typeof window === 'undefined') {
      return { supabaseUrl: '', supabaseAnonKey: '' };
    }
    throw new Error('Missing Supabase client config');
  }

  return { supabaseUrl, supabaseAnonKey };
}

/**
 * Singleton Supabase client for Vue components.
 * Safe to call at module scope — during SSR it returns a no-op placeholder
 * that will never be used (all data fetching happens inside onMounted).
 */
let _publicClient: SupabaseClient | null = null;

export function getPublicSupabaseClient(): SupabaseClient {
  if (_publicClient) return _publicClient;

  const { supabaseUrl, supabaseAnonKey } = getPublicSupabaseConfig();

  // During SSR, return a minimal placeholder — components only use it in onMounted
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Proxy({} as SupabaseClient, {
      get() {
        throw new Error('Supabase client used during SSR — wrap calls in onMounted');
      },
    });
  }

  _publicClient = createClient(supabaseUrl, supabaseAnonKey);
  return _publicClient;
}
