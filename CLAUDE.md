# Claude Code Configuration - RuFlo V3

## Behavioral Rules (Always Enforced)

- Do what has been asked; nothing more, nothing less
- NEVER create files unless they're absolutely necessary for achieving your goal
- ALWAYS prefer editing an existing file to creating a new one
- NEVER proactively create documentation files (*.md) or README files unless explicitly requested
- NEVER save working files, text/mds, or tests to the root folder
- Never continuously check status after spawning a swarm — wait for results
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files

## File Organization

- NEVER save to root folder — use the directories below
- Use `/src` for source code files
- Use `/tests` for test files
- Use `/docs` for documentation and markdown files
- Use `/config` for configuration files
- Use `/scripts` for utility scripts
- Use `/examples` for example code

## Project Architecture

- Follow Domain-Driven Design with bounded contexts
- Keep files under 500 lines
- Use typed interfaces for all public APIs
- Prefer TDD London School (mock-first) for new code
- Use event sourcing for state changes
- Ensure input validation at system boundaries

### Project Config

- **Topology**: hierarchical-mesh
- **Max Agents**: 15
- **Memory**: hybrid
- **HNSW**: Enabled
- **Neural**: Enabled

## Build & Test

```bash
# Build
npm run build

# Test
npm test

# Lint
npm run lint
```

- ALWAYS run tests after making code changes
- ALWAYS verify build succeeds before committing

## Security Rules

- NEVER hardcode API keys, secrets, or credentials in source files
- NEVER commit .env files or any file containing secrets
- Always validate user input at system boundaries
- Always sanitize file paths to prevent directory traversal
- Run `npx @claude-flow/cli@latest security scan` after security-related changes

## Concurrency: 1 MESSAGE = ALL RELATED OPERATIONS

- All operations MUST be concurrent/parallel in a single message
- Use Claude Code's Task tool for spawning agents, not just MCP
- ALWAYS batch ALL todos in ONE TodoWrite call (5-10+ minimum)
- ALWAYS spawn ALL agents in ONE message with full instructions via Task tool
- ALWAYS batch ALL file reads/writes/edits in ONE message
- ALWAYS batch ALL Bash commands in ONE message

## Swarm Orchestration

- MUST initialize the swarm using CLI tools when starting complex tasks
- MUST spawn concurrent agents using Claude Code's Task tool
- Never use CLI tools alone for execution — Task tool agents do the actual work
- MUST call CLI tools AND Task tool in ONE message for complex work

### 3-Tier Model Routing (ADR-026)

| Tier | Handler | Latency | Cost | Use Cases |
|------|---------|---------|------|-----------|
| **1** | Agent Booster (WASM) | <1ms | $0 | Simple transforms (var→const, add types) — Skip LLM |
| **2** | Haiku | ~500ms | $0.0002 | Simple tasks, low complexity (<30%) |
| **3** | Sonnet/Opus | 2-5s | $0.003-0.015 | Complex reasoning, architecture, security (>30%) |

- Always check for `[AGENT_BOOSTER_AVAILABLE]` or `[TASK_MODEL_RECOMMENDATION]` before spawning agents
- Use Edit tool directly when `[AGENT_BOOSTER_AVAILABLE]`

## Swarm Configuration & Anti-Drift

- ALWAYS use hierarchical topology for coding swarms
- Keep maxAgents at 6-8 for tight coordination
- Use specialized strategy for clear role boundaries
- Use `raft` consensus for hive-mind (leader maintains authoritative state)
- Run frequent checkpoints via `post-task` hooks
- Keep shared memory namespace for all agents

```bash
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized
```

## Swarm Execution Rules

- ALWAYS use `run_in_background: true` for all agent Task calls
- ALWAYS put ALL agent Task calls in ONE message for parallel execution
- After spawning, STOP — do NOT add more tool calls or check status
- Never poll TaskOutput or check swarm status — trust agents to return
- When agent results arrive, review ALL results before proceeding

## V3 CLI Commands

### Core Commands

| Command | Subcommands | Description |
|---------|-------------|-------------|
| `init` | 4 | Project initialization |
| `agent` | 8 | Agent lifecycle management |
| `swarm` | 6 | Multi-agent swarm coordination |
| `memory` | 11 | AgentDB memory with HNSW search |
| `task` | 6 | Task creation and lifecycle |
| `session` | 7 | Session state management |
| `hooks` | 17 | Self-learning hooks + 12 workers |
| `hive-mind` | 6 | Byzantine fault-tolerant consensus |

### Quick CLI Examples

```bash
npx @claude-flow/cli@latest init --wizard
npx @claude-flow/cli@latest agent spawn -t coder --name my-coder
npx @claude-flow/cli@latest swarm init --v3-mode
npx @claude-flow/cli@latest memory search --query "authentication patterns"
npx @claude-flow/cli@latest doctor --fix
```

## Available Agents (60+ Types)

### Core Development
`coder`, `reviewer`, `tester`, `planner`, `researcher`

