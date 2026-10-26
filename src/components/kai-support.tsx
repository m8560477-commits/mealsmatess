import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bot, Mail, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  HELP_TOPICS,
  answerSupportQuestion,
  supportConversationEmail,
  type KaiReply,
} from "@/lib/support";

type Message = {
  role: "user" | "assistant";
  text: string;
  links?: KaiReply["links"];
  email?: boolean;
};
const GREETING: Message = {
  role: "assistant",
  text: "Hi, I'm Kai, MealMate's automated support assistant. Ask me about the app or choose a question below. For account-specific help, you can email our team.",
};
const QUICK_QUESTIONS = ["signin", "scan", "theme", "restore"];

export function KaiSupport() {
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [draft, setDraft] = useState("");
  const [topicId, setTopicId] = useState<string>();
  const input = useRef<HTMLTextAreaElement>(null);
  const lastMessage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length > 1) lastMessage.current?.scrollIntoView?.({ block: "nearest" });
  }, [messages.length]);

  function ask(question: string) {
    const text = question.trim().slice(0, 1000);
    if (!text) return;
    const reply = answerSupportQuestion(text, topicId);
    setMessages((previous) => [
      ...previous,
      { role: "user", text },
      { role: "assistant", text: reply.text, links: reply.links, email: reply.email },
    ]);
    setTopicId(reply.topicId ?? topicId);
    setDraft("");
    input.current?.focus({ preventScroll: true });
  }

  return (
    <section
      id="kai-chat"
      aria-labelledby="kai-heading"
      className="mt-6 scroll-mt-24 overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Bot className="size-6" aria-hidden="true" />
          </span>
          <div>
            <h2 id="kai-heading" className="font-display text-xl">
              Chat with Kai
            </h2>
            <p className="text-xs text-muted-foreground">
              Automated MealMate support · Instant answers
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Start new chat"
          title="Start new chat"
          disabled={messages.length === 1 && !draft}
          onClick={() => {
            setMessages([GREETING]);
            setDraft("");
            setTopicId(undefined);
            input.current?.focus();
          }}
        >
          <RotateCcw className="size-4" />
        </Button>
      </header>
      <div
        role="log"
        aria-label="Conversation with Kai"
        aria-live="polite"
        aria-relevant="additions"
        tabIndex={0}
        className="max-h-[26rem] min-h-36 space-y-4 overflow-y-auto overscroll-contain p-4 outline-offset-[-2px] sm:p-5"
      >
        {messages.map((message, index) => (
          <div
            key={index}
            ref={index === messages.length - 1 ? lastMessage : undefined}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[92%] min-w-0 rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
            >
              <p className="mb-1 text-xs font-semibold">
                {message.role === "user" ? "You" : "Kai"}
              </p>
              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                {message.text}
              </p>
              {!!message.links?.length && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.links.map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      className="inline-flex min-h-9 items-center rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground hover:bg-card"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
              {message.email && (
                <a
                  href={supportConversationEmail(messages.slice(0, index + 1))}
                  className="mt-3 inline-flex min-h-9 items-center gap-2 text-sm font-medium underline underline-offset-4"
                >
                  <Mail className="size-4" aria-hidden="true" />
                  Email this conversation
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border p-4 sm:p-5">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Try asking</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {QUICK_QUESTIONS.map((id) => {
            const topic = HELP_TOPICS.find((item) => item.id === id)!;
            return (
              <button
                key={id}
                type="button"
                onClick={() => ask(topic.question)}
                className="min-h-10 rounded-full border border-border bg-background px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
              >
                {topic.question}
              </button>
            );
          })}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            ask(draft);
          }}
        >
          <label htmlFor="kai-question" className="mb-2 block text-sm font-medium">
            Ask Kai a question
          </label>
          <div className="flex items-end gap-2">
            <Textarea
              ref={input}
              id="kai-question"
              value={draft}
              maxLength={1000}
              rows={2}
              placeholder="How can I scan my ingredients?"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  ask(draft);
                }
              }}
              className="max-h-40 min-h-20 flex-1 resize-y bg-background"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!draft.trim()}
              aria-label="Send question to Kai"
              className="size-11 shrink-0"
            >
              <Send className="size-4" aria-hidden="true" />
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Kai uses MealMate help answers and cannot access your account. This chat stays on this
            page.
          </p>
        </form>
      </div>
    </section>
  );
}
