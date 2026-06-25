/**
 * Export conversations from Supabase into analysis-ready files.
 *
 * Produces TWO outputs from a single run so you can pick whichever fits the
 * analysis:
 *   - conversations-<ts>.csv   one row per conversation (lead + campaign + agent
 *                              + status/outcome + message counts + transcript).
 *                              Drops straight into a spreadsheet or pandas.
 *   - conversations-<ts>.jsonl one JSON object per line, with the full nested
 *                              messages array (+ events with --events). Best for
 *                              reading transcripts or feeding to an LLM/NLP.
 *
 * Uses the SUPABASE_SERVICE_ROLE_KEY so it bypasses RLS and sees every
 * workspace's data — this is an admin/offline export, never client-facing.
 * Credentials are read from real env vars, or from the repo's .env file
 * automatically (parsed locally — never logged, never committed).
 *
 * Usage:
 *   node scripts/export-conversations.mjs
 *   node scripts/export-conversations.mjs --workspace <uuid>
 *   node scripts/export-conversations.mjs --campaign <uuid>
 *   node scripts/export-conversations.mjs --campaign "Generic Campaign"
 *   node scripts/export-conversations.mjs --since 2026-05-01
 *   node scripts/export-conversations.mjs --events
 *   node scripts/export-conversations.mjs --redact
 *   node scripts/export-conversations.mjs --out-dir scripts/csv
 *
 * Flags:
 *   --workspace <uuid>  only this workspace (default: all workspaces)
 *   --campaign <ref>    only this campaign — a UUID, or a name to look up
 *                       ("Generic Campaign"). Ambiguous names list the matches.
 *   --since <date>      only conversations opened on/after this ISO date
 *   --events            include conversation_events (booking trace, AI decisions)
 *   --redact            mask lead PII (name → initials, phone/email → hashed)
 *   --include-deleted   include soft-deleted conversations (default: excluded)
 *   --out-dir <path>    output directory (default: scripts/csv)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = 1000; // Supabase caps a single select at 1000 rows — page past it.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Credentials: real env vars first, then repo .env ─────────────
function resolveSupabaseCreds() {
  const fromEnv = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  if (fromEnv.url && fromEnv.key) return { ...fromEnv, source: 'env' };

  const envPath = path.resolve(HERE, '..', '.env');
  if (fs.existsSync(envPath)) {
    const env = {};
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (!match || line.trimStart().startsWith('#')) continue;
      env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
    const url = fromEnv.url ?? env.SUPABASE_URL;
    const key = fromEnv.key ?? env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) return { url, key, source: '.env' };
  }
  return null;
}

// ── Arg parsing ──────────────────────────────────────────────────
function parseArgs(argv) {
  const opts = { events: false, redact: false, includeDeleted: false, outDir: 'scripts/csv' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--events') opts.events = true;
    else if (a === '--redact') opts.redact = true;
    else if (a === '--include-deleted') opts.includeDeleted = true;
    else if (a === '--workspace') opts.workspace = argv[++i];
    else if (a === '--campaign') opts.campaign = argv[++i];
    else if (a === '--since') opts.since = argv[++i];
    else if (a === '--out-dir') opts.outDir = argv[++i];
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return opts;
}

// Fetch every row of a query, paging past the 1000-row cap. `build` receives a
// fresh query each page so we can apply .range() without mutating shared state.
async function fetchAll(label, build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    process.stdout.write(`\r  ${label}: ${rows.length}`);
    if (data.length < PAGE) break;
  }
  process.stdout.write('\n');
  return rows;
}

const redactName = (first, last) =>
  `${(first || '').trim().charAt(0)}${(last || '').trim().charAt(0)}`.toUpperCase() || 'XX';
const redactValue = (v) =>
  v ? `sha256:${crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 12)}` : '';

// ── CSV helpers ──────────────────────────────────────────────────
function csvCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(values) {
  return values.map(csvCell).join(',');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const creds = resolveSupabaseCreds();
  if (!creds) {
    console.error(
      'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (checked env vars and the repo .env file).',
    );
    process.exit(1);
  }
  console.log(`Connecting with service role (creds from ${creds.source})…`);
  const db = createClient(creds.url, creds.key, { auth: { persistSession: false } });

  // Resolve --campaign to a UUID. Accepts a UUID directly, or a name we look up
  // (scoped to --workspace if given). An ambiguous name lists the matches and
  // exits so the caller can re-run with the exact id.
  let campaignId;
  if (opts.campaign) {
    if (UUID_RE.test(opts.campaign)) {
      campaignId = opts.campaign;
    } else {
      let lookup = db.from('campaigns').select('id, name, workspace_id').ilike('name', opts.campaign);
      if (opts.workspace) lookup = lookup.eq('workspace_id', opts.workspace);
      const { data: matches, error } = await lookup;
      if (error) throw new Error(`campaign lookup: ${error.message}`);
      if (!matches || matches.length === 0) {
        console.error(`No campaign named "${opts.campaign}"${opts.workspace ? ' in that workspace' : ''}.`);
        process.exit(1);
      }
      if (matches.length > 1) {
        console.error(
          `"${opts.campaign}" matches ${matches.length} campaigns — re-run with --campaign <uuid>:\n` +
            matches.map((m) => `  ${m.id}  (workspace ${m.workspace_id})`).join('\n'),
        );
        process.exit(1);
      }
      campaignId = matches[0].id;
      console.log(`Resolved campaign "${matches[0].name}" → ${campaignId}`);
    }
  }

  // 1) Conversations, with lead / campaign / agent names resolved via FK joins.
  console.log('Fetching conversations…');
  const conversations = await fetchAll('conversations', () => {
    let q = db
      .from('conversations')
      .select(
        `id, workspace_id, status, outcome, needs_human, human_controlled,
         opened_at, last_activity_at, closed_at, deleted_at,
         lead:leads(first_name, last_name, email, phone_e164, timezone, opted_out),
         campaign:campaigns(name),
         agent:agents(name)`,
      )
      .order('opened_at', { ascending: true });
    if (opts.workspace) q = q.eq('workspace_id', opts.workspace);
    if (campaignId) q = q.eq('campaign_id', campaignId);
    if (opts.since) q = q.gte('opened_at', new Date(opts.since).toISOString());
    if (!opts.includeDeleted) q = q.is('deleted_at', null);
    return q;
  });

  if (conversations.length === 0) {
    console.log('No conversations matched — nothing to export.');
    return;
  }
  const convIds = new Set(conversations.map((c) => c.id));

  // 2) Messages — fetched in pages and grouped in memory (the messages table has
  //    no workspace_id; it's conversation-scoped, so we group by conversation_id).
  console.log('Fetching messages…');
  const messagesByConv = new Map();
  const allMessages = await fetchAll('messages', () =>
    db
      .from('messages')
      .select('conversation_id, direction, sender_type, body_text, provider_status, created_at')
      .order('created_at', { ascending: true }),
  );
  for (const m of allMessages) {
    if (!convIds.has(m.conversation_id)) continue;
    if (!messagesByConv.has(m.conversation_id)) messagesByConv.set(m.conversation_id, []);
    messagesByConv.get(m.conversation_id).push(m);
  }

  // 3) Events (optional) — booking trace + AI decision flags per conversation.
  const eventsByConv = new Map();
  if (opts.events) {
    console.log('Fetching conversation events…');
    const allEvents = await fetchAll('events', () =>
      db
        .from('conversation_events')
        .select('conversation_id, event_type, event_payload_json, created_at')
        .order('created_at', { ascending: true }),
    );
    for (const e of allEvents) {
      if (!convIds.has(e.conversation_id)) continue;
      if (!eventsByConv.has(e.conversation_id)) eventsByConv.set(e.conversation_id, []);
      eventsByConv.get(e.conversation_id).push(e);
    }
  }

  // ── Build output rows ──────────────────────────────────────────
  const outDir = path.resolve(HERE, '..', opts.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const csvPath = path.join(outDir, `conversations-${ts}.csv`);
  const jsonlPath = path.join(outDir, `conversations-${ts}.jsonl`);

  const header = [
    'conversation_id', 'workspace_id', 'campaign', 'agent',
    'lead_name', 'lead_phone', 'lead_email', 'lead_timezone', 'lead_opted_out',
    'status', 'outcome', 'needs_human', 'human_controlled',
    'opened_at', 'last_activity_at', 'closed_at',
    'message_count', 'inbound_count', 'outbound_count',
    'first_message_at', 'last_message_at', 'transcript',
  ];

  const csvLines = [csvRow(header)];
  const jsonlLines = [];

  for (const c of conversations) {
    const msgs = messagesByConv.get(c.id) ?? [];
    const inbound = msgs.filter((m) => m.direction === 'inbound');
    const outbound = msgs.filter((m) => m.direction === 'outbound');
    const lead = c.lead ?? {};

    const leadName = opts.redact
      ? redactName(lead.first_name, lead.last_name)
      : `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim();
    const leadPhone = opts.redact ? redactValue(lead.phone_e164) : (lead.phone_e164 ?? '');
    const leadEmail = opts.redact ? redactValue(lead.email) : (lead.email ?? '');

    // Transcript: "Sender: text" lines, in order. Sender uses the message's role.
    const transcript = msgs
      .map((m) => `${m.sender_type === 'lead' ? 'LEAD' : m.sender_type.toUpperCase()}: ${m.body_text}`)
      .join('\n');

    csvLines.push(
      csvRow([
        c.id, c.workspace_id, c.campaign?.name ?? '', c.agent?.name ?? '',
        leadName, leadPhone, leadEmail, lead.timezone ?? '', lead.opted_out ?? '',
        c.status, c.outcome ?? '', c.needs_human, c.human_controlled,
        c.opened_at, c.last_activity_at, c.closed_at ?? '',
        msgs.length, inbound.length, outbound.length,
        msgs[0]?.created_at ?? '', msgs[msgs.length - 1]?.created_at ?? '',
        transcript,
      ]),
    );

    jsonlLines.push(
      JSON.stringify({
        conversation_id: c.id,
        workspace_id: c.workspace_id,
        campaign: c.campaign?.name ?? null,
        agent: c.agent?.name ?? null,
        lead: {
          name: leadName,
          phone: leadPhone,
          email: leadEmail,
          timezone: lead.timezone ?? null,
          opted_out: lead.opted_out ?? null,
        },
        status: c.status,
        outcome: c.outcome ?? null,
        needs_human: c.needs_human,
        human_controlled: c.human_controlled,
        opened_at: c.opened_at,
        last_activity_at: c.last_activity_at,
        closed_at: c.closed_at ?? null,
        message_count: msgs.length,
        inbound_count: inbound.length,
        outbound_count: outbound.length,
        messages: msgs.map((m) => ({
          direction: m.direction,
          sender: m.sender_type,
          text: m.body_text,
          status: m.provider_status ?? null,
          at: m.created_at,
        })),
        ...(opts.events ? { events: eventsByConv.get(c.id) ?? [] } : {}),
      }),
    );
  }

  fs.writeFileSync(csvPath, csvLines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(jsonlPath, jsonlLines.join('\n') + '\n', 'utf8');

  const totalMessages = [...messagesByConv.values()].reduce((n, a) => n + a.length, 0);
  console.log(
    `\nExported ${conversations.length} conversations (${totalMessages} messages)` +
      `${opts.redact ? ' [PII redacted]' : ''}:\n` +
      `  CSV:   ${path.relative(path.resolve(HERE, '..'), csvPath)}\n` +
      `  JSONL: ${path.relative(path.resolve(HERE, '..'), jsonlPath)}`,
  );
}

main().catch((err) => {
  console.error('\nExport failed:', err.message);
  process.exit(1);
});
