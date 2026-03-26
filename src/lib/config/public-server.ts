export interface PublicSupabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

function firstDefined(...values: Array<string | undefined>): string {
  return values.find((value) => value && value.length > 0) ?? '';
}

export function getPublicSupabaseConfig(): PublicSupabaseConfig {
  const supabaseUrl = firstDefined(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.SUPABASE_URL,
    process.env.PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL,
  );
  const supabaseAnonKey = firstDefined(
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    import.meta.env.SUPABASE_ANON_KEY,
    process.env.PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_ANON_KEY,
  );

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase public config');
  }

  return { supabaseUrl, supabaseAnonKey };
}
