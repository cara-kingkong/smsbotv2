const GOOGLE_CHAT_WEBHOOK_URL = process.env.GOOGLE_CHAT_WEBHOOK_URL;

/**
 * Post an error message to Google Chat via incoming webhook.
 * Fails silently — notification errors must never break the main flow.
 */
export async function notifyError(label: string, error: unknown, extra?: Record<string, unknown>): Promise<void> {
  if (!GOOGLE_CHAT_WEBHOOK_URL) return;

  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack?.split('\n').slice(0, 4).join('\n') : undefined;

  const lines = [
    `*${label}*`,
    `\`${message}\``,
  ];

  if (extra && Object.keys(extra).length > 0) {
    const details = Object.entries(extra)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    lines.push(details);
  }

  if (stack) {
    lines.push(`\`\`\`\n${stack}\n\`\`\``);
  }

  try {
    await fetch(GOOGLE_CHAT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ text: lines.join('\n') }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Swallow — never let notification failures cascade
  }
}
