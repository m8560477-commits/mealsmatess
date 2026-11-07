import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  getDocs,
  collection,
} from "firebase/firestore";
import { ref, uploadBytes, getBytes, deleteObject, listAll } from "firebase/storage";
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-mealmate-avatar",
    firestore: { host: "127.0.0.1", port: 8089, rules: await readFile("firestore.rules", "utf8") },
    storage: { host: "127.0.0.1", port: 9198, rules: await readFile("storage.rules", "utf8") },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users/owner"), {
      id: "owner",
      email: "synthetic@example.test",
      displayName: "Synthetic Chef",
      createdAt: "2026-11-06",
      goal: "healthy_cooking",
    });
  });
});
after(async () => {
  await env?.cleanup();
});
const path = "users/owner/profile/avatar.jpg";
const bytes = new Uint8Array([255, 216, 255, 224]);
test("owner uploads, reads, replaces and removes the same avatar", async () => {
  const target = ref(env.authenticatedContext("owner").storage(), path);
  await assertSucceeds(uploadBytes(target, bytes, { contentType: "image/jpeg" }));
  await assertSucceeds(getBytes(target));
  await assertSucceeds(
    uploadBytes(target, new Uint8Array([255, 216, 255, 225]), { contentType: "image/jpeg" }),
  );
  await assertSucceeds(deleteObject(target));
});
test("anonymous and other users cannot read, create, replace or delete avatar", async () => {
  await uploadBytes(ref(env.authenticatedContext("owner").storage(), path), bytes, {
    contentType: "image/jpeg",
  });
  for (const ctx of [env.unauthenticatedContext(), env.authenticatedContext("other")]) {
    const target = ref(ctx.storage(), path);
    await assertFails(uploadBytes(target, bytes, { contentType: "image/jpeg" }));
    await assertFails(getBytes(target));
    await assertFails(deleteObject(target));
  }
});
test("rejects oversized, empty, non-JPEG, arbitrary paths and listing", async () => {
  const storage = env.authenticatedContext("owner").storage();
  await assertSucceeds(
    uploadBytes(ref(storage, path), new Uint8Array(5 * 1024 * 1024), { contentType: "image/jpeg" }),
  );
  await assertFails(
    uploadBytes(ref(storage, path), new Uint8Array(5 * 1024 * 1024 + 1), {
      contentType: "image/jpeg",
    }),
  );
  await assertFails(
    uploadBytes(ref(storage, path), new Uint8Array(), { contentType: "image/jpeg" }),
  );
  for (const contentType of ["image/svg+xml", "text/html", "image/png", "image/webp"])
    await assertFails(uploadBytes(ref(storage, path), bytes, { contentType }));
  await assertFails(
    uploadBytes(ref(storage, "users/owner/profile/other.jpg"), bytes, {
      contentType: "image/jpeg",
    }),
  );
  await assertFails(
    uploadBytes(ref(storage, "recipe-images/overwrite.jpg"), bytes, { contentType: "image/jpeg" }),
  );
  await assertFails(listAll(ref(storage, "users/owner/profile")));
});
test("photo merge preserves profile and accepts server timestamps; removal persists", async () => {
  const account = doc(env.authenticatedContext("owner").firestore(), "users/owner");
  await assertSucceeds(
    updateDoc(account, {
      photoURL: "https://firebasestorage.googleapis.com/synthetic",
      photoUpdatedAt: serverTimestamp(),
    }),
  );
  const data = (await getDoc(account)).data();
  if (
    data.displayName !== "Synthetic Chef" ||
    data.goal !== "healthy_cooking" ||
    !data.photoUpdatedAt
  )
    throw Error("Profile was overwritten");
  await assertSucceeds(updateDoc(account, { photoURL: "", photoUpdatedAt: serverTimestamp() }));
  const reopened = doc(env.authenticatedContext("owner").firestore(), "users/owner");
  if ((await getDoc(reopened)).data().photoURL !== "") throw Error("Removal not persisted");
});
test("profile denies forged timestamps, identities, privileges, large URLs, other-user reads/writes and public lists", async () => {
  const owner = env.authenticatedContext("owner").firestore();
  const account = doc(owner, "users/owner");
  for (const data of [
    { photoURL: "https://x.test/no-timestamp" },
    { photoUpdatedAt: "yesterday" },
    { photoUpdatedAt: new Date(0) },
    { id: "other" },
    { createdAt: "changed" },
    { admin: true },
    { photoURL: "a".repeat(2049), photoUpdatedAt: serverTimestamp() },
  ])
    await assertFails(updateDoc(account, data));
  const other = env.authenticatedContext("other").firestore();
  await assertFails(getDoc(doc(other, "users/owner")));
  await assertFails(
    updateDoc(doc(other, "users/owner"), { photoURL: "", photoUpdatedAt: serverTimestamp() }),
  );
  await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), "users")));
});
