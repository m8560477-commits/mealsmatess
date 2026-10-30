import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, Timestamp } from "firebase/firestore";
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-mealmate-paywall",
    firestore: { host: "127.0.0.1", port: 8089, rules: await readFile("firestore.rules", "utf8") },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "recipes/r1"), { name: "Synthetic recipe" });
    await setDoc(doc(db, "premium_access/paid"), {
      source: "revenuecat",
      entitlement: "premium",
      valid_until: Timestamp.fromMillis(Date.now() + 300_000),
    });
    await setDoc(doc(db, "premium_access/expired"), {
      source: "revenuecat",
      entitlement: "premium",
      valid_until: Timestamp.fromMillis(Date.now() - 1000),
    });
    await setDoc(doc(db, "premium_access/manual"), {
      source: "admin",
      entitlement: "premium",
      valid_until: Timestamp.fromMillis(Date.now() + 300_000),
    });
    await setDoc(doc(db, "restaurants/r1"), { approval_status: "approved", is_demo: false });
    await setDoc(doc(db, "users/paid"), {
      id: "paid",
      email: "synthetic@example.test",
      createdAt: "2026-01-01",
    });
  });
});
after(async () => {
  await env?.cleanup();
});
test("anonymous, unpaid, expired, and manual grants cannot read recipes", async () => {
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "recipes/r1")));
  for (const uid of ["unpaid", "expired", "manual"])
    await assertFails(getDoc(doc(env.authenticatedContext(uid).firestore(), "recipes/r1")));
  await assertSucceeds(
    getDocs(collection(env.authenticatedContext("paid").firestore(), "recipes")),
  );
});
test("clients cannot forge access leases, checkout ownership, or account binding", async () => {
  const db = env.authenticatedContext("unpaid").firestore();
  for (const path of [
    "premium_access/unpaid",
    "billing_links/unpaid",
    "billing_sessions/guessed",
    "intro_completion/unpaid",
  ])
    await assertFails(
      setDoc(doc(db, path), {
        source: "revenuecat",
        entitlement: "premium",
        valid_until: Timestamp.fromMillis(Date.now() + 300_000),
        customerId: "paid",
      }),
    );
});
test("owner scope and existing grocery validators remain enforced for subscribers", async () => {
  const paid = env.authenticatedContext("paid").firestore();
  const item = {
    id: "g1",
    user_id: "paid",
    name: "Tomato",
    checked: false,
    created_at: "2026-01-01",
  };
  await assertSucceeds(setDoc(doc(paid, "users/paid/grocery/g1"), item));
  await assertSucceeds(updateDoc(doc(paid, "users/paid/grocery/g1"), { checked: true }));
  await assertFails(updateDoc(doc(paid, "users/paid/grocery/g1"), { user_id: "other" }));
  await assertFails(updateDoc(doc(paid, "users/paid/grocery/g1"), { name: "x".repeat(161) }));
  await assertFails(updateDoc(doc(paid, "users/paid/grocery/g1"), { premium: true }));
  await assertFails(
    getDoc(doc(env.authenticatedContext("unpaid").firestore(), "users/paid/grocery/g1")),
  );
  await assertFails(
    setDoc(doc(env.authenticatedContext("unpaid").firestore(), "users/unpaid/grocery/g1"), {
      ...item,
      user_id: "unpaid",
    }),
  );
});
test("profile and Hub restaurant access still work before subscription", async () => {
  const db = env.authenticatedContext("unpaid").firestore();
  await assertSucceeds(
    setDoc(doc(db, "users/unpaid"), {
      id: "unpaid",
      email: "synthetic@example.test",
      createdAt: "2026-01-01",
      onboarding_completed: true,
    }),
  );
  await assertSucceeds(getDoc(doc(db, "users/unpaid")));
  await assertFails(getDoc(doc(db, "recipes/r1")));
  await assertSucceeds(getDoc(doc(db, "restaurants/r1")));
  await assertFails(getDoc(doc(db, "users/paid")));
});
