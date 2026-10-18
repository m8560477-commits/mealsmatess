import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, updateDoc, getDoc } from "firebase/firestore";
let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-mealmate-rules",
    firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8") },
  });
});
beforeEach(async () => env.clearFirestore());
afterAll(async () => env.cleanup());
describe("Firestore privilege boundaries", () => {
  it("denies direct grants, billing, family, roles, audit and migration access", async () => {
    const user = env
      .authenticatedContext("member", { email: "admin@example.test", email_verified: true })
      .firestore();
    for (const collection of [
      "premium_grants",
      "billing_customers",
      "legacy_premium_access",
      "family_memberships",
      "family_households",
      "family_invitations",
      "onboarding_experiences",
      "onboarding_generation_usage",
      "access_migrations",
      "audit_logs",
    ]) {
      await assertFails(
        setDoc(doc(user, collection, "member"), { user_id: "member", is_active: true }),
      );
      await assertFails(getDoc(doc(user, collection, "member")));
    }
    await assertFails(
      setDoc(doc(user, "user_roles", "admin"), { user_id: "member", role: "admin" }),
    );
  });
  it("protects onboarding completion and Premium fields while allowing normal settings", async () => {
    const db = env.authenticatedContext("member").firestore();
    const ref = doc(db, "users", "member");
    await assertSucceeds(
      setDoc(ref, {
        id: "member",
        email: "member@example.test",
        createdAt: "2026-10-18",
        onboarding_completed: false,
      }),
    );
    await assertFails(updateDoc(ref, { onboarding_completed: true }));
    await assertFails(updateDoc(ref, { isPremium: true }));
    await assertFails(updateDoc(ref, { preferences: { onboarding_completed: true } }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "users", "member"), {
        preferences: { allergies: ["sesame"] },
        display_name: "Saved name",
        onboarding_completed: true,
      });
    });
    await assertSucceeds(
      updateDoc(ref, { locale: "zu", currency: "ZAR", theme: "dark", displayName: "Updated" }),
    );
    expect((await getDoc(ref)).data()?.preferences.allergies).toEqual(["sesame"]);
    await assertFails(updateDoc(ref, { email: "admin@example.test" }));
  });
  it("requires server authorization for premium writes and preserves owner reads/deletes", async () => {
    const db = env.authenticatedContext("member").firestore();
    await assertFails(
      setDoc(doc(db, "users/member/favorites/r1"), {
        id: "r1",
        user_id: "member",
        recipe_id: "r1",
      }),
    );
    await assertSucceeds(
      setDoc(doc(db, "users/member/pantry/p1"), { id: "p1", user_id: "member", name: "Rice" }),
    );
    await assertFails(
      getDoc(doc(env.authenticatedContext("outsider").firestore(), "users/member/pantry/p1")),
    );
  });
  it("rejects anonymous profile reads and client-created completed profiles", async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "users/member")));
    await assertFails(
      setDoc(doc(env.authenticatedContext("member").firestore(), "users/member"), {
        id: "member",
        email: "member@example.test",
        onboarding_completed: true,
      }),
    );
  });
});
