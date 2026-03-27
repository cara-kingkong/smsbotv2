import type { AstroGlobal } from 'astro';
import { getSupabaseClient } from '@lib/db/client';

export interface AuthSession {
  user_id: string;
  email: string;
  access_token: string;
}

/**
 * Extract and validate the current user session from cookies.
 * Returns null if not authenticated.
 */
export async function getSession(Astro: AstroGlobal): Promise<AuthSession | null> {
  const supabase = getSupabaseClient();

  const accessToken = Astro.cookies.get('sb-access-token')?.value;
  const refreshToken = Astro.cookies.get('sb-refresh-token')?.value;

  if (!accessToken) return null;

  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    // Attempt refresh if we have a refresh token
    if (refreshToken) {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (refreshError || !refreshData.session) return null;

      // Update cookies with new tokens
      const isSecure = Astro.url.protocol === 'https:';
      Astro.cookies.set('sb-access-token', refreshData.session.access_token, {
        path: '/',
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        maxAge: 60 * 60, // 1 hour
      });
      Astro.cookies.set('sb-refresh-token', refreshData.session.refresh_token, {
        path: '/',
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      return {
        user_id: refreshData.session.user.id,
        email: refreshData.session.user.email ?? '',
        access_token: refreshData.session.access_token,
      };
    }
    return null;
  }

  return {
    user_id: data.user.id,
    email: data.user.email ?? '',
    access_token: accessToken,
  };
}

/**
 * Redirect to login if not authenticated.
 * Use at the top of protected pages.
 */
export async function requireAuth(Astro: AstroGlobal): Promise<AuthSession> {
  const session = await getSession(Astro);
  if (!session) {
    return Astro.redirect('/login') as never;
  }
  return session;
}

export { ensureWorkspace } from './ensure-workspace';
