# kong-sms

> Multi-agent orchestration framework for agentic coding

## Project Overview

A Claude Flow powered project

**Tech Stack**: TypeScript, Node.js
**Architecture**: Domain-Driven Design with bounded contexts

## Quick Start

### Installation
```bash
npm install
```

### Build
```bash
npm run build
```

### Test
```bash
npm test
```

### Development
```bash
npm run dev
```

## Agent Coordination

### Swarm Configuration

This project uses hierarchical swarm coordination for complex tasks:

| Setting | Value | Purpose |
|---------|-------|---------|
| Topology | `hierarchical` | Queen-led coordination (anti-drift) |
| Max Agents | 8 | Optimal team size |
| Strategy | `specialized` | Clear role boundaries |
| Consensus | `raft` | Leader-based consistency |

### When to Use Swarms

**Invoke swarm for:**
- Multi-file changes (3+ files)
- New feature implementation
- Cross-module refactoring
- API changes with tests
- Security-related changes
- Performance optimization

**Skip swarm for:**
- Single file edits
- Simple bug fixes (1-2 lines)
- Documentation updates
- Configuration changes

### Available Skills

Use `$skill-name` syntax to invoke:

| Skill | Use Case |
|-------|----------|
| `$swarm-orchestration` | Multi-agent task coordination |
| `$memory-management` | Pattern storage and retrieval |
| `$sparc-methodology` | Structured development workflow |
| `$security-audit` | Security scanning and CVE detection |

### Agent Types

| Type | Role | Use Case |
|------|------|----------|
| `researcher` | Requirements analysis | Understanding scope |
| `architect` | System design | Planning structure |
| `coder` | Implementation | Writing code |
| `tester` | Test creation | Quality assurance |
| `reviewer` | Code review | Security and quality |

## Code Standards

### File Organization
- **NEVER** save to root folder
- `/src` - Source code files
- `/tests` - Test files
- `/docs` - Documentation
- `/config` - Configuration files

### Quality Rules
- Files under 500 lines
- No hardcoded secrets
- Input validation at boundaries
- Typed interfaces for public APIs
- TDD London School (mock-first) preferred

### Commit Messages
```
<type>(<scope>): <description>

[optional body]

Co-Authored-By: claude-flow <ruv@ruv.net>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

## Security

### Critical Rules
- NEVER commit secrets, credentials, or .env files
- NEVER hardcode API keys
- Always validate user input
- Use parameterized queries for SQL
- Sanitize output to prevent XSS

### Path Security
- Validate all file paths
- Prevent directory traversal (../)
- Use absolute paths internally

## Memory System

### Storing Patterns
```bash
npx @claude-flow/cli memory store \
  --key "pattern-name" \
  --value "pattern description" \
  --namespace patterns
```

### Searching Memory
```bash
npx @claude-flow/cli memory search \
  --query "search terms" \
  --namespace patterns
```

## Links

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