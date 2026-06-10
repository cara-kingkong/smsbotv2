# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Auth: users no longer logged out early.** Sessions were ending well under
  the intended 7-day window. The browser Supabase client auto-refreshed (and
  rotated) the refresh token in `localStorage` while the server cookie still
  held the old token; with refresh-token rotation enabled on the hosted
  project, the stale cookie token was invalidated within seconds and the next
  server-side refresh redirected the user to `/login`. Cookies are now the
  single source of truth — `persistSession` and `autoRefreshToken` are disabled
  on every Supabase client, and the middleware is the only place that rotates
  tokens (writing the new token straight back to the cookie).
