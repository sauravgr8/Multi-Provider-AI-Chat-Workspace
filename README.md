# Shastra

Shastra is a personal conversation workspace built with Next.js 15, React 19, TypeScript, Tailwind CSS, and Lucide. It runs as an offline demo by default, or uses a locally hosted Ollama model or AWS Bedrock when configured on the server. No credentials are included in this folder.

## Project at a glance

| Area | Current implementation |
| --- | --- |
| Interface | Responsive chat workspace with a sidebar, prompt starters, message composer, and mobile navigation |
| Conversations | Create, search by title, reopen, delete, copy replies, and export to Markdown |
| Data | Browser `localStorage` under `shastra.conversations.v1`; no server database |
| Responses | Offline examples by default; Ollama or Bedrock Converse when configured |
| Server | Next.js route handles model calls and keeps provider settings and AWS credentials server-side |
| Privacy | Offline messages remain in the browser; model-mode prompts go to the configured provider |

## What works today

- Start conversations from a prompt or the composer; search, revisit, delete, and export them as Markdown.
- Conversations are stored in this browser's `localStorage`. Clearing browser data or using another device will not preserve them.
- With no configuration, replies are **deterministic offline examples**, not AI responses. With a configured provider and access code, real replies come from Ollama or Bedrock.
- In model mode, the browser sends the last 30 messages in the current conversation to Shastra's server, which sends them to the selected model. No agent tools, user accounts, or server database are included.
- A single shared access code protects the model endpoint; it is not a replacement for user authentication or rate limiting on a public multi-user site.

### Walk through the app

1. Select a prompt starter or type a message. Enter sends the message; Shift+Enter adds a line break.
2. Shastra creates a conversation with a generated ID, titles it from the first message, and appends both the user message and a reply from the selected mode.
3. The sidebar lists recent conversations; search filters their titles. Open one to continue it, or use its options menu to export or delete it.
4. Refresh the page to check persistence. Saved conversations remain in the sidebar, while the welcome screen opens by default.

## Architecture

Shastra uses the Next.js App Router and a React client component for chat state. Offline replies stay in the browser. For a configured model, the browser sends conversation history to the `/api/chat` route, which validates the request, checks the access code, and invokes the server-selected provider. The browser never receives AWS credentials or the model host configuration.

```text
Browser UI (app/page.tsx)
	-> user submits text or selects a prompt starter
	-> send() uses demoReply() offline OR POSTs history to /api/chat in model mode
	-> the server invokes Ollama or AWS Bedrock and returns the model's text
	-> React updates the selected conversation and sidebar
	-> a guarded effect writes conversations to localStorage
	-> search, delete, copy, and export operate on local state
```

| File | Responsibility |
| --- | --- |
| `app/page.tsx` | Conversation/message types, local storage hydration, response selection, UI state, and chat actions |
| `app/globals.css` | Layout, responsive sidebar, chat styling, focus states, and reduced-motion support |
| `app/layout.tsx` | Root HTML layout, Geist font, and page metadata |
| `app/icon.tsx` | Generates the Shastra icon at build time |
| `app/api/chat/route.ts` | Model mode detection, access check, request validation, Ollama/Bedrock calls |
| `.env.example` | Blank, publishable provider settings template |
| `package.json` | Development, lint, build, and production-start commands |

**Data model:** a `Conversation` has an ID, a title, an update timestamp, and an ordered array of `Message` objects. Each message has an ID, a `user` or `assistant` role, and text content. New conversation IDs and message IDs come from `crypto.randomUUID()`. The first user message supplies the title (limited to 48 characters); recent updates move a conversation to the top of the list.

**Persistence boundary:** on mount, the client parses the saved array and checks its expected shape. A `ready` flag prevents the initial empty state from overwriting saved data before hydration finishes. Later changes are serialized to `localStorage`. Corrupt saved JSON is ignored so the workspace still opens. This is convenience storage, not encrypted storage or a synchronized database.

**Exports:** Markdown is assembled in the browser, placed in a `Blob`, and downloaded through a temporary object URL. Nothing is uploaded to create an export.

### Design decisions and limits

- Local-first state makes the demo usable immediately with no infrastructure, but data is tied to one browser and can be lost if site data is cleared.
- Offline replies make the interaction testable without model costs or credentials; they do not understand questions like a real AI model. Real requests may incur Bedrock costs or use local compute.
- React renders message text as text rather than injected HTML. Exported Markdown contains user-provided text, so treat downloaded files as untrusted input when processing them elsewhere.
- Search is a case-insensitive title filter over in-memory conversations. It does not search message bodies or scale like an indexed server-side search.
- The current prototype has no automated test suite. `pnpm lint` and `pnpm build` check the source; exercise the workflows above manually before publishing changes.

## Run locally

