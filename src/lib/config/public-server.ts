export interface AvailableWorkspace {
  id: string;
  name: string;
  role: string;
}

export interface PublicSupabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  workspaceId: string;
  userId: string;
  userEmail: string;
  userName: string;
  activeWorkspaceRole: string;
  isPlatformAdmin: boolean;
  availableWorkspaces: AvailableWorkspace[];
}

function firstDefined(...values: Array<string | undefined>): string {
  return values.find((value) => value && value.length > 0) ?? '';
}

/**
 * Build the public config that gets injected into window.__KONG_PUBLIC_CONFIG__.
 * Accepts optional session context to pass workspace/user info to Vue components.
 */
export function getPublicSupabaseConfig(context?: {
  workspaceId?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  activeWorkspaceRole?: string;
  isPlatformAdmin?: boolean;
  availableWorkspaces?: AvailableWorkspace[];
}): PublicSupabaseConfig {
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

  return {
    supabaseUrl,
    supabaseAnonKey,
    workspaceId: context?.workspaceId ?? '',
    userId: context?.userId ?? '',
    userEmail: context?.userEmail ?? '',
    userName: context?.userName ?? '',
    activeWorkspaceRole: context?.activeWorkspaceRole ?? '',
    isPlatformAdmin: context?.isPlatformAdmin ?? false,
    availableWorkspaces: context?.availableWorkspaces ?? [],
  };
}
