# Kong SMS

Multi-workspace SMS chatbot platform for AI-driven conversations, lead qualification, and calendar booking.

## Tech Stack

- **Frontend/Server**: Astro
- **Database/Auth**: Supabase
- **SMS**: Twilio
- **Booking**: Calendly
- **AI**: OpenAI / Anthropic

## Getting Started

```bash
npm install
npm run dev
```

### Local Dev: Email/Password Sign-In

To skip configuring Google OAuth locally, the login page supports email/password sign-in when `PUBLIC_ENABLE_PASSWORD_LOGIN=true`. Intended for local/staging against a Supabase staging project — leave it unset in production.

1. In your staging Supabase project, go to **Authentication** > **Providers** and confirm **Email** is enabled.
2. Go to **Authentication** > **Users** > **Add user**, enter an email + password, and tick **Auto Confirm User** so you don't need to verify via email.
3. Add to your local `.env`:
   ```
   PUBLIC_ENABLE_PASSWORD_LOGIN=true
   ```
   along with your staging `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
4. Visit `/login` — an email/password form appears below the Google button.

## Build & Test

```bash
npm run build
npm test
npm run lint
```

## Scripts

### Bulk-tag Keap contacts

`scripts/tag-keap-contacts.mjs` applies a single Keap (Infusionsoft) tag to a list of contacts. Tagging in Keap is **additive** — applying a tag never removes a contact's existing tags, so all other tags stay intact.

It needs a Keap **Personal Access Token** and the numeric **tag ID** (found in Keap under **Settings → Tags**). The token is read automatically from the repo's `.env` file (`KEAP_PERSONAL_ACCESS_TOKEN`), or from an env var of the same name — no need to pass it on the command line.

```bash
# Inline contact IDs
node scripts/tag-keap-contacts.mjs <tagId> 5001 5002 5003

# From a text file (one contact ID per line; blank lines and # comments ignored)
node scripts/tag-keap-contacts.mjs <tagId> --file ids.txt

# From a CSV file (uses the first column; any header row is skipped)
node scripts/tag-keap-contacts.mjs <tagId> --csv contacts.csv

# From a CSV where the ID is in another column (0-based index)
node scripts/tag-keap-contacts.mjs <tagId> --csv contacts.csv --column 1

# Slow down or speed up the pace (contacts per minute; default 20)
node scripts/tag-keap-contacts.mjs <tagId> --csv contacts.csv --rate 30

# Preview without calling the API
node scripts/tag-keap-contacts.mjs <tagId> --csv contacts.csv --dry-run
```

The first argument is always the tag ID, followed by contact IDs (or `--file <path>` / `--csv <path>`). The CSV reader takes the first column by default (use `--column <index>` for another), and keeps only numeric cells — so a header row and any non-ID columns are skipped automatically. Contact IDs are de-duplicated automatically. Requests are paced at `--rate` contacts per minute (default 20), retried on rate-limit (`429`) and server errors, and reported per-contact with a ✓/✗ and progress counter; the script exits non-zero if any contact failed so you can re-run just the failures.

> This is a local-only utility — it lives in `scripts/`, is not part of the Astro build, and never deploys or runs as part of the site.

## Deployment Notes

### Supabase Auth Configuration

After deploying to a new environment, update the Supabase auth settings to prevent OAuth redirecting to `localhost`:

1. Go to **Supabase Dashboard** > **Authentication** > **URL Configuration**
2. Set **Site URL** to your production URL (e.g. `https://yourdomain.com`)
3. Add your production callback to **Redirect URLs**: `https://yourdomain.com/auth/callback`
4. Keep `http://localhost:3000/auth/callback` in Redirect URLs for local development

### Google OAuth Console

1. Go to **Google Cloud Console** > **Credentials** > your OAuth 2.0 Client
2. Add your production domain to **Authorized JavaScript origins**
3. Confirm `https://<your-supabase-project>.supabase.co/auth/v1/callback` is in **Authorized redirect URIs**

### Environment Variables

Ensure the following are set in your production environment:

- `PUBLIC_SUPABASE_URL` — your Supabase project URL
- `PUBLIC_SUPABASE_ANON_KEY` — your Supabase anon/public key
- `PUBLIC_SITE_URL` — your production URL (used by queue worker and Twilio callbacks)

### Twilio

- Set `TWILIO_STATUS_CALLBACK_BASE_URL` or `PUBLIC_SITE_URL` to your production URL so status callbacks reach the correct endpoint.
