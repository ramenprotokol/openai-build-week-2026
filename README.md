# CONTROL ROOM

> A hands-on delegation drill for learning how to direct AI agents with clear
> boundaries, evidence, and independent verification.

CONTROL ROOM is Ramen Protocol's public OpenAI Build Week 2026 entry. In one short
scenario, the learner directs Scout, Builder, and Verifier through a software
incident. The learner owns every consequential decision: what each agent may do,
what proof must come back, when conflicting evidence blocks a change, and when the
work is ready to verify.

## Current build

The repository contains the complete full-stack vertical slice of the core
experience:

1. Write a four-part directive for a read-only Scout.
2. Review file, test, and log evidence before authorizing a handoff.
3. Stop Builder when evidence from two regions conflicts.
4. Resolve the discrepancy and request an independent verification pass.
5. Review an evidence-linked debrief with one strong decision, one correction, and
   a stronger before/after directive.

Every agent turn now travels through the same typed Cloudflare Worker endpoint. The
Worker can run GPT-5.6 Sol through the Responses API or return the verified
deterministic fallback. Fallback mode is the default, so local development, tests,
and the complete demo path make no paid API calls. The interface labels the active
mode and never generates an opaque score.

A separate Pages build turns the same fallback into a fully static replay. It makes
no API request, needs no hosted key, and preserves the complete judged path. This
gives the public demo a reliable zero-cost mode while the Worker remains available
for live GPT-5.6 validation.

## Run locally

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

Vite prints the local URL after startup. The Cloudflare Vite plugin runs both the
React client and Worker API in the same local process.

To produce the zero-cost static Pages artifact:

```bash
npm run build:pages
```

The deployable files are written to `dist/client`. They include Cloudflare Pages
security headers and a build-time replay flag, so the browser never calls a missing
API route.

### Optional live GPT-5.6 mode

Live mode is deliberately disabled in `wrangler.jsonc`. To test it after approving
API spending, create an ignored `.dev.vars` file:

```dotenv
OPENAI_API_KEY=<server-side-key>
LIVE_AI_ENABLED=true
OPENAI_MODEL=gpt-5.6-sol
```

Never place the API key in a `VITE_` variable or browser code. Published model
pricing can change; verify the current [GPT-5.6 Sol model page](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
before enabling live mode.

## Quality checks

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run build:pages
```

The tests cover the reducer, request and response contracts, role permissions,
cross-origin rejection, invalid payloads, prompt-injection handling, static-host
replay behavior, and the complete ordered scenario. Builder cannot proceed through
conflicting evidence, and the drill cannot end before independent verification and
coaching succeed.

## Product and design decisions

- **Learning by directing:** the main interaction is writing and authorizing
  directives, not watching an agent chat with itself.
- **Visible authority:** Scout is read-only, Builder has isolated write access, and
  Verifier is independently read-only.
- **Evidence before action:** each handoff is tied to concrete proof.
- **Human-owned gates:** the system pauses for the learner at the conflict and
  verification decisions.
- **Legible under pressure:** keyboard focus, a skip link, live status updates,
  self-hosted type, a reduced-motion control, and responsive layouts are built in.
- **Purposeful visual language:** a dark operations console, paper directives,
  brass hardware, and signal colors replace generic chat bubbles and glass cards.

## Architecture

- React 19 and TypeScript
- Vite with the Cloudflare Workers Vite plugin
- One `POST /api/turn` route for Scout, Builder, Verifier, and Coach
- OpenAI Responses API with `gpt-5.6-sol`, low reasoning effort, bounded tool loops,
  and structured outputs
- Zod validation at the browser and Worker boundaries
- A deterministic fallback implementing the same response contract
- A state reducer that keeps every consequential transition learner-owned
- CSS and inline SVG for the interface and motion system
- Vitest for scenario, API, permission, and security behavior

The model can cite only evidence IDs returned by role-permitted tools. The Worker
materializes those IDs from an allowlisted scenario pack, so invented citations do
not reach the interface. Scout cannot call Builder tools, Builder cannot call
Verifier tools, and GPT-5.6 cannot authorize its own handoff.

## Runtime safety

- The OpenAI key is server-only.
- Live mode requires both a key and an explicit server-side enable flag.
- Requests are same-origin, JSON-only, and limited to 12 KB.
- All strings, arrays, enums, and model outputs have bounded schemas.
- Tool permissions and evidence allowlists are enforced in code.
- Model and learner text are marked as untrusted data in the role prompt.
- Each live request has a 20-second timeout and silently degrades to a labeled
  fallback result.
- Responses are sent with `Cache-Control: no-store`.
- The static Pages build ships a restrictive CSP, clickjacking protection, a strict
  referrer policy, and disabled camera, microphone, and geolocation access.

Before a public live deployment, add a Cloudflare rate-limiting rule and set an
OpenAI project budget. Those external controls are intentionally not created by
this local build.

## Build Week constraints

- Submission deadline: July 21, 2026 at 5:00 PM Pacific Time.
- The final entry must be built with Codex and meaningfully use GPT-5.6.
- The public submission needs a working test path, clear documentation, a public
  repository, and a demo video no longer than three minutes.
- The demo must explain the product, the Codex workflow, and the GPT-5.6
  integration.

No ChatGPT plugin, database, remote, paid model usage, or deployment is required to
run the current local slice.

## Links

- [Live demo](https://control-room-build-week-2026.pages.dev/)
- [Public repository](https://github.com/ramenprotokol/openai-build-week-2026)
- [Challenge overview](https://openai.devpost.com/)
- [Official rules](https://openai.devpost.com/rules)

## License

MIT — see [LICENSE](./LICENSE).
