import { cn } from "@/lib/utils";

export type MascotMood = "happy" | "celebrate" | "thinking";

/**
 * MealMate's mascot — a friendly leaf-green blob with a sprout.
 * Pure SVG + CSS keyframes (see styles.css), themeable via design tokens:
 * body = primary, accents = ember/ink.
 */
export function Mascot({
  size = 64,
  mood = "happy",
  animate = true,
  className,
}: {
  size?: number;
  mood?: MascotMood;
  animate?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="MealMate mascot"
      className={cn(animate && "mascot-float", className)}
    >
      {/* sprout */}
      <path d="M32 15c-1-5 2-9 7-10 1 5-2 9-7 10Z" className="fill-primary" />
      <path d="M32 15c1-4-1-8-6-9-1 4 1 8 6 9Z" className="fill-ember" />
      {/* arms */}
      {mood === "celebrate" ? (
        <>
          <path d="M13 36c-5-2-7-8-5-13 3 2 6 7 7 12Z" className="fill-primary" />
          <path d="M51 36c5-2 7-8 5-13-3 2-6 7-7 12Z" className="fill-primary" />
        </>
      ) : (
        <>
          <ellipse cx="12" cy="43" rx="4" ry="6" className="fill-primary" />
          <ellipse cx="52" cy="43" rx="4" ry="6" className="fill-primary" />
        </>
      )}
      {/* body */}
      <ellipse cx="32" cy="40" rx="21" ry="19" className="fill-primary" />
      <ellipse cx="32" cy="47" rx="13" ry="9" className="fill-primary-foreground opacity-20" />
      {/* eyes */}
      <g className={cn(animate && "mascot-eyes")}>
        <circle cx="25" cy="36" r="4.5" className="fill-primary-foreground" />
        <circle cx="39" cy="36" r="4.5" className="fill-primary-foreground" />
        <circle cx="25.8" cy="36.8" r="2" className="fill-ink" />
        <circle cx="39.8" cy="36.8" r="2" className="fill-ink" />
      </g>
      {/* mouth */}
      {mood === "thinking" ? (
        <circle cx="32" cy="47" r="2" className="fill-ink opacity-70" />
      ) : (
        <path
          d="M26 45q6 5 12 0"
          strokeWidth={2.2}
          strokeLinecap="round"
          className="fill-none stroke-ink"
        />
      )}
      {/* feet */}
      <ellipse cx="24" cy="58" rx="6" ry="3" className="fill-ink" />
      <ellipse cx="40" cy="58" rx="6" ry="3" className="fill-ink" />
      {/* mood extras */}
      {mood === "celebrate" && (
        <>
          <path
            d="M8 14l1.5 3.5L13 19l-3.5 1.5L8 24l-1.5-3.5L3 19l3.5-1.5Z"
            className="fill-ember"
          />
          <path
            d="M56 10l1.2 2.8L60 14l-2.8 1.2L56 18l-1.2-2.8L52 14l2.8-1.2Z"
            className="fill-ember"
          />
        </>
      )}
      {mood === "thinking" && (
        <g>
          <circle cx="51" cy="15" r="7" className="fill-card stroke-border" strokeWidth={1.5} />
          <text x="51" y="18.5" textAnchor="middle" fontSize="9" fontWeight="bold" className="fill-foreground">
            ?
          </text>
        </g>
      )}
    </svg>
  );
}
