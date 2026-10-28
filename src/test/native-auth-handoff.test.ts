import { describe, expect, it } from "vitest";
import {
  HandoffError,
  issueHandoffCode,
  redeemHandoffCode,
  type HandoffStore,
} from "@/server/native-auth-handoff";

function memoryStore() {
  const entries = new Map<string, string>();
  const store: HandoffStore = {
    async set(key, value) {
      entries.set(key, value);
    },
    async take(key) {
      const value = entries.get(key) ?? null;
      entries.delete(key);
      return value;
    },
  };
  return { store, entries };
}

const state = "a".repeat(64);
const otherState = "b".repeat(64);

describe("native sign-up handoff", () => {
  it("lets the app redeem a code once with the matching state", async () => {
    const { store } = memoryStore();
    const code = await issueHandoffCode(store, "custom-token", state);

    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(redeemHandoffCode(store, code, state)).resolves.toBe("custom-token");
    await expect(redeemHandoffCode(store, code, state)).rejects.toMatchObject({ status: 404 });
  });

  it("burns the code when the state does not match", async () => {
    const { store } = memoryStore();
    const code = await issueHandoffCode(store, "custom-token", state);

    await expect(redeemHandoffCode(store, code, otherState)).rejects.toBeInstanceOf(HandoffError);
    await expect(redeemHandoffCode(store, code, state)).rejects.toMatchObject({ status: 404 });
  });

  it("rejects malformed state and codes", async () => {
    const { store } = memoryStore();

    await expect(issueHandoffCode(store, "custom-token", "short")).rejects.toMatchObject({
      status: 400,
    });
    await expect(redeemHandoffCode(store, "not-a-code", state)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("never stores the code itself", async () => {
    const { store, entries } = memoryStore();
    const code = await issueHandoffCode(store, "custom-token", state);

    expect([...entries.keys()].some((key) => key.includes(code))).toBe(false);
  });
});
