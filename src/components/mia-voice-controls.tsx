import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Mic, MicOff, Volume2, Loader2 } from "lucide-react";
import { useMia } from "@/hooks/use-mia";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const labels = {
  muted: "Microphone muted",
  loading: "Loading offline voice engine…",
  waiting: "Listening for “Mia”",
  listening: "Listening to you…",
  thinking: "Mia is thinking…",
  speaking: "Mia is speaking…",
  paused: "Hands-free paused",
  denied: "Microphone permission denied",
  error: "Hands-free unavailable",
};
export function MiaVoiceControls({ embedded = false }: { embedded?: boolean }) {
  const { voice, startVoice, stopVoice, endConversation, turns } = useMia();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (embedded) return;
    const root = document.documentElement;
    const update = () =>
      root.style.setProperty(
        "--mia-controls-h",
        `${panel.current?.getBoundingClientRect().height ?? 0}px`,
      );
    root.dataset["miaControls"] = "visible";
    const observer = new ResizeObserver(update);
    if (panel.current) observer.observe(panel.current);
    update();
    return () => {
      observer.disconnect();
      delete root.dataset["miaControls"];
      root.style.removeProperty("--mia-controls-h");
    };
  }, [embedded]);
  const [consentOpen, setConsentOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const active = ["loading", "waiting", "listening", "thinking", "speaking"].includes(voice.state);
  const conversation = ["listening", "thinking", "speaking"].includes(voice.state);
  const lastAnswer = turns.at(-1)?.answer;
  function enable() {
    // A user who muted Mia can explicitly re-enable listening.
    setConsentOpen(true);
  }
  return (
    <aside
      ref={panel}
      className={embedded ? "cooking-mia" : "mia-voice-panel"}
      aria-label="Hands-free Mia"
    >
      <p className="mia-voice-provider">Voice by ElevenLabs · Mic audio stays on device</p>
      <div className="mia-voice-bar">
        <button
          className="mia-voice-status"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {voice.state === "speaking" ? (
            <Volume2 size={17} />
          ) : active ? (
            <Mic size={17} />
          ) : (
            <MicOff size={17} />
          )}
          <span role="status">{labels[voice.state]}</span>
          {voice.state === "loading" && <Loader2 className="animate-spin" size={15} />}
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-label="Hands-free Mia"
          className="mia-voice-toggle"
          data-active={active}
          onClick={() => (active ? stopVoice() : enable())}
        >
          {active ? "On" : "Off"}
        </button>
        {active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={stopVoice}
            aria-label="Mute Mia microphone immediately"
          >
            <MicOff size={17} /> Mute
          </Button>
        )}
      </div>
      {(expanded || conversation || voice.error) && (
        <div className="mia-voice-detail">
          {voice.transcript && <p className="mia-voice-transcript">You: {voice.transcript}</p>}
          {voice.state === "speaking" && lastAnswer && (
            <p className="mia-voice-reply">{lastAnswer}</p>
          )}
          {voice.error && <p role="alert">{voice.error}</p>}
          {voice.state === "denied" && (
            <p>
              Allow microphone access in your browser or Android app settings, then enable
              hands-free again.
            </p>
          )}
          <p>
            English · Mia listens while MealMate is open. Microphone audio stays on this device;
            question text goes to Mia and reply text goes to ElevenLabs for speech. Say “thanks Mia”
            to end the conversation.
          </p>
          <div className="flex flex-wrap gap-3">
            {conversation && (
              <button className="underline" onClick={endConversation}>
                End conversation
              </button>
            )}
            <Link className="underline" to="/chat">
              Open Mia chat
            </Link>
          </div>
        </div>
      )}
      <Dialog open={consentOpen} onOpenChange={setConsentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cook hands-free with Mia</DialogTitle>
            <DialogDescription>
              While MealMate is active, Mia uses your microphone to detect “Mia” or “Hi Mia” and
              hear follow-ups. Speech is recognised locally in English. The first use downloads a
              roughly 40 MB voice model.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Microphone audio is never recorded or uploaded by MealMate. After activation, question
              text and conversation history go to Mia’s AI service, using your saved pantry,
              preferences and current recipe to help answer.
            </p>
            <p>
              Mia’s reply text is sent to ElevenLabs to generate speech. Keep this screen open.
              Closing MealMate, switching apps, locking the screen or Android suspension pauses
              listening; it resumes when you return unless you have muted Mia.
            </p>
            <p>
              The microphone indicator stays visible while enabled. Mute stops capture and spoken
              replies immediately. You can continue asking questions without pressing a microphone
              button.
            </p>
          </div>
          <Button
            onClick={() => {
              setConsentOpen(false);
              setExpanded(true);
              startVoice();
            }}
          >
            Enable hands-free and allow microphone
          </Button>
          <Button variant="ghost" onClick={() => setConsentOpen(false)}>
            Keep microphone off
          </Button>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