### Specialized
`security-architect`, `security-auditor`, `memory-specialist`, `performance-engineer`

### Swarm Coordination
`hierarchical-coordinator`, `mesh-coordinator`, `adaptive-coordinator`

### GitHub & Repository
`pr-manager`, `code-review-swarm`, `issue-tracker`, `release-manager`

### SPARC Methodology
`sparc-coord`, `sparc-coder`, `specification`, `pseudocode`, `architecture`

## Memory Commands Reference

```bash
# Store (REQUIRED: --key, --value; OPTIONAL: --namespace, --ttl, --tags)
npx @claude-flow/cli@latest memory store --key "pattern-auth" --value "JWT with refresh" --namespace patterns

# Search (REQUIRED: --query; OPTIONAL: --namespace, --limit, --threshold)
npx @claude-flow/cli@latest memory search --query "authentication patterns"

# List (OPTIONAL: --namespace, --limit)
npx @claude-flow/cli@latest memory list --namespace patterns --limit 10

# Retrieve (REQUIRED: --key; OPTIONAL: --namespace)
npx @claude-flow/cli@latest memory retrieve --key "pattern-auth" --namespace patterns
```

## Quick Setup

```bash
claude mcp add claude-flow -- npx -y @claude-flow/cli@latest
npx @claude-flow/cli@latest daemon start
npx @claude-flow/cli@latest doctor --fix
```

## Claude Code vs CLI Tools

- Claude Code's Task tool handles ALL execution: agents, file ops, code generation, git
- CLI tools handle coordination via Bash: swarm init, memory, hooks, routing
- NEVER use CLI tools as a substitute for Task tool agents

## Support

- Documentation: https://github.com/ruvnet/claude-flow
- Issues: https://github.com/ruvnet/claude-flow/issues



## Project Summary

This is a multi-workspace SMS chatbot platform designed for agencies managing multiple client accounts.

The system enables:
- AI-driven SMS conversations
- Lead qualification
- Calendar booking (Calendly)
- CRM syncing (Keap/Infusionsoft initially)
- Campaign-level A/B testing using multiple AI agents

Each workspace represents a business or client account.

---

## Core Domains (DDD)

### 1. Workspace
- Represents a business entity
- Contains users, campaigns, integrations
- Must be strictly isolated

### 2. Campaign
- Defines chatbot behaviour
- Contains:
  - AI prompt
  - assigned agents (for split testing)
  - success criteria (booking, lead, etc.)

### 3. Agent
- AI configuration for a campaign
- Includes:
  - system prompt
  - behaviour rules
  - temperature/model settings
- Multiple agents can be assigned to one campaign

### 4. Conversation
- Represents an SMS thread with a lead
- Stores:
  - messages
  - state (active, qualified, booked, lost)
  - assigned agent
- Can be manually overridden by a user

### 5. Integration
- External services connected per workspace:
  - Twilio (SMS)
  - Calendly (booking)
  - CRM (Keap initially)
- Must support per-workspace credentials

---

## System Flow

1. Incoming SMS via Twilio
2. Match phone number → workspace + campaign
3. Assign agent (A/B testing logic)
4. Generate AI response using prompt + context
5. Update conversation state
6. If criteria met:
   - trigger booking OR
   - push lead to CRM
7. Store all events for analytics

---

## Source of Truth

- PRD and AI Build Spec: docs/prd_and_ai_build_spec.md
- Roadmap and Agents: docs/roadmap_and_agents.md
- API Contracts: docs/api-contracts.md
- Integration Adapters: docs/integration-adapters.md
- Database Schema: docs/database-schema.md
- PRD: docs/prd.md

---

## Tech Stack

- Astro (frontend + serverless routes)
- Supabase (database + auth)
- Twilio (SMS)
- Calendly (booking)
- OpenAI / Anthropic (AI engine)

---

## Architecture Rules

- Follow Domain-Driven Design with strict bounded contexts
- All queries MUST be scoped to workspace_id
- Use event-driven architecture for conversation updates
- All integrations must be abstracted behind adapters
- Prefer serverless functions for all external webhooks

---

## Data Rules

- Do not change DB schema without updating docs/database-schema.md
- All entities must include:
  - id (UUID)
  - workspace_id
  - created_at / updated_at
- Conversations must be append-only (event sourcing preferred)

---

## AI Behaviour Rules

- AI must operate within campaign-defined prompts
- AI must NOT hallucinate actions (e.g. bookings) without confirmation
- AI must follow qualification logic before booking
- Responses should be short, SMS-friendly, human-like

---

## Security Rules

- Never expose API keys client-side
- All integrations must use secure credential storage
- Enforce workspace isolation at database and API level
- Validate all webhook inputs

---

## Development Rules

- Use `/src` for code
- Use `/docs` for documentation
- Use `/tests` for tests
- Keep files under 500 lines
- Use typed interfaces for APIs

---

## Build & Test

```bash
npm run build
npm test
npm run lint