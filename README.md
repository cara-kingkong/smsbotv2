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
