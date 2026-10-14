"use client";

import { useState } from "react";
import { Sheet, TextInput } from "@/components/forms";
import { Button, Notice } from "@/components/ui";
import { runChatTool } from "@/data/ai-tools";
import { getDB } from "@/data/db";
import { AiError, callAi } from "@/lib/ai-client";
import type { ChatMessage, ChatResult } from "@/lib/ai-schemas";

/** Client-side cap on tool round trips per question. */
const MAX_ROUNDS = 6;

type Line = { kind: "user" | "assistant" | "tool"; text: string };

/**
 * "Ask Gainpath": an explicit, opt-in chat. The history is kept exactly as the
 * API returned it (thinking blocks included) and sent back unchanged.
 */
export function AskGainpath({ onClose }: { onClose: () => void }) {
  const db = getDB();
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const question = text.trim();
    if (!question || busy) return;
    setBusy(true);
    setError(null);
    setText("");
    setLines((l) => [...l, { kind: "user", text: question }]);
    let messages: ChatMessage[] = [...history, { role: "user", content: question }];
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const result = await callAi<ChatResult>("chat", { messages });
        messages = [
          ...messages,
          { role: "assistant", content: result.content as ChatMessage["content"] },
        ];
        const said = result.content
          .filter((b) => b.type === "text")
          .map((b) => String(b.text))
          .join("\n")
          .trim();
        if (said) setLines((l) => [...l, { kind: "assistant", text: said }]);
        if (result.stop_reason !== "tool_use") break;

        const results = [];
        for (const block of result.content.filter((b) => b.type === "tool_use")) {
          const out = await runChatTool(db, String(block.name), block.input);
          setLines((l) => [...l, { kind: "tool", text: out.summary }]);
          results.push({
            type: "tool_result" as const,
            tool_use_id: String(block.id),
            content: out.content,
            is_error: out.isError,
          });
        }
        messages = [...messages, { role: "user", content: results }];
      }
      setHistory(messages);
    } catch (e) {
      // Keep the history before this question so the conversation stays consistent.
      setError(e instanceof AiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Ask Gainpath" onClose={onClose}>
      <p className="text-xs text-zinc-500">
        AI answers using your own data via the app&apos;s engine. Each question counts toward
        today&apos;s AI limit.
      </p>
      <div className="flex flex-col gap-2" aria-live="polite">
        {lines.map((line, i) =>
          line.kind === "tool" ? (
            <p key={i} className="text-xs text-zinc-500">
              ⚙ {line.text}
            </p>
          ) : (
            <p
              key={i}
              className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                line.kind === "user" ? "self-end bg-zinc-100 text-zinc-950" : "bg-zinc-900"
              }`}
            >
              {line.text}
            </p>
          ),
        )}
        {busy && <p className="text-sm text-zinc-400">Thinking…</p>}
      </div>
      {error && <Notice>{error}</Notice>}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <TextInput
          aria-label="Question"
          placeholder="Why is today so light?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
        />
        <Button variant="primary" className="w-auto! px-4" disabled={busy || !text.trim()}>
          Ask
        </Button>
      </form>
    </Sheet>
  );
}
