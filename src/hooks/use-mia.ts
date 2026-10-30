import { createContext, useContext } from "react";
import type { VisualExplanation } from "@/lib/visual.functions";
import type { MiaVoiceSnapshot } from "@/lib/mia/voice-session";

export type MiaRecipe = { name: string; steps: string[]; step: number };
export type MiaTurn = {
  id: string;
  question: string;
  answer: string;
  visual?: VisualExplanation;
  error?: string | undefined;
  visualLoading?: boolean;
  visualError?: string;
};
export type MiaContextValue = {
  turns: MiaTurn[];
  busy: boolean;
  ask: (
    text: string,
    options?: { visual?: boolean; voice?: boolean; signal?: AbortSignal },
  ) => Promise<string>;
  retry: (id: string) => Promise<void>;
  voice: MiaVoiceSnapshot;
  startVoice: () => void;
  stopVoice: () => void;
  endConversation: () => void;
  setRecipe: (recipe: MiaRecipe | null, onStep?: (step: number) => void) => void;
};
export const MiaContext = createContext<MiaContextValue | null>(null);
export function useMia() {
  const value = useContext(MiaContext);
  if (!value) throw new Error("useMia requires MiaProvider");
  return value;
}
export function useOptionalMia() {
  return useContext(MiaContext);
}
