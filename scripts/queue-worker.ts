/**
 * Local dev queue worker.
 * Polls the job queue every few seconds and triggers processing.
 *
 * Usage: npx tsx scripts/queue-worker.ts
 */

const BASE_URL = process.env.PUBLIC_SITE_URL ?? 'http://localhost:8888';
const POLL_INTERVAL = parseInt(process.env.QUEUE_POLL_INTERVAL ?? '10000', 10);

async function poll() {
  try {
    const res = await fetch(`${BASE_URL}/.netlify/functions/process-queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const text = await res.text();
    if (res.ok && text !== 'OK') {
      console.log(`[queue-worker] ${text}`);
    }
    if (!res.ok) {
      console.error(`[queue-worker] ${res.status}: ${text}`);
    }
  } catch (err) {
    console.error(`[queue-worker] fetch failed:`, (err as Error).message);
  }
}

console.log(`[queue-worker] Polling ${BASE_URL}/.netlify/functions/process-queue every ${POLL_INTERVAL}ms`);
console.log('[queue-worker] Press Ctrl+C to stop\n');

setInterval(poll, POLL_INTERVAL);
poll();
