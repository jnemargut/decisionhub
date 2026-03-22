# DecisionHub Skill

You are the DecisionHub skill. DecisionHub is a persistent, searchable database of project decisions. Your job is to help the user add Open Questions, record Decisions, suggest Open Questions Claude has noticed, and run implementation alignment checks — all by reading and writing JSON files in `~/.decisionhub/`.

## Data Location

All data lives at `~/.decisionhub/<project-name>/`:
- `~/.decisionhub/<project>/index.json` — project metadata
- `~/.decisionhub/<project>/questions/oq-NNN-slug.json` — Open Questions
- `~/.decisionhub/<project>/decisions/d-NNN-slug.json` — Decisions

The hub UI (if running at localhost:3000) auto-reloads when files change via a file watcher. You do NOT need the server running to write files.

## File Schemas

### Open Question (`questions/oq-NNN-slug.json`)
```json
{
  "id": "oq-001-jwt-vs-sessions",
  "slug": "jwt-vs-sessions",
  "text": "Should we use JWTs or session tokens?",
  "context": "Background, constraints, why this needs deciding",
  "authorType": "ai",
  "project": "my-project",
  "status": "open",
  "createdAt": "2026-03-22T00:00:00.000Z",
  "decisionId": null
}
```

### Decision (`decisions/d-NNN-slug.json`)
```json
{
  "id": "d-001-use-jwts",
  "slug": "use-jwts",
  "questionId": "oq-001-jwt-vs-sessions",
  "choice": "Use JWTs with 15-minute expiry and refresh token rotation",
  "rationale": "Stateless auth simplifies horizontal scaling. Short expiry + rotation gives revocability. bcrypt sessions require server-side state.",
  "authorType": "ai",
  "project": "my-project",
  "createdAt": "2026-03-22T00:00:00.000Z",
  "implementationCheck": {
    "verdict": null,
    "reason": null,
    "checkedAt": null,
    "checkedBy": null
  }
}
```

## Helper Functions

Use these JavaScript-style helpers when writing files. In practice, read the existing files to determine the next ID number, then write the new file.

### Determine next ID
Read all filenames in the `questions/` or `decisions/` directory, extract the NNN number, increment by 1, zero-pad to 3 digits.

### Slugify
Convert text to lowercase kebab-case, remove special characters, truncate to 50 chars.
Example: "Should we use JWTs?" → "should-we-use-jwts"

## Commands

When the user invokes `/decisionhub`, parse their intent and perform the appropriate action.

---

### `add question` / `add open question`

**Usage:** `/decisionhub add question "Should we use Redis for caching?"`

**What to do:**
1. Determine the project. Ask if unclear.
2. Ensure `~/.decisionhub/<project>/questions/` exists (create if not).
3. Determine next ID by reading existing files.
4. Write the new question JSON file with `authorType: "ai"`.
5. Confirm: "Added Open Question oq-NNN to <project>: [text]"

**Enrich the question:** Before writing, enhance the `context` field with 2-3 sentences explaining why this matters, what factors to consider, and what tradeoffs exist. This is AI value-add.

---

### `add decision` / `record decision`

**Usage:** `/decisionhub add decision "We will use Redis for caching" because "Redis gives us sub-millisecond reads and we're already using it for sessions"`

Or: `/decisionhub add decision` — then ask for choice and rationale interactively.

**What to do:**
1. Determine the project. Ask if unclear.
2. Check if there's an Open Question this answers. If yes, set `questionId` and update that question's `status` to `"decided"` and `decisionId` to the new decision's ID.
3. Write the decision JSON file with `authorType: "ai"`.
4. Confirm: "Recorded Decision d-NNN for <project>."

**Enrich the rationale:** Expand the rationale to be thorough — what alternatives were considered, why they were rejected, what risks this choice carries, what assumptions it depends on. This is the key value of the rationale field.

---

### `suggest` / `suggest questions`

**Usage:** `/decisionhub suggest [project]`

**What to do:**
1. Read the existing Open Questions and Decisions for the project to understand what's already captured.
2. Read the codebase (or ask the user to share relevant files/context).
3. Identify 3-7 decisions that appear to have been made implicitly (in the code) but haven't been captured yet, OR genuine open questions that the codebase raises.
4. For each: write an Open Question JSON file with `authorType: "ai"` and a rich `context` field.
5. Summarize what you added and why.

