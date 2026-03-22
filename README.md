# DecisionHub

A persistent, searchable database of project decisions — tagged by whether they were made by a human or an AI tool, editable in a browser UI, and queryable by any AI coding assistant.

![DecisionHub UI showing Open Questions and Decisions with AI/Human badges](https://github.com/jnemargut/decisionhub/raw/main/docs/screenshot.png)

## Why

When you build with AI coding tools, decisions get made fast — and forgotten just as fast. Three weeks later, you're staring at code wondering "why did we do it this way?" or watching your AI assistant confidently undo an architectural choice you already made.

DecisionHub is the missing log. It captures:
- **Open Questions** — things that still need a decision ("Should we use Redis for caching?")
- **Decisions** — what was decided and, critically, *why* ("We chose Redis because session data needs sub-millisecond reads and it's already in our stack")
- **Who decided** — was it a human judgment call or did the AI flag it?
- **Did the code follow through?** — run an alignment check to see which decisions your implementation actually follows

It's implementation-agnostic. Use it before you write a line of code, while you're building, or to audit an existing codebase. It doesn't know about your code unless you tell it to look.

## How it works

Data is plain JSON files in `~/.decisionhub/<project>/`. A local Node.js server serves the browser UI and watches for file changes — so when your AI tool writes a new decision file, the hub reloads automatically.

```
~/.decisionhub/
  my-auth-service/
    index.json                              ← project metadata
    questions/
      oq-001-jwt-vs-sessions.json          ← an Open Question
      oq-002-password-reset-flow.json
    decisions/
      d-001-use-jwts.json                  ← a Decision (linked to oq-001)
      d-002-argon2-for-hashing.json
```

Because it's just JSON files, **any AI coding tool can read and write decisions** — Claude Code, Cursor, Copilot, Aider, or a shell script. No API keys, no accounts, no cloud.

## Quick start

```bash
git clone https://github.com/jnemargut/decisionhub.git
cd decisionhub
npm install
node bin/decisionhub.js --port 3100
# Opens http://localhost:3100 in your browser
```

Or install globally:
```bash
npm install -g .
decisionhub --port 3100
```

## Features

- **Add decisions in the browser** — click "+ Open Question", fill in the context, hit save
- **AI/Human tagging** — every Open Question and Decision shows who raised it
- **Full-text search with snippets** — searches inside the rationale text, not just titles; shows highlighted context around the match
- **Live reload** — the hub updates within 200ms when your AI tool writes a file
- **Implementation alignment checks** — run a check to see which decisions your codebase actually follows, records verdict + reason + date per decision
- **Inline editing** — expand any card to edit text or rationale directly in the hub

## File format

The JSON schema is intentionally simple. Any AI tool can generate valid files.

### Open Question
```json
{
  "id": "oq-001-jwt-vs-sessions",
  "slug": "jwt-vs-sessions",
  "text": "Should we use JWTs or session tokens for auth?",
  "context": "Sessions require server-side state which complicates horizontal scaling. JWTs are stateless but harder to revoke. We need to decide before building the auth middleware.",
  "authorType": "human",
  "project": "my-auth-service",
  "status": "open",
  "createdAt": "2026-03-22T00:00:00.000Z",
  "decisionId": null
}
```

### Decision
```json
{
  "id": "d-001-use-jwts",
  "slug": "use-jwts",
  "questionId": "oq-001-jwt-vs-sessions",
  "choice": "Use JWTs with 15-minute expiry and refresh token rotation",
  "rationale": "Stateless auth is worth the tradeoff for our horizontally-scaled setup. Short expiry (15min) + refresh token rotation gives us revocability without server-side session state. Rejected bcrypt sessions because they'd require sticky sessions or a shared session store.",
  "authorType": "ai",
  "project": "my-auth-service",
  "createdAt": "2026-03-22T00:00:00.000Z",
  "implementationCheck": {
    "verdict": "meets",
    "reason": "Found JWT generation in auth/token.ts:24 with 15min expiry. Refresh rotation implemented in auth/refresh.ts.",
    "checkedAt": "2026-03-22T14:32:00.000Z",
    "checkedBy": "ai"
  }
}
```

## Using with AI coding tools

### Claude Code (via skill)

If you use Claude Code, a `/decisionhub` skill is included in the `skill/` directory.

Copy it to your skills folder:
```bash
cp -r skill/decisionhub ~/.claude/skills/decisionhub
```

Then use it from any Claude Code conversation:
```
/decisionhub add question "Should we use Redis for session caching?"
              project: my-auth-service

/decisionhub suggest          ← Claude reads your code and suggests decisions you haven't captured

/decisionhub check my-auth-service src/auth.ts src/middleware.ts
              ← checks which decisions your code actually follows
```

### Cursor, Copilot, Aider, or any other AI tool

Point your AI at the file schema above and ask it to write files directly into `~/.decisionhub/<project>/questions/` or `decisions/`. The server watches for changes and reloads the UI automatically.

**Example prompt for any AI:**
> Read the DecisionHub schema at `~/.decisionhub/` and create a new Open Question JSON file in `~/.decisionhub/my-project/questions/` for the question: "Should we use a monorepo or separate repos?" Include context about the tradeoffs. Set `authorType` to `"ai"`, `status` to `"open"`, and generate the next sequential ID.

### Shell / CI

Use `curl` against the local server API:
```bash
# Add an open question
curl -X POST http://localhost:3100/api/projects/my-project/questions \
  -H "Content-Type: application/json" \
  -d '{"text":"Should we add a CDN?","authorType":"human"}'

# Record a decision
curl -X POST http://localhost:3100/api/projects/my-project/decisions \
  -H "Content-Type: application/json" \
  -d '{"choice":"Use Cloudflare CDN","rationale":"Already on Cloudflare for DNS, minimal additional config","authorType":"human"}'

# Search
curl "http://localhost:3100/api/search?q=performance&project=my-project"
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/projects` | List all projects |
| `GET` | `/api/projects/:name` | Get project with all questions and decisions |
| `POST` | `/api/projects` | Create a project |
| `POST` | `/api/projects/:name/questions` | Add an Open Question |
| `PATCH` | `/api/projects/:name/questions/:id` | Edit a question |
| `POST` | `/api/projects/:name/decisions` | Record a Decision |
| `PATCH` | `/api/projects/:name/decisions/:id` | Edit a decision |
| `PATCH` | `/api/projects/:name/decisions/:id/check` | Record an implementation check |
| `GET` | `/api/search?q=&project=&authorType=&status=` | Full-text search with snippets |
| `GET` | `/api/events` | SSE stream for live UI updates |

## The implementation check

Running a check produces a verdict per decision:

| Verdict | Meaning |
|---------|---------|
| `meets` | The code clearly follows the decision |
| `partial` | Partially implemented, or implemented in some places but not others |
| `does-not-meet` | The code contradicts or ignores the decision |

Results are written back into the decision's `implementationCheck` field with a timestamp. The hub shows the last check status inline on every decision card.

## Philosophy

- **Plain files, no lock-in.** JSON files in your home directory. Copy them, git-commit them, share them.
- **AI-tool agnostic.** Any AI that can write a file can participate.
- **Rationale is the point.** A decision without a *why* is just trivia. The schema requires rationale.
- **Implementation-agnostic.** DecisionHub doesn't know about your code unless you tell it to check. Use it before building, while building, or to audit what already exists.

## License

MIT
