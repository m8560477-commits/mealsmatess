import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { MiaContext, type MiaRecipe, type MiaTurn } from "@/hooks/use-mia";
import { useSession } from "@/hooks/use-session";
import { usePremium } from "@/hooks/use-premium";
import { postAuthenticatedAi } from "@/lib/ai-api";
import { MiaVoiceSession, type MiaVoiceSnapshot } from "@/lib/mia/voice-session";
import { openMiaMicrophone } from "@/lib/mia/microphone";
import { speakMia } from "@/lib/mia/speech";
import { MiaVoiceControls } from "@/components/mia-voice-controls";

/** Shared across Consumer routes; navigation never resets a hands-free conversation. */
export function MiaProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const { isPremium } = usePremium();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const allowed =
    !!user &&
    isPremium &&
    !/^\/(auth|welcome|premium|onboarding|admin|legal|reset-password)(\/|$)/.test(path);
  const [turns, setTurns] = useState<MiaTurn[]>([]);
  const turnsRef = useRef<MiaTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const recipe = useRef<MiaRecipe | null>(null);
  const recipeStepper = useRef<((step: number) => void) | undefined>(undefined);
  const setRecipe = useCallback((value: MiaRecipe | null, onStep?: (step: number) => void) => {
    recipe.current = value;
    recipeStepper.current = onStep;
  }, []);
  const [voice, setVoice] = useState<MiaVoiceSnapshot>({
    state: "muted",
    transcript: "",
    error: "",
  });
  const session = useRef<MiaVoiceSession | null>(null);
  const nativeLifecycleReady = useRef(!Capacitor.isNativePlatform());
  const nativeForeground = useRef(true);
  const statusRef = useRef<MiaVoiceSnapshot>({ state: "muted", transcript: "", error: "" });
  const manualMuted = useRef(false);
  const cookingPaused = useRef(false);
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;
  const saveMute = useCallback((muted: boolean) => {
    manualMuted.current = muted;
    try {
      if (userIdRef.current)
        localStorage.setItem(`mealmate:voice-muted:${userIdRef.current}`, muted ? "1" : "0");
    } catch {
      /* Device storage may be unavailable. */
    }
  }, []);
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;
  const updateTurns = useCallback((update: (items: MiaTurn[]) => MiaTurn[]) => {
    turnsRef.current = update(turnsRef.current);
    setTurns(turnsRef.current);
  }, []);
  const patch = useCallback(
    (id: string, next: Partial<MiaTurn>) => {
      updateTurns((items) => items.map((turn) => (turn.id === id ? { ...turn, ...next } : turn)));
    },
    [updateTurns],
  );

  const startIfEligible = useCallback(() => {
    if (
      !allowedRef.current ||
      manualMuted.current ||
      cookingPaused.current ||
      !nativeLifecycleReady.current ||
      !nativeForeground.current ||
      !navigator.onLine ||
      document.visibilityState !== "visible"
    )
      return;
    if (!["muted", "paused"].includes(statusRef.current.state)) return;
    void session.current?.start();
  }, []);
  const startVoice = useCallback(() => {
    if (!allowedRef.current) return;
    saveMute(false);
    if (!nativeLifecycleReady.current) {
      session.current?.stop("error", "Update or reopen MealMate to enable foreground listening.");
      return;
    }
    if (!navigator.onLine || document.visibilityState !== "visible" || !nativeForeground.current) {
      session.current?.stop("paused", "Keep MealMate active and connect to resume hands-free.");
      return;
    }
    cookingPaused.current = false;
    session.current?.stop();
    startIfEligible();
  }, [saveMute, startIfEligible]);
  const stopVoice = useCallback(() => {
    saveMute(true);
    session.current?.stop();
  }, [saveMute]);
  const pauseVoice = useCallback(() => {
    cookingPaused.current = true;
    session.current?.stop("paused");
  }, []);
  const resumeVoice = useCallback(() => {
    cookingPaused.current = false;
    startIfEligible();
  }, [startIfEligible]);

  const answer = useCallback(
    async (text: string, history: MiaTurn[], signal: AbortSignal, voiceMode: boolean) => {
      const messages = history
        .filter((turn) => turn.answer.trim() && !turn.error)
        .slice(-10)
        .flatMap((turn) => [
          { role: "user" as const, content: turn.question.slice(0, 4000) },
          { role: "assistant" as const, content: turn.answer.slice(0, 4000) },
        ]);
      messages.push({ role: "user", content: text.slice(0, 4000) });
      while (
        messages.length > 1 &&
        messages.reduce((total, item) => total + item.content.length, 0) > 16000
      )
        messages.splice(0, 2);
      const { reply } = await postAuthenticatedAi<{ reply: string }>(
        "/api/mia",
        {
          messages,
          voice: voiceMode,
          ...(recipe.current ? { recipe: recipe.current } : {}),
        },
        { signal },
      );
      if (!reply?.trim()) throw new Error("Mia returned an empty response. Please try again.");
      return reply;
    },
    [],
  );

  const ask = useCallback(
    async (
      question: string,
      options: { visual?: boolean; voice?: boolean; signal?: AbortSignal } = {},
    ) => {
      const text = question.trim().slice(0, 4000);
      if (!allowedRef.current) throw new Error("Sign in with an active subscription to use Mia.");
      if (!text || requestRef.current)
        throw new Error("Mia is still answering. Please wait a moment.");
      const request = new AbortController();
      const abort = () => request.abort();
      options.signal?.addEventListener("abort", abort, { once: true });
      if (options.signal?.aborted) request.abort();
      requestRef.current = request;
      setBusy(true);
      const previous = turnsRef.current;
      const id = crypto.randomUUID();
      updateTurns((items) =>
        [...items, { id, question: text, answer: "", visualLoading: !!options.visual }].slice(-50),
      );
      if (options.visual) {
        void import("@/lib/visual.functions")
          .then(({ generateVisualExplanation }) =>
            generateVisualExplanation({ data: { prompt: text, scenes: 4, narration: true } }),
          )
          .then((visual) => patch(id, { visual, visualLoading: false }))
          .catch((error: unknown) =>
            patch(id, {
              visualLoading: false,
              visualError: error instanceof Error ? error.message : "Visual generation failed",
            }),
          );
      }
      try {
        const reply = await answer(text, previous, request.signal, !!options.voice);
        request.signal.throwIfAborted();
        patch(id, { answer: reply });
        return reply;
      } catch (error) {
        patch(id, {
          error: request.signal.aborted
            ? "Response interrupted."
            : error instanceof Error
              ? error.message
              : "Mia is unavailable. Please try again.",
        });
        throw error;
      } finally {
        options.signal?.removeEventListener("abort", abort);
        if (requestRef.current === request) {
          requestRef.current = null;
          setBusy(false);
        }
      }
    },
    [answer, patch, updateTurns],
  );
  const askRef = useRef(ask);
  askRef.current = ask;

  const retry = useCallback(
    async (id: string) => {
      if (!allowedRef.current || requestRef.current) return;
      const index = turnsRef.current.findIndex((turn) => turn.id === id);
      const turn = turnsRef.current[index];
      if (!turn) return;
      const request = new AbortController();
      requestRef.current = request;
      setBusy(true);
      patch(id, { answer: "", error: undefined });
      try {
        patch(id, {
          answer: await answer(
            turn.question,
            turnsRef.current.slice(0, index),
            request.signal,
            false,
          ),
        });
      } catch (error) {
        patch(id, {
          error: error instanceof Error ? error.message : "Mia is unavailable. Please try again.",
        });
      } finally {
        if (requestRef.current === request) {
          requestRef.current = null;
          setBusy(false);
        }
      }
    },
    [answer, patch],
  );

  const voiceRespond = useRef<(text: string, signal: AbortSignal) => Promise<string>>(
    async () => "",
  );
  voiceRespond.current = async (text, signal) => {
    const current = recipe.current;
    if (
      current &&
      !current.paused &&
      /^(next(?: step)?|previous(?: step)?|repeat(?: (?:the )?step)?|what(?: is|'s|’s) (?:the )?(?:current )?step|what(?: is|'s|’s) next)[.!?]?$/i.test(
        text,
      )
    ) {
      const next = /^(?:next|what(?: is|'s|’s) next)/i.test(text)
        ? Math.min(current.steps.length - 1, current.step + 1)
        : /^previous/i.test(text)
          ? Math.max(0, current.step - 1)
          : current.step;
      recipeStepper.current?.(next);
      recipe.current = {
        ...current,
        step: next,
        completedSteps:
          next > current.step
            ? Array.from(new Set([...(current.completedSteps ?? []), current.step]))
            : current.completedSteps,
      };
      const reply = `Step ${next + 1} of ${current.steps.length}. ${current.steps[next]}`;
      updateTurns((items) =>
        [...items, { id: crypto.randomUUID(), question: text, answer: reply }].slice(-50),
      );
      return reply;
    }
    return askRef.current(text, { voice: true, signal });
  };

  useEffect(() => {
    const instance = new MiaVoiceSession({
      microphone: openMiaMicrophone,
      speak: speakMia,
      changed: (value) => {
        statusRef.current = value;
        setVoice(value);
      },
      mutedByVoice: () => saveMute(true),
      respond: (text, signal) => voiceRespond.current(text, signal),
    });
    session.current = instance;
    const pause = () => instance.stop("paused");
    let disposed = false;
    let removeNativeListener: (() => Promise<void>) | undefined;
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("App")) {
      let activityVersion = 0;
      void import("@capacitor/app")
        .then(async ({ App }) => {
          const listener = await App.addListener("appStateChange", ({ isActive }) => {
            activityVersion += 1;
            nativeForeground.current = isActive;
            if (!isActive) pause();
            else startIfEligible();
          });
          if (disposed) {
            await listener.remove();
            return;
          }
          removeNativeListener = () => listener.remove();
          const observedVersion = activityVersion;
          const state = await App.getState();
          if (disposed) return;
          if (activityVersion === observedVersion) nativeForeground.current = state.isActive;
          nativeLifecycleReady.current = true;
          if (nativeForeground.current) startIfEligible();
          else pause();
        })
        .catch(() => {
          if (!disposed)
            instance.stop("error", "Couldn't monitor app activity. Reopen MealMate to try again.");
        });
    }
    const visibility = () => {
      if (document.visibilityState !== "visible") pause();
      else startIfEligible();
    };
    const offline = () =>
      instance.stop("paused", "You're offline. Reconnect and resume hands-free.");
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pause);
    window.addEventListener("offline", offline);
    window.addEventListener("online", startIfEligible);
    window.addEventListener("pageshow", startIfEligible);
    return () => {
      disposed = true;
      nativeLifecycleReady.current = !Capacitor.isNativePlatform();
      void removeNativeListener?.();
      instance.stop();
      requestRef.current?.abort();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pause);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", startIfEligible);
      window.removeEventListener("pageshow", startIfEligible);
    };
  }, [saveMute, startIfEligible]);
  useEffect(() => {
    if (!allowed) {
      session.current?.stop();
      requestRef.current?.abort();
    }
  }, [allowed]);
  useEffect(() => {
    session.current?.stop();
    requestRef.current?.abort();
    updateTurns(() => []);
    recipe.current = null;
    cookingPaused.current = false;
    try {
      manualMuted.current =
        !!user?.id && localStorage.getItem(`mealmate:voice-muted:${user.id}`) === "1";
    } catch {
      manualMuted.current = false;
    }
  }, [user?.id, updateTurns]);
  useEffect(() => {
    if (allowed && Capacitor.isNativePlatform() && !Capacitor.isPluginAvailable("App")) {
      session.current?.stop("error", "Update the MealMate app to enable hands-free Mia.");
      return;
    }
    startIfEligible();
  }, [allowed, user?.id, startIfEligible]);

  return (
    <MiaContext.Provider
      value={{
        turns,
        busy,
        ask,
        retry,
        voice,
        startVoice,
        stopVoice,
        pauseVoice,
        resumeVoice,
        endConversation: () => session.current?.endConversation(),
        setRecipe,
      }}
    >
      {children}
      {allowed && <MiaVoiceControls />}
    </MiaContext.Provider>
  );
}
