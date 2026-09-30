"use client";

import { ArrowDownToLine, ArrowUp, BookOpen, Check, ChevronDown, CircleHelp, Compass, Copy, Menu, MessageSquareText, MoreHorizontal, PanelLeftClose, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Message = { id: string; role: "user" | "assistant"; content: string };
type Conversation = { id: string; title: string; messages: Message[]; updatedAt: number };
type Provider = "loading" | "offline" | "ollama" | "bedrock" | "unavailable";
const storageKey = "shastra.conversations.v1";
const suggestions = [
  { icon: Compass, label: "Explore an idea", prompt: "Help me explore an idea for a weekend project" },
  { icon: BookOpen, label: "Make a plan", prompt: "Help me make a simple plan to learn something new" },
  { icon: Sparkles, label: "Find clarity", prompt: "Help me break down a difficult decision" },
];

function demoReply(input: string) {
  const topic = input.trim().replace(/[.!?]+$/, "");
  if (/plan|learn|study/i.test(topic)) return `Here's a starting plan for "${topic}":\n\n1. Define what a good outcome looks like in one sentence.\n2. Pick one small action you can finish today.\n3. Set aside a short, repeatable block of time.\n4. Review what worked and adjust your next step.\n\nThis is an offline demo response. Connect your own AI provider to generate tailored answers.`;
  if (/idea|project|build/i.test(topic)) return `Let's shape "${topic}" into something you can try.\n\nStart with the person it's for and the problem they have. Build the smallest version that solves just that problem, then ask someone to use it. Their feedback will tell you what to make next.\n\nThis is an offline demo response; no message was sent to an AI service.`;
  return `A useful way to approach "${topic}" is to write down what you know, what you're unsure about, and the next small question worth answering. What outcome matters most to you?\n\nThis is an offline demo response. Shastra does not send your messages to a server.`;
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>("loading");
  const [accessCode, setAccessCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((item): item is Conversation =>
            typeof item === "object" && item !== null && typeof item.id === "string" &&
            typeof item.title === "string" && Array.isArray(item.messages) &&
            item.messages.every((message: Message) => typeof message?.id === "string" &&
              typeof message.content === "string" && (message.role === "user" || message.role === "assistant")) &&
            typeof item.updatedAt === "number");
          setConversations(valid);
        }
      }
    } catch {
      // Invalid local data should not prevent the workspace from opening.
    }
    setReady(true);
  }, []);

  useEffect(() => { if (ready) localStorage.setItem(storageKey, JSON.stringify(conversations)); }, [conversations, ready]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [conversations, activeId]);
  useEffect(() => {
    fetch("/api/chat", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((result: { provider?: Provider }) => setProvider(
        result.provider === "offline" || result.provider === "ollama" || result.provider === "bedrock" ? result.provider : "unavailable"))
      .catch(() => setProvider("unavailable"));
  }, []);

  const active = conversations.find((conversation) => conversation.id === activeId);
  const filtered = conversations.filter((conversation) => conversation.title.toLowerCase().includes(query.toLowerCase()));

  function newChat() {
    setActiveId(null);
    setDraft("");
    setSidebarOpen(false);
    inputRef.current?.focus();
  }

  async function send(value = draft) {
    const text = value.trim();
    if (!text || busy || provider === "loading" || provider === "unavailable") return;
    const id = activeId ?? crypto.randomUUID();
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: text };
    let content = demoReply(text);
    if (provider !== "offline") {
      const code = accessCode.trim();
      if (!code) {
        setError("Enter the model access code before sending a message.");
        return;
      }
      setBusy(true);
      setError("");
      try {
        const result = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${code}` },
          body: JSON.stringify({ messages: [...(active?.messages ?? []), userMessage].slice(-30).map(({ role, content: messageContent }) => ({ role, content: messageContent })) }),
          signal: AbortSignal.timeout(65000),
        });
        const data: { content?: string; error?: string } = await result.json();
        if (!result.ok || !data.content) {
          if (result.status === 401) setAccessCode("");
          setError(data.error || "The model did not return a reply.");
          return;
        }
        setAccessCode(code);
        content = data.content;
      } catch {
        setError("Unable to reach the model. Check your connection and try again.");
        return;
      } finally {
        setBusy(false);
      }
    }
    const response: Message = { id: crypto.randomUUID(), role: "assistant", content };
    setConversations((current) => {
      const existing = current.find((conversation) => conversation.id === id);
      const updated: Conversation = { id, title: existing?.title ?? text.slice(0, 48), messages: [...(existing?.messages ?? []), userMessage, response], updatedAt: Date.now() };
      return [updated, ...current.filter((conversation) => conversation.id !== id)];
    });
    setActiveId(id);
    setDraft("");
    setError("");
    setSidebarOpen(false);
  }

  function deleteChat(id: string) {
    setConversations((current) => current.filter((conversation) => conversation.id !== id));
    if (activeId === id) setActiveId(null);
    setMenuOpen(null);
  }

  function exportChat(conversation: Conversation) {
    const text = conversation.messages.map((message) => `${message.role === "user" ? "You" : "Shastra"}\n${message.content}`).join("\n\n---\n\n");
    const url = URL.createObjectURL(new Blob([`# ${conversation.title}\n\n${text}\n`], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `shastra-${conversation.id}.md`;
    link.click();
    URL.revokeObjectURL(url);
    setMenuOpen(null);
  }

  async function copyMessage(message: Message) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch { setCopiedId(null); }
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); send(); }

  return (
    <div className="workspace">
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top"><div className="brand"><div className="brand-mark" aria-hidden="true">✳</div><span>shastra<span className="brand-dot">.</span></span></div><button className="icon-button sidebar-close" title="Close sidebar" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)}><PanelLeftClose size={19} /></button></div>
        <button className="new-chat" onClick={newChat}><Plus size={18} strokeWidth={2} /> New conversation <span>↗</span></button>
        <label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" /></label>
        <div className="sidebar-section-label">YOUR SPACE <span>{conversations.length.toString().padStart(2, "0")}</span></div>
        <nav className="conversation-list" aria-label="Conversations">
          {filtered.length === 0 && <p className="empty-list">{query ? "No matching conversations" : "Your conversations will appear here."}</p>}
          {filtered.map((conversation) => <div className={`conversation-item ${activeId === conversation.id ? "selected" : ""}`} key={conversation.id}><button className="conversation-select" onClick={() => { setActiveId(conversation.id); setSidebarOpen(false); }}><MessageSquareText size={16} /><span>{conversation.title}</span></button><button className="icon-button conversation-more" title="Conversation options" aria-label={`Options for ${conversation.title}`} onClick={() => setMenuOpen(menuOpen === conversation.id ? null : conversation.id)}><MoreHorizontal size={17} /></button>{menuOpen === conversation.id && <div className="conversation-menu"><button onClick={() => exportChat(conversation)}><ArrowDownToLine size={15} /> Export Markdown</button><button className="danger" onClick={() => deleteChat(conversation.id)}><Trash2 size={15} /> Delete</button></div>}</div>)}
        </nav>
        <div className="sidebar-bottom"><div className="local-indicator"><span className="status-dot" /> {provider === "offline" ? "BROWSER WORKSPACE" : "MODEL WORKSPACE"}</div><p>{provider === "offline" ? "Your conversations stay in this browser." : "Chats are saved here; prompts go to your model."}</p><div className="sidebar-footer"><span className="footer-emblem">✳</span><span>Shastra <small>Personal edition</small></span><ChevronDown size={16} /></div></div>
      </aside>
      <main className="main-panel">
        <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" title="Open sidebar" aria-label="Open sidebar" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button><span className="breadcrumb">Workspace</span><span className="breadcrumb-divider">/</span><span className="breadcrumb-current">{active?.title ?? "New conversation"}</span></div><div className="topbar-right"><span className="demo-tag"><span /> {provider === "offline" ? "OFFLINE DEMO" : provider === "ollama" ? "OLLAMA" : provider === "bedrock" ? "AWS BEDROCK" : "MODEL UNAVAILABLE"}</span><button className="icon-button help-button" aria-label="About model mode" title="About model mode" onClick={() => window.alert(provider === "offline" ? "Shastra is an offline demo. Replies are local examples, not AI-generated." : "Chats are saved in this browser. In model mode, prompts are sent to the configured server. An access code is required for model requests.")}><CircleHelp size={19} /></button></div></header>
        <div className="content-area" key={activeId ?? "welcome"}>{active ? <div className="messages" aria-live="polite">{active.messages.map((message) => <div className={`message ${message.role}`} key={message.id}><div className="message-avatar">{message.role === "user" ? "Y" : "✳"}</div><div className="message-body"><div className="message-author">{message.role === "user" ? "You" : "Shastra"}</div><div className="message-text">{message.content}</div>{message.role === "assistant" && <button className="copy-button" title="Copy response" onClick={() => copyMessage(message)}>{copiedId === message.id ? <Check size={15} /> : <Copy size={15} />} {copiedId === message.id ? "Copied" : "Copy"}</button>}</div></div>)}<div ref={bottomRef} /></div> : <div className="welcome"><div className="welcome-topline"><span className="welcome-line" /> A LITTLE SPACE TO THINK</div><div className="welcome-symbol" aria-hidden="true"><span>✳</span></div><h1>What&apos;s on your mind?</h1><p className="welcome-subtitle">A quiet place to explore ideas, find your next step, and think out loud.</p><div className="suggestion-heading">A PLACE TO START <span>01 / 03</span></div><div className="suggestions">{suggestions.map(({ icon: Icon, label, prompt }, index) => <button className="suggestion" key={label} onClick={() => send(prompt)}><span className="suggestion-number">0{index + 1}</span><span className="suggestion-icon"><Icon size={23} strokeWidth={1.6} /></span><span className="suggestion-label">{label}</span><span className="suggestion-arrow">↗</span></button>)}</div><div className="welcome-note"><span className="note-spark">✦</span> Made for the curious. Kept just for you.</div></div>}</div>
        <div className="composer-wrap">{(provider === "ollama" || provider === "bedrock") && <label className="access-row">Model access code <input type="password" value={accessCode} onChange={(event) => { setAccessCode(event.target.value); setError(""); }} autoComplete="off" placeholder="Enter server access code" aria-label="Model access code" /></label>}<form className="composer" onSubmit={submit}><textarea ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} rows={2} placeholder="Ask anything, or just start typing..." aria-label="Message Shastra" disabled={busy || provider === "loading" || provider === "unavailable"} /><div className="composer-actions"><span className="composer-hint"><Sparkles size={14} /> {provider === "offline" ? "Your thoughts stay on this device" : "Prompts go to your configured model"}</span><button className="send-button" type="submit" disabled={!draft.trim() || busy || provider === "loading" || provider === "unavailable"} title="Send message" aria-label="Send message"><ArrowUp size={20} strokeWidth={2.2} /></button></div></form>{error && <p className="composer-error" role="alert">{error}</p>}<p className="composer-disclaimer">{busy ? "Waiting for model response..." : provider === "offline" ? "Offline demo · Replies are examples, not AI-generated advice" : provider === "unavailable" ? "Model configuration unavailable · Check server settings" : "Access code is held in memory for this tab only"}</p></div>
      </main>
    </div>
  );
}