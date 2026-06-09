/**
 * Bulk-apply a single Keap (Infusionsoft) tag to a list of contacts.
 *
 * Tagging in Keap is ADDITIVE — applying a tag never removes a contact's
 * existing tags, so all other tags stay intact.
 *
 * Auth matches src/lib/crm/adapters/keap.ts: a Personal Access Token sent as
 * `Authorization: Bearer <token>`, against the REST v1 API.
 *
 * The Keap Personal Access Token is read from a KEAP_ACCESS_TOKEN /
 * KEAP_API_KEY / KEAP_TOKEN / KEAP_PAT env var, or from the repo's .env file
 * automatically (no need to export it manually).
 *
 * Usage:
 *   node scripts/tag-keap-contacts.mjs <tagId> <contactId...>
 *   node scripts/tag-keap-contacts.mjs <tagId> --file ids.txt
 *   node scripts/tag-keap-contacts.mjs <tagId> --csv contacts.csv
 *   node scripts/tag-keap-contacts.mjs <tagId> --csv contacts.csv --column 1
 *
 *   # ids.txt = one contact ID per line (blank lines / # comments ignored)
 *   # contacts.csv = a CSV whose first column is the contact ID (any header
 *   #   row and non-numeric cells are skipped). Use --column for another column.
 *
 * Flags:
 *   --file <path>      read contact IDs from a text file (one per line)
 *   --csv <path>       read contact IDs from a CSV file
 *   --column <index>   0-based CSV column holding the contact ID (default: 0)
 *   --rate <perMin>    contacts to tag per minute (default: 20)
 *   --dry-run          print what would happen without calling the API
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = 'https://api.infusionsoft.com/crm/rest/v1';
const DEFAULT_RATE_PER_MIN = 20; // contacts tagged per minute (overridable with --rate)
const MAX_RETRIES = 3;
const TOKEN_ENV_NAMES = ['KEAP_PERSONAL_ACCESS_TOKEN', 'KEAP_ACCESS_TOKEN', 'KEAP_API_KEY', 'KEAP_TOKEN', 'KEAP_PAT'];

// Resolve the Keap token: prefer a real env var, otherwise fall back to the
// repo's .env file (parsed locally — never logged, never committed).
function resolveToken() {
  for (const name of TOKEN_ENV_NAMES) {
    if (process.env[name]) return { token: process.env[name], source: `${name} (env)` };
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(here, '..', '.env');
  if (!fs.existsSync(envPath)) return null;

  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!match || line.trimStart().startsWith('#')) continue;
    env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }

  for (const name of TOKEN_ENV_NAMES) {
    if (env[name]) return { token: env[name], source: `${name} (.env)` };
  }
  return null;
}

// Read contact IDs from a CSV. Contact IDs are numeric, so a plain comma split
// is enough — take the chosen column (default: first), drop a header row, and
// keep only cells that look like a numeric ID.
function idsFromCsv(text, column) {
  const colIndex = column !== undefined ? Number(column) : 0;
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => (line.split(',')[colIndex] ?? '').trim())
    .filter((cell) => /^\d+$/.test(cell)); // numeric IDs only — skips the header
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let dryRun = false;
  let filePath;
  let csvPath;
  let column;
  let ratePerMin = DEFAULT_RATE_PER_MIN;
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--file') filePath = args[++i];
    else if (arg === '--csv') csvPath = args[++i];
    else if (arg === '--column') column = args[++i];
    else if (arg === '--rate') ratePerMin = Number(args[++i]);
    else positional.push(arg);
  }

  if (!Number.isFinite(ratePerMin) || ratePerMin <= 0) {
    throw new Error('--rate must be a positive number (contacts per minute).');
  }

  const [tagId, ...inlineIds] = positional;
  if (!tagId) {
    throw new Error('Missing <tagId>. Usage: tag-keap-contacts.mjs <tagId> <contactId...> | --file ids.txt | --csv ids.csv');
  }

  let contactIds = inlineIds;
  if (filePath) {
    const fromFile = fs
      .readFileSync(filePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
    contactIds = [...contactIds, ...fromFile];
  }
  if (csvPath) {
    contactIds = [...contactIds, ...idsFromCsv(fs.readFileSync(csvPath, 'utf8'), column)];
  }

  // de-dupe while preserving order
  contactIds = [...new Set(contactIds)];

  if (contactIds.length === 0) {
    throw new Error('No contact IDs provided. Pass them as args, --file, or --csv.');
  }

  return { tagId, contactIds, dryRun, ratePerMin };
}

async function applyTag(token, contactId, tagId) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(`${BASE_URL}/contacts/${contactId}/tags`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tagIds: [Number(tagId)] }),
    });

    if (response.ok) return;

    const body = await response.text();

    // 429 = rate limited; back off and retry. Other 5xx are also worth a retry.
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < MAX_RETRIES) {
      const wait = Number(response.headers.get('retry-after')) * 1000 || attempt * 1000;
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }

    throw new Error(`HTTP ${response.status}: ${body}`);
  }
}

async function main() {
  const resolved = resolveToken();
  if (!resolved) {
    console.error(
      `Error: no Keap token found. Set one of ${TOKEN_ENV_NAMES.join(', ')} ` +
        `in the environment or in the repo .env file.`,
    );
    process.exit(1);
  }
  const token = resolved.token;

  const { tagId, contactIds, dryRun, ratePerMin } = parseArgs(process.argv);

  console.log(`Using token from ${resolved.source}`);
  console.log(
    `Applying tag ${tagId} to ${contactIds.length} contact(s) at ${ratePerMin}/min` +
      `${dryRun ? ' (DRY RUN)' : ''}\n`,
  );

  if (dryRun) {
    contactIds.forEach((id) => console.log(`  would tag contact ${id}`));
    return;
  }

  const succeeded = [];
  const failed = [];

  // Pace requests so we start at most `ratePerMin` per minute. Each request is
  // scheduled against an absolute start time, so a slow request doesn't push
  // the whole schedule back — throughput stays at the target rate.
  const intervalMs = 60_000 / ratePerMin;
  const startedAt = Date.now();

  for (let i = 0; i < contactIds.length; i++) {
    const id = contactIds[i];
    const waitMs = startedAt + i * intervalMs - Date.now();
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));

    try {
      await applyTag(token, id, tagId);
      succeeded.push(id);
      console.log(`  ✓ tagged ${id} (${succeeded.length + failed.length}/${contactIds.length})`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      failed.push({ id, error });
      console.error(`  ✗ ${id}: ${error} (${succeeded.length + failed.length}/${contactIds.length})`);
    }
  }

  console.log(`\nDone. ${succeeded.length} succeeded, ${failed.length} failed.`);
  if (failed.length > 0) {
    console.log('\nFailed contacts:');
    failed.forEach(({ id, error }) => console.log(`  ${id} — ${error}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