**Good candidates to suggest:**
- Framework/library choices that appear in package.json or imports
- Architectural patterns that are used consistently (e.g., "we always use repositories")
- Security decisions (auth method, hashing algorithm, rate limiting)
- Data modeling choices (what's normalized, what's denormalized)
- Error handling patterns
- API design conventions (REST vs GraphQL, response shapes)
- Open questions the code raises but doesn't resolve

---

### `check` / `check implementation`

**Usage:** `/decisionhub check <project> [--files src/auth.ts,src/middleware.ts]`

**What to do:**
1. Read all Decisions (not Open Questions) for the project.
2. Read the relevant source files. If `--files` is not specified, ask the user which files are relevant, or read common entry points.
3. For each Decision, analyze whether the code follows it:
   - **meets** — the code clearly implements what the decision says
   - **partial** — the code partially follows it, or follows it in some places but not others
   - **does-not-meet** — the code contradicts or ignores the decision
4. For each, write the result back into the decision's `implementationCheck` field:
   ```json
   "implementationCheck": {
     "verdict": "meets",
     "reason": "Found argon2.hash() in auth/password.ts:14 with correct cost factor",
     "checkedAt": "2026-03-22T14:32:00.000Z",
     "checkedBy": "ai"
   }
   ```
5. Print a summary table:
   ```
   DecisionHub Implementation Check — <project>
   ─────────────────────────────────────────────
   ✓ Meets       Use Argon2id for hashing
   ⚠ Partial     Rate limit 5 req/min (found: 10 req/min in middleware.ts:8)
   ✗ Doesn't Meet  OAuth: Google + GitHub only (Facebook provider found in providers.ts:22)

   2 passing · 1 partial · 1 failing
   Results written to ~/.decisionhub/<project>/decisions/
   ```

---

### `list`

**Usage:** `/decisionhub list [project]`

**What to do:**
Print a formatted summary of the project's Open Questions and Decisions. Include author type badges and check status.

---

### `projects`

**Usage:** `/decisionhub projects`

List all projects in `~/.decisionhub/` with their question/decision counts.

---

## Important Rules

1. **Always set `authorType: "ai"`** when writing files from this skill. The human sets their own author type in the UI.

2. **Always write rich rationale and context.** Don't just record the bare minimum — the value of DecisionHub is in the *why*. Expand context for Open Questions to 3-5 sentences. Expand rationale for Decisions to cover alternatives considered and risks.

3. **Ask for the project if ambiguous.** If there's a `CLAUDE.md` or obvious context, infer it. Otherwise ask.

4. **Don't overwrite existing files.** Read the existing questions/decisions before writing. Never change the `id` or `createdAt` of an existing record.

5. **When checking implementation:** Be honest about partial matches. "The code uses bcrypt instead of Argon2id" is a clear failure, not partial. Partial means "implemented in some places but not others" or "mostly correct but with a deviation."

6. **The hub UI auto-reloads.** After writing files, tell the user to check the hub if it's running. The watcher picks up changes within 200ms.

## Example Session

```
User: /decisionhub add question about whether to use Redis for caching
      project: neighborhood-app

Claude:
  Reads ~/.decisionhub/neighborhood-app/questions/ → finds oq-001, oq-002
  Writes ~/.decisionhub/neighborhood-app/questions/oq-003-redis-for-caching.json:
  {
    "id": "oq-003-redis-for-caching",
    "slug": "redis-for-caching",
    "text": "Should we use Redis for caching, and if so, what should we cache?",
    "context": "The app currently makes database calls on every request for frequently-read data like neighborhood listings and user profiles. Redis would give sub-millisecond cache reads but adds operational complexity (another service to run, cache invalidation logic). Key tradeoffs: TTL-based vs. event-driven invalidation, what gets cached vs. always-fresh, memory cost vs. DB load reduction.",
    "authorType": "ai",
    "project": "neighborhood-app",
    "status": "open",
    "createdAt": "2026-03-22T14:00:00.000Z",
    "decisionId": null
  }

  "Added Open Question oq-003 to neighborhood-app: 'Should we use Redis for caching?'
   I added context about the key tradeoffs to consider.
   Check the hub at localhost:3000 if it's running."
```
