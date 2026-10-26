import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: PropsWithChildren<{ to: string }>) => <a href={to}>{children}</a>,
}));
import { KaiSupport } from "@/components/kai-support";

afterEach(cleanup);
function send(question: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Ask Kai a question" }), {
    target: { value: question },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send question to Kai" }));
}

describe("Kai support conversation", () => {
  it("answers free-text questions without sign-in or an external request", () => {
    const request = vi.spyOn(globalThis, "fetch");
    render(<KaiSupport />);
    const log = screen.getByRole("log", { name: "Conversation with Kai" });
    expect(log).toHaveTextContent("automated support assistant");
    send("How can I scan my groceries?");
    expect(log).toHaveTextContent("Log ingredients");
    expect(within(log).getByRole("link", { name: "Open Food Scanner" })).toHaveAttribute(
      "href",
      "/scan",
    );
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(request).not.toHaveBeenCalled();
    request.mockRestore();
  });

  it("answers suggested questions and offers an email handoff for failed troubleshooting", () => {
    render(<KaiSupport />);
    fireEvent.click(screen.getByRole("button", { name: "How do I scan food?" }));
    send("I tried that and the scan still doesn't work");
    const log = screen.getByRole("log");
    expect(log).toHaveTextContent("Sorry that didn't solve it");
    const email = within(log).getByRole("link", { name: "Email this conversation" });
    const body = new URL(email.getAttribute("href")!).searchParams.get("body");
    expect(body).toContain("scan still doesn't work");
    expect(body).toContain("Kai:");
  });

  it("clears the conversation, draft and follow-up topic when starting a new chat", () => {
    render(<KaiSupport />);
    send("I forgot my password");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "unsent" } });
    fireEvent.click(screen.getByRole("button", { name: "Start new chat" }));
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getByRole("log")).not.toHaveTextContent("I forgot my password");
    send("That still doesn't work");
    expect(screen.getByRole("log")).toHaveTextContent("don't have a reliable answer");
  });

  it("ignores blank submissions, sends with Enter, and keeps Shift+Enter for multiline input", () => {
    render(<KaiSupport />);
    const input = screen.getByRole("textbox");
    expect(screen.getByRole("button", { name: "Send question to Kai" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("log")).not.toHaveTextContent("You");
    fireEvent.change(input, { target: { value: "How do I change my theme?" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(screen.getByRole("log")).not.toHaveTextContent("You");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("log")).toHaveTextContent("Theme picker");
  });
});