Install Node.js 20+ and pnpm 10+, then from this folder:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000. To use a different port, run `pnpm dev --port 3100`. To validate and run the production build:

```bash
pnpm lint
pnpm build
pnpm start
```

The offline app needs no `.env` file, API key, or database. Next.js may fetch its public Geist font when building; the app serves it locally afterward.

## Choose a model

`SHASTRA_PROVIDER` selects exactly one server-side mode: `offline` (default), `ollama`, or `bedrock`. The frontend shows the selected mode. In real-model modes enter the shared access code in the password field above the composer. It remains in this tab's memory only; reopening the page requires entering it again. A failed model call leaves your draft in place and displays an error instead of inserting an invented reply.

Copy `.env.example` to `.env.local` **on your own machine**, fill only the settings for your chosen provider, and restart the dev server. Do not upload `.env.local` or paste real credentials into `.env.example`. On a hosting platform, set the same values in its private environment/secret settings instead of creating a committed env file. The server will refuse model requests unless `SHASTRA_ACCESS_TOKEN` is set to a value you choose; use a long random string, not the sample or an empty value.

### Ollama on your machine

1. Install Ollama from https://ollama.com/download on the machine that will run the model. Start the Ollama app (or run `ollama serve` if it is not running already).
2. Download a model that fits your available RAM, for example `ollama pull llama3.2:3b`. Model downloads are large and may be subject to their own licenses.
3. Verify the local model with `ollama run llama3.2:3b "Say hello in one sentence"`.
4. In your untracked `.env.local`, set `SHASTRA_PROVIDER=ollama`, `SHASTRA_ACCESS_TOKEN` to your private access code, `SHASTRA_OLLAMA_URL=http://127.0.0.1:11434`, and `SHASTRA_OLLAMA_MODEL=llama3.2:3b`. Keep Ollama bound to localhost unless you have private networking and authentication in place.
5. Restart `pnpm dev`, enter the access code in the workspace, and send a message. The banner should say **OLLAMA**; Shastra calls Ollama's `/api/chat` with the conversation history.

To check Ollama independently of Shastra:

```bash
curl http://127.0.0.1:11434/api/chat -d '{"model":"llama3.2:3b","stream":false,"messages":[{"role":"user","content":"Hello"}]}'
```

On Windows PowerShell, use `curl.exe` for the command above (`curl` may alias to `Invoke-WebRequest`). The configured Ollama URL is read by the **server**, not each visitor's browser. For a remote deployment, localhost means the deployment machine, so the model must run there or be reachable over private networking.

### AWS Bedrock

1. Choose an AWS Region and enable access to a text model supporting Bedrock's **Converse API**. Copy its model ID from the Bedrock console; availability and pricing vary by Region and account.
2. Grant the server identity only the required `bedrock:InvokeModel` permission on the chosen model. Locally, use an AWS CLI profile or your normal SDK credential chain; on an AWS host, prefer an IAM role. **Do not put AWS keys in this repository or use `NEXT_PUBLIC_` for secrets.**
3. In your untracked `.env.local`, set `SHASTRA_PROVIDER=bedrock`, your private `SHASTRA_ACCESS_TOKEN`, `AWS_REGION`, and `SHASTRA_BEDROCK_MODEL_ID`. If using a named local CLI profile, set `AWS_PROFILE` in your shell or hosting environment.
4. Restart `pnpm dev`, enter the access code in the workspace, and send a message. The banner should say **AWS BEDROCK**. Shastra uses the AWS SDK credential provider chain and the Bedrock Converse API from the server; it does not embed access keys.

Provider errors return a generic message to the UI without revealing cloud credentials or internal model URLs. Check your server logs and provider setup for access/region/model issues. There is no automatic fallback to demo replies in a real-model mode.

## Agents: development and deployment

**Current status:** Shastra has prompt starters, not deployable agents. An Ollama model with a system prompt is not by itself a tool-using agent. The app has no agent registry, execution service, tool permissions, or agent deployment API. The following is an implementation checklist, not a command that works with the current code:

1. Define each agent's ID, description, system instructions, allowed tools, model, and ownership in a server-side registry. Do not put privileged instructions, tool credentials, or private endpoints in client code.
2. Build a server-side agent runner (for example, a Next.js route or a separate service) that accepts a conversation and agent ID, selects an allowed agent, calls the model, executes only allowlisted tools, and returns the result. Require explicit confirmation for actions that write or publish data.
3. Add authentication, per-user authorization, rate limits, execution timeouts, tool sandboxing, audit logs, and persistent storage if conversations must survive devices or browsers. Test denied tools and error cases before a public launch.
4. For local development, run Ollama on the server machine and point the runner at `http://127.0.0.1:11434`. Test one agent end-to-end with a non-sensitive read-only tool before adding more.
5. Deploy the agent runner on a host that can reach its model endpoint and permitted tools. Containerize that service if appropriate; supply credentials through the host's secret manager, never in source or `NEXT_PUBLIC_` variables. Restrict network access to the model, configure TLS and an authenticated frontend-to-runner API, and run health checks and tool-denial tests after deployment.
6. Wire an agent selector and result states into the UI only after the runner exists. A static deployment of this repository alone does **not** deploy agents.

