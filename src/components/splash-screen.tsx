import { useEffect, useState } from "react";
import logo from "@/assets/mealmate-logo.png.asset.json";

const KEY = "mealmate.splash.shown";

/** Branded launch splash: once per app launch (session), never on in-app navigation. */
export function SplashScreen() {
  const [phase, setPhase] = useState<"hidden" | "show" | "leave">("hidden");

  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, "1");
    } catch {
      return;
    }
    setPhase("show");
    const t1 = window.setTimeout(() => setPhase("leave"), 500);
    const t2 = window.setTimeout(() => setPhase("hidden"), 750);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  if (phase === "hidden") return null;
  return (
    <div className="splash-screen" data-leaving={phase === "leave"} aria-hidden>
      <img src={logo.url} alt="" width={112} height={112} className="splash-logo" />
      <p className="splash-tagline">Discover. Plan. Eat better.</p>
    </div>
  );
}
