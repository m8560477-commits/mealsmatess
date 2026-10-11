import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Film, Images, Loader2, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import type { VisualExplanation } from "@/lib/visual.functions";
import { Button } from "@/components/ui/button";

type Aspect = "16:9" | "9:16";

const DIMS: Record<Aspect, { w: number; h: number }> = {
  "16:9": { w: 1280, h: 720 },
  "9:16": { w: 720, h: 1280 },
};

function useLoadedImages(urls: (string | null)[]) {
  const [images, setImages] = useState<(HTMLImageElement | null)[]>([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      urls.map(
        (u) =>
          new Promise<HTMLImageElement | null>((resolve) => {
            if (!u) return resolve(null);
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = u;
          }),
      ),
    ).then((res) => {
      if (!cancelled) setImages(res);
    });
    return () => {
      cancelled = true;
    };
  }, [urls.join("|")]);
  return images;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function VisualExplainer({ data }: { data: VisualExplanation }) {
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [recording, setRecording] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startRef = useRef<number>(performance.now());

  const scenes = data.scenes;
  const urls = useMemo(() => scenes.map((s) => s.imageUrl), [scenes]);
  const images = useLoadedImages(urls);
  const timeline = useMemo(() => {
    let t = 0;
    return scenes.map((s) => {
      const start = t;
      t += s.durationMs;
      return { start, end: t };
    });
  }, [scenes]);
  const totalMs = timeline.at(-1)?.end ?? 0;

  const draw = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      sceneIdx: number,
      progress: number,
      fade: number,
    ) => {
      const scene = scenes[sceneIdx];
      const timing = timeline[sceneIdx];
      if (!scene || !timing) return;
      ctx.fillStyle = "#0d0b09";
      ctx.fillRect(0, 0, w, h);
      const img = images[sceneIdx];
      if (img) {
        // Ken Burns: slow zoom + drift
        const zoom = 1.06 + progress * 0.1;
        const scale = Math.max(w / img.width, h / img.height) * zoom;
        const dw = img.width * scale;
        const dh = img.height * scale;
        const dx = (w - dw) / 2 - (dw - w) * 0.12 * (progress - 0.5);
        const dy = (h - dh) / 2 - (dh - h) * 0.12 * (progress - 0.5);
        ctx.globalAlpha = fade;
        ctx.drawImage(img, dx, dy, dw, dh);
        ctx.globalAlpha = 1;
      } else {
        // Ambient animated backdrop so the visual is never static,
        // even while the scene image is still loading.
        const t = progress * Math.PI * 2;
        const cx = w * (0.5 + 0.18 * Math.cos(t));
        const cy = h * (0.42 + 0.14 * Math.sin(t));
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
        glow.addColorStop(0, "rgba(74,155,47,0.35)");
        glow.addColorStop(0.6, "rgba(240,180,0,0.10)");
        glow.addColorStop(1, "rgba(13,11,9,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
      }

      // Bottom scrim
      const grad = ctx.createLinearGradient(0, h * 0.45, 0, h);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.82)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, h * 0.45, w, h * 0.55);

      const pad = w * 0.06;
      const slide = (1 - Math.min(1, progress * 6)) * w * 0.04;

      // Heading
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#ffffff";
      const headSize = Math.round(w * (aspect === "9:16" ? 0.075 : 0.05));
      ctx.font = `700 ${headSize}px Georgia, 'Times New Roman', serif`;
      const headLines = wrapText(ctx, scene.heading, w - pad * 2);
      let y = h - pad - headLines.length * 0 - 0;
      const subSize = Math.round(w * (aspect === "9:16" ? 0.042 : 0.028));
      ctx.font = `400 ${subSize}px Helvetica, Arial, sans-serif`;
      const subLines = wrapText(ctx, scene.subtitle, w - pad * 2);
      const subBlock = subLines.length * subSize * 1.35;
      y = h - pad - subBlock;

      ctx.font = `700 ${headSize}px Georgia, 'Times New Roman', serif`;
      headLines.forEach((l, i) => {
        ctx.fillText(l, pad + slide, y - (headLines.length - i) * headSize * 1.18 - subSize * 0.6);
      });

      ctx.font = `400 ${subSize}px Helvetica, Arial, sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      subLines.forEach((l, i) => {
        ctx.fillText(l, pad + slide, y + (i + 1) * subSize * 1.3);
      });

      // Progress bar
      const overall = (timing.start + progress * scene.durationMs) / (totalMs || 1);
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(pad, h - pad * 0.45, w - pad * 2, Math.max(3, h * 0.005));
      ctx.fillStyle = "#f0b400";
      ctx.fillRect(pad, h - pad * 0.45, (w - pad * 2) * overall, Math.max(3, h * 0.005));
    },
    [scenes, images, aspect, timeline, totalMs],
  );

  // Live preview loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = DIMS[aspect];
    canvas.width = w;
    canvas.height = h;
    let raf = 0;
    const loop = () => {
      const elapsed = playing ? performance.now() - startRef.current : 0;
      const scene = timeline[index];
      if (!scene) return;
      const local = playing ? Math.min(scene.end - scene.start, elapsed) : 0;
      const progress = local / (scene.end - scene.start);
      draw(ctx, w, h, index, progress, Math.min(1, local / 500 + 0.15));
      if (playing && local >= scene.end - scene.start) {
        if (index < scenes.length - 1) {
          setIndex(index + 1);
        } else {
          // Loop automatically — the visual keeps moving on its own.
          setIndex(0);
        }
        startRef.current = performance.now();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [aspect, draw, index, playing, scenes.length, timeline]);

  // Narration
  useEffect(() => {
    const url = scenes[index]?.audioUrl;
    const el = audioRef.current;
    if (!el) return;
    if (!url || muted || !playing) {
      el.pause();
      return;
    }
    el.src = url;
    el.play().catch(() => undefined);
  }, [index, muted, playing, scenes]);

  function restart() {
    setIndex(0);
    startRef.current = performance.now();
    setPlaying(true);
  }

  async function downloadImages() {
    scenes.forEach((s, i) => {
      if (!s.imageUrl) return;
      const a = document.createElement("a");
      a.href = s.imageUrl;
      a.download = `${data.title.replace(/\W+/g, "-").toLowerCase()}-scene-${i + 1}.png`;
      a.click();
    });
    toast.success("Images downloaded");
  }

  async function recordVideo() {
    const canvas = canvasRef.current;
    if (!canvas || recording) return;
    const mime = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm"].find((m) =>
      MediaRecorder.isTypeSupported(m),
    );
    if (!mime) {
      toast.error("Video export isn't supported in this browser");
      return;
    }
    setRecording(true);
    setPlaying(false);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setRecording(false);
      toast.error("Video export isn't supported in this browser");
      return;
    }
    const { w, h } = DIMS[aspect];
    const stream = canvas.captureStream(30);
    const chunks: BlobPart[] = [];
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
    });
    rec.start();

    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        const elapsed = performance.now() - t0;
        if (elapsed >= totalMs) return resolve();
        const i = timeline.findIndex((t) => elapsed >= t.start && elapsed < t.end);
        const idx = i === -1 ? scenes.length - 1 : i;
        const timing = timeline[idx];
        if (!timing) return resolve();
        const local = elapsed - timing.start;
        draw(ctx, w, h, idx, local / (timing.end - timing.start), Math.min(1, local / 400 + 0.15));
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    rec.stop();
    await done;
    const blob = new Blob(chunks, { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${data.title.replace(/\W+/g, "-").toLowerCase()}-${aspect.replace(":", "x")}.${mime.startsWith("video/mp4") ? "mp4" : "webm"}`;
    a.click();
    URL.revokeObjectURL(a.href);
    setRecording(false);
    toast.success("Video exported");
  }

  return (
    <div className="rise-in space-y-3 rounded-3xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className="truncate font-display text-lg leading-tight">{data.title}</p>
          <p className="text-xs capitalize text-muted-foreground">
            {data.kind} • {scenes.length} scenes • {Math.round(totalMs / 1000)}s
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border p-0.5">
          {(["16:9", "9:16"] as Aspect[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAspect(a)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                aspect === a ? "bg-ink text-background" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        onClick={() => {
          startRef.current = performance.now();
          setPlaying((p) => !p);
        }}
        className={`w-full cursor-pointer rounded-2xl bg-ink ${aspect === "9:16" ? "mx-auto max-w-xs" : ""}`}
        aria-label={`Animated visual explanation: ${data.title}`}
      />
      <audio ref={audioRef} className="hidden" />

      <div className="flex flex-wrap items-center gap-2 px-1">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            startRef.current = performance.now();
            setPlaying((p) => !p);
          }}
        >
          {playing ? <Pause className="mr-1 h-4 w-4" /> : <Play className="mr-1 h-4 w-4" />}
          {playing ? "Pause" : "Play"}
        </Button>
        <Button size="sm" variant="ghost" onClick={restart} aria-label="Restart">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Unmute narration" : "Mute narration"}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
        <span className="flex-1" />
        <Button size="sm" variant="outline" onClick={downloadImages}>
          <Images className="mr-1 h-4 w-4" /> Images
        </Button>
        <Button size="sm" onClick={recordVideo} disabled={recording}>
          {recording ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Film className="mr-1 h-4 w-4" />}
          {recording ? "Exporting…" : "Download video"}
        </Button>
      </div>

      <p className="px-1 text-sm text-muted-foreground">{data.summary}</p>
      <div className="flex flex-wrap gap-1.5 px-1 pb-1">
        {scenes.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              setIndex(i);
              startRef.current = performance.now();
              setPlaying(true);
            }}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              i === index ? "border-transparent bg-primary text-primary-foreground" : "border-border hover:bg-muted"
            }`}
          >
            {i + 1}. {s.heading}
          </button>
        ))}
      </div>
      <p className="flex items-center gap-1 px-1 pb-1 text-xs text-muted-foreground">
        <Download className="h-3 w-3" /> Exports use your current aspect ratio — switch to 9:16 for social.
      </p>
    </div>
  );
}
