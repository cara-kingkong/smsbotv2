import { defineMiddleware } from 'astro:middleware';
import { getSupabaseClient } from '@lib/db/client';

/** Routes that do NOT require authentication */
const PUBLIC_ROUTES = ['/login', '/auth/callback'];

function isPublic(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'));
}

function hasOAuthCallbackParams(url: URL): boolean {
  return (
    url.searchParams.has('code') ||
    url.searchParams.has('error_code') ||
    url.searchParams.has('error_description')
  );
}

function withNoStore(response: Response): Response {
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const onRequest = defineMiddleware(async ({ cookies, url, redirect, locals }, next) => {
  if (url.pathname !== '/auth/callback' && hasOAuthCallbackParams(url)) {
    const callbackUrl = new URL('/auth/callback', url);
    callbackUrl.search = url.search;
    return redirect(`${callbackUrl.pathname}${callbackUrl.search}`);
  }

  if (isPublic(url.pathname)) {
    return withNoStore(await next());
  }

  const accessToken = cookies.get('sb-access-token')?.value;
  const refreshToken = cookies.get('sb-refresh-token')?.value;

  if (!accessToken) {
    return redirect('/login');
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    // Try refreshing the token
    if (refreshToken) {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (refreshError || !refreshData.session) {
        // Clear stale cookies and redirect to login
        cookies.delete('sb-access-token', { path: '/' });
        cookies.delete('sb-refresh-token', { path: '/' });
        return redirect('/login');
      }

      // Update cookies with fresh tokens
      const isSecure = url.protocol === 'https:';
      cookies.set('sb-access-token', refreshData.session.access_token, {
        path: '/',
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        maxAge: 60 * 60,
      });
      cookies.set('sb-refresh-token', refreshData.session.refresh_token, {
        path: '/',
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
      });

      (locals as Record<string, unknown>).session = {
        user_id: refreshData.session.user.id,
        email: refreshData.session.user.email ?? '',
        access_token: refreshData.session.access_token,
      };

      return withNoStore(await next());
    }

    cookies.delete('sb-access-token', { path: '/' });
    cookies.delete('sb-refresh-token', { path: '/' });
    return redirect('/login');
  }

  (locals as Record<string, unknown>).session = {
    user_id: data.user.id,
    email: data.user.email ?? '',
    access_token: accessToken,
  };

  return withNoStore(await next());
});
