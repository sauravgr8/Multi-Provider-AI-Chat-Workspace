import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = { role: "user" | "assistant"; content: string };

function provider() {
  const value = process.env.SHASTRA_PROVIDER || "offline";
  return value === "offline" || value === "ollama" || value === "bedrock" ? value : "unavailable";
}

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function GET() {
  return reply({ provider: provider() });
}

export async function POST(request: NextRequest) {
  const selected = provider();
  if (selected === "offline" || selected === "unavailable") return reply({ error: "Configure a supported model provider on the server." }, 503);

  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return reply({ error: "Cross-origin requests are not allowed." }, 403);

  const accessToken = process.env.SHASTRA_ACCESS_TOKEN;
  if (!accessToken) return reply({ error: "Set SHASTRA_ACCESS_TOKEN on the server before enabling model access." }, 503);
  const received = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const expectedBytes = Buffer.from(accessToken);
  const receivedBytes = Buffer.from(received);
  if (expectedBytes.length !== receivedBytes.length || !timingSafeEqual(expectedBytes, receivedBytes)) {
    return reply({ error: "Access code required or incorrect." }, 401);
  }

  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "JSON body required." }, 415);
  let input: unknown;
  try {
    const text = await request.text();
    if (text.length > 32000) return reply({ error: "Conversation is too long." }, 413);
    input = JSON.parse(text);
  } catch {
    return reply({ error: "Invalid JSON body." }, 400);
  }

  const messages = (input as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 30 ||
    !messages.every((message: ChatMessage) => message && (message.role === "user" || message.role === "assistant") &&
      typeof message.content === "string" && message.content.trim().length > 0 && message.content.length <= 8000) ||
    messages[messages.length - 1].role !== "user") {
    return reply({ error: "Provide 1-30 messages ending with a user message (up to 8000 characters each)." }, 400);
  }
  const history: ChatMessage[] = messages;

  try {
    if (selected === "ollama") {
      const url = new URL(process.env.SHASTRA_OLLAMA_URL || "http://127.0.0.1:11434");
      if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password) throw new Error("Invalid model endpoint");
      const response = await fetch(new URL("/api/chat", url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: process.env.SHASTRA_OLLAMA_MODEL || "llama3.2:3b", messages: history, stream: false }),
        signal: AbortSignal.timeout(60000),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Model request failed");
      const result: unknown = await response.json();
      const content = (result as { message?: { content?: unknown } })?.message?.content;
      if (typeof content !== "string" || !content.trim()) throw new Error("Empty model response");
      return reply({ content });
    }

    if (!process.env.AWS_REGION || !process.env.SHASTRA_BEDROCK_MODEL_ID) {
      return reply({ error: "Set AWS_REGION and SHASTRA_BEDROCK_MODEL_ID on the server." }, 503);
    }
    const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
    const result = await client.send(new ConverseCommand({
      modelId: process.env.SHASTRA_BEDROCK_MODEL_ID,
      messages: history.map((message) => ({ role: message.role, content: [{ text: message.content }] })),
      inferenceConfig: { maxTokens: 512 },
    }), { abortSignal: AbortSignal.timeout(60000) });
    const content = result.output?.message?.content?.map((part) => part.text ?? "").join("").trim();
    if (!content) throw new Error("Empty model response");
    return reply({ content });
  } catch {
    return reply({ error: "The model is unavailable. Check server configuration and try again." }, 502);
  }
}