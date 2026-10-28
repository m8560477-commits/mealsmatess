import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { signInWithCustomToken, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";

// Sign-up for the Android app runs in an in-app browser (Chrome Custom Tab), because Google
// blocks sign-in inside embedded WebViews. The tab and the WebView do not share storage, so
// the finished session is handed back through a one-time code (see native-auth-handoff.ts).
//
// These are the same plugin names that @capacitor/browser and @capacitor/app register
// natively; once those packages are installed and `npx cap sync android` has run, the calls
// below reach them. Registering by name keeps web builds free of the native packages.
const Browser = registerPlugin<{
  open(options: { url: string }): Promise<void>;
  close(): Promise<void>;
}>("Browser");

const NativeApp = registerPlugin<{
  addListener(
    event: "appUrlOpen",
    listener: (event: { url: string }) => void,
  ): Promise<PluginListenerHandle>;
}>("App");

export const NATIVE_AUTH_SCHEME = "com.taztechnologies.mealmate";
const STATE_KEY = "mealmate:native-auth-state";
const STATE_MAX_AGE_MS = 15 * 60 * 1000;

export function isNativeApp() {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

function randomState() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readStoredState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATE_KEY) ?? "null") as {
      state?: string;
      at?: number;
    } | null;
    if (!parsed?.state || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > STATE_MAX_AGE_MS) return null;
    return parsed.state;
  } catch {
    return null;
  }
}

function clearStoredState() {
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {
    // Storage can be unavailable; the one-time code still expires on its own.
  }
}

/** App side: open the sign-up page in the in-app browser. */
export async function startNativeSignup() {
  const state = randomState();
  localStorage.setItem(STATE_KEY, JSON.stringify({ state, at: Date.now() }));
  const url = new URL("/auth", window.location.origin);
  url.searchParams.set("mode", "signup");
  url.searchParams.set("native_state", state);
  await Browser.open({ url: url.toString() });
}

async function postNativeAuth(body: Record<string, string>, idToken?: string) {
  const response = await fetch("/api/native-auth", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(idToken ? { authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof data["error"] === "string" ? data["error"] : "Couldn't finish sign-up.");
  }
  return data;
}

/** Tab side: trade the signed-in session for a one-time code and return the deep link. */
export async function createReturnLink(state: string) {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in first.");
  const idToken = await user.getIdToken(true);
  const data = await postNativeAuth({ action: "issue", state }, idToken);
  const code = data["code"];
  if (typeof code !== "string") throw new Error("Couldn't finish sign-up.");
  const link = new URL(`${NATIVE_AUTH_SCHEME}://auth`);
  link.searchParams.set("code", code);
  link.searchParams.set("state", state);
  return link.toString();
}

/** App side: handle the deep link, sign the WebView in and close the in-app browser. */
export async function completeNativeSignIn(rawUrl: string): Promise<User | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${NATIVE_AUTH_SCHEME}:` || url.hostname !== "auth") return null;

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = readStoredState();
  if (!code || !state || !expected || state !== expected) return null;
  clearStoredState();

  const data = await postNativeAuth({ action: "redeem", code, state });
  const customToken = data["customToken"];
  if (typeof customToken !== "string") throw new Error("Couldn't finish sign-up.");
  const credential = await signInWithCustomToken(auth, customToken);
  await Browser.close().catch(() => undefined);
  return credential.user;
}

export function listenForNativeSignIn(
  onSignedIn: (user: User) => void,
  onError: (error: unknown) => void,
) {
  if (!isNativeApp()) return () => undefined;
  let handle: PluginListenerHandle | undefined;
  let disposed = false;
  void NativeApp.addListener("appUrlOpen", ({ url }) => {
    completeNativeSignIn(url)
      .then((user) => {
        if (user) onSignedIn(user);
      })
      .catch(onError);
  })
    .then((listener) => {
      if (disposed) void listener.remove();
      else handle = listener;
    })
    .catch(onError);
  return () => {
    disposed = true;
    void handle?.remove();
  };
}