## Deploy the current website

On a Node.js host, install Node.js 20+ and pnpm 10+, then run `pnpm install --frozen-lockfile`, `pnpm build`, and `pnpm start`. Configure your host to proxy HTTPS traffic to port 3000. Or import the source into a personal GitHub repository and connect that repository to a Next.js-compatible hosting provider; use `pnpm install --frozen-lockfile` and `pnpm build` as install/build commands. Leave `SHASTRA_PROVIDER` unset for a no-credential offline demo.

For Ollama mode, run Ollama on the same machine as the Next.js server or on a **private** reachable host; pull the model there, set the server-only URL and model name, and keep port 11434 off the public internet. Serverless providers may not have the GPU, persistent model storage, or networking needed for Ollama. For Bedrock mode, set the server's AWS Region and model ID and attach an IAM role with model access; do not add AWS keys to the repository. Both modes need `SHASTRA_ACCESS_TOKEN` in the host's secret settings. Browser `localStorage` is per visitor and is not a shared conversation database.

**Before public access:** the shared access code is basic protection for a personal deployment, not full user authentication. Add per-user auth, rate limiting, usage limits, and monitoring before making a paid Bedrock endpoint available to others. Expose the website through HTTPS. The configured model runs behind the Next.js server; deployment does not include model weights or deployable agents.

## Interview preparation

Use this section to explain the code that is in the repository. Keep model invocation distinct from the agent architecture proposed above.

**Short introduction:** "Shastra is a chat workspace I built with Next.js, React, and TypeScript. It has browser-persisted conversations, searchable history, Markdown export, and a responsive UI. It works offline by default, and a protected server route can call either a local Ollama model or AWS Bedrock without putting cloud credentials in browser code. Tool-using agents are not implemented yet."

**End-to-end explanation:** "A prompt starter or composer submission calls `send()`. Offline mode generates a labeled example locally. In model mode the client sends recent history with an in-memory access code to the Next.js route. That route checks the code and input, calls Ollama or Bedrock on the server, and returns the reply. Successful exchanges update React state and persist in `localStorage`; failures leave the draft available for retry."

**Questions worth rehearsing:**

| Question | Grounded answer |
| --- | --- |
| Why Next.js if the chat is client-side? | The UI owns browser state, while App Router provides the server route that calls models without exposing provider settings and AWS credentials to browser code. |
| Why `localStorage` instead of a database? | It avoids accounts and infrastructure for a single-browser prototype. It does not support synchronization, access control, or reliable long-term storage. |
| How do you avoid deleting saved chats on first render? | Persistence is gated by `ready`; the mount effect tries to hydrate and validate saved data before the write effect stores later state. |
| Is it an AI agent platform today? | No. It supports model chat through Ollama or Bedrock, but has no tool execution, agent registry, or agent deployment API. |
| How is a local model connected? | The Next.js route validates a request, calls a configured private Ollama endpoint, handles errors/timeouts, and returns the answer. Each visitor's browser never calls Ollama directly. |
| Where are AWS credentials? | The AWS SDK uses its standard server-side credential chain, such as a local AWS profile or deployed IAM role. No keys are checked into this project. |
| What changes before multi-user deployment? | Add identity, authorization, persistent server storage, request limits, safe tool permissions, observability, and a tested agent runtime. |
| What would you test next? | Storage recovery, chat creation/deletion, title search, export content, keyboard submission, and narrow/mobile layouts. |

**Live demo:** show a new conversation, search for its title, export it, reload to show persistence, and open it again from the sidebar. If a provider is configured, show its mode badge and a real reply after entering your access code. If asked about agents, walk through the planned runner rather than claiming one has been deployed.

## Before putting this folder on personal GitHub

- This folder is prepared as source only for direct upload; after running locally, remove generated `node_modules/`, `.next/`, and any `.env.local` before copy-pasting the entire folder again. `.gitignore` does not protect browser drag-and-drop uploads.
- Review every uploaded file for credentials and private endpoints. Run a secret scanner before making the repository public. An ignore rule cannot remove a secret already committed; revoke and rotate any exposed credential.
- Check the licenses of any future assets, model weights, and dependencies you add. Keep model access tokens and deployment credentials in a secret manager, not in browser code.
- This folder contains no initialized Git repository or remote. `.env.example` is intentionally blank where secrets would be required; no account credentials are required for offline mode.