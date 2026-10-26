import { describe, expect, it } from "vitest";
import { answerSupportQuestion, supportConversationEmail, SUPPORT_EMAIL } from "@/lib/support";

describe("Kai support answers", () => {
  it.each([
    ["I can't log in to MealMate", "signin"],
    ["Forgot my password and no reset email arrived", "password"],
    ["How can I upload a picture of dinner?", "scan"],
    ["My camera isn't opening", "scan"],
    ["I want to change the colour of my login screen", "theme"],
    ["Where did my saved recipes go?", "recipes"],
    ["Where is my grocery shopping list?", "planner"],
    ["How much does the premium plan cost?", "premium"],
    ["I want to cancel the subscription I paid for", "cancel"],
    ["I've purchased Premium but it's still locked", "restore"],
    ["Why is my referral code rejected?", "codes"],
    ["Stop push notifications", "notifications"],
    ["How do I disable email notifications?", "notifications"],
    ["Can I cancel my delivery order?", "orders"],
    ["Delete my account", "delete"],
  ])("routes a user's question to the relevant help: %s", (question, topic) => {
    expect(answerSupportQuestion(question).topicId).toBe(topic);
  });

  it("escalates an unresolved follow-up instead of repeating the same troubleshooting", () => {
    const result = answerSupportQuestion("The scan still doesn't work, I tried that", "scan");
    expect(result.email).toBe(true);
    expect(result.text).toContain("exact error message");
    expect(result.text).toContain("can't inspect your account");
  });

  it("lets a follow-up switch to another subject", () => {
    expect(answerSupportQuestion("My password reset isn't working", "scan").topicId).toBe(
      "password",
    );
  });

  it("hands human support requests to the configured team email", () => {
    const result = answerSupportQuestion("I want to talk to a human");
    expect(result.email).toBe(true);
    expect(result.text).toContain(SUPPORT_EMAIL);
    expect(result.text).toContain("does not send messages or create tickets");
  });

  it("does not fabricate an answer or pretend to change an account", () => {
    const result = answerSupportQuestion("What is the weather in Tokyo?");
    expect(result.topicId).toBeUndefined();
    expect(result.email).toBe(true);
    expect(result.text).toContain("don't have a reliable answer");
  });

  it("creates a user-sent email draft with safely encoded recent messages", () => {
    const href = supportConversationEmail([
      { role: "user", text: "My scan failed & I saw #oops? 🥗" },
      { role: "assistant", text: "Try another photo." },
    ]);
    const url = new URL(href);
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe(SUPPORT_EMAIL);
    expect(url.searchParams.get("body")).toContain("You: My scan failed & I saw #oops? 🥗");
    expect(url.searchParams.get("body")).toContain("Kai: Try another photo.");
  });

  it("bounds email drafts while preserving the latest message and Unicode", () => {
    const messages = Array.from({ length: 12 }, (_, i) => ({
      role: "user" as const,
      text: `question ${i}: ${"🥗".repeat(700)}`,
    }));
    messages.push({ role: "user", text: "LATEST: I still need help" });
    const body = new URL(supportConversationEmail(messages)).searchParams.get("body")!;
    expect(body).toContain("LATEST: I still need help");
    expect(body).toContain("Earlier messages omitted");
    expect(Array.from(body).length).toBeLessThan(2200);
    expect(body).not.toContain("question 0:");
  });
});
