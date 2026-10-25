import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, CalendarDays, Flame, Loader2, Plus, Utensils, ImagePlus } from "lucide-react";
import { scanKitchen, scanDish, type ScannedDish } from "@/lib/ai.functions";
import { useSession } from "@/hooks/use-session";
import { prepareScanPhoto } from "@/lib/scan-photo";
import { saveScannedDish, saveScannedIngredients } from "@/lib/scan-save";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/scan")({
  validateSearch: (search: Record<string, unknown>): { mode?: "ingredients" | "dish" } => ({
    mode: search["mode"] === "ingredients" ? "ingredients" : "dish",
  }),
  head: () => ({
    meta: [
      { title: "Food Scanner – MealMate" },
      {
        name: "description",
        content:
          "Point your camera at a dish to identify it, get nutrition facts, and add it to your meal planner.",
      },
      { property: "og:title", content: "Food Scanner – MealMate" },
      {
        property: "og:description",
        content: "Identify any dish, see its nutrition, and save it to your planner.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScanPage,
});

type ScannedItem = { name: string; quantity?: string; category?: string };
type Mode = "dish" | "ingredients";
const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"];

function isoLocal(d: Date) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
}

function ScanPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const savePending = useRef(false);
  const requestId = useRef(0);
  const search = Route.useSearch();
  const [mode, setMode] = useState<Mode>(search.mode ?? "dish");
  const [preview, setPreview] = useState<string | null>(null);
  const [items, setItems] = useState<ScannedItem[] | null>(null);
  const [dish, setDish] = useState<ScannedDish | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return d;
      }),
    [],
  );
  const [planDate, setPlanDate] = useState(() => isoLocal(new Date()));
  const [mealType, setMealType] = useState("Lunch");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    reset();
    pending.current = false;
    setBusy(false);
    return () => {
      // Invalidate in-flight results; this sequence counter is intentionally read at cleanup.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      requestId.current++;
    };
  }, [user?.id]);

  function reset() {
    requestId.current++;
    setScanError(null);
    setItems(null);
    setDish(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || pending.current || savePending.current || !user) return;
    pending.current = true;
    const scanId = ++requestId.current;
    setScanError(null);
    setPreview(null);
    setBusy(true);
    setItems(null);
    setDish(null);
    try {
      const dataUrl = await prepareScanPhoto(file);
      if (scanId !== requestId.current) return;
      setPreview(dataUrl);
      if (mode === "dish") {
        const found = await scanDish({ data: { imageDataUrl: dataUrl } });
        if (scanId !== requestId.current) return;
        if (!found.is_food) {
          toast.info("That doesn't look like a dish", {
            description: "Try a clear photo of a plated meal.",
          });
          setPreview(null);
          return;
        }
        setDish(found);
        if (found.meal_type && MEAL_TYPES.includes(found.meal_type)) setMealType(found.meal_type);
      } else {
        const found = await scanKitchen({ data: { imageDataUrl: dataUrl } });
        if (scanId !== requestId.current) return;
        setItems(found);
        if (found.length === 0) {
          toast.info("Didn't spot any ingredients", {
            description: "Try a clearer, closer photo.",
          });
        }
      }
    } catch (err) {
      if (scanId !== requestId.current) return;
      setScanError(err instanceof Error ? err.message : "Please try another photo.");
      toast.error("Couldn't scan that photo", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      if (scanId === requestId.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }

  async function saveDishToPlanner() {
    if (!dish || !user || savePending.current) return;
    savePending.current = true;
    const saveId = requestId.current;
    setSaving(true);
    try {
      await saveScannedDish(user.id, dish, planDate, mealType);
      if (saveId !== requestId.current) return;
      queryClient.invalidateQueries({ queryKey: ["planner"] });
      toast.success(`${dish.name} added to ${mealType}`, {
        description: `${dish.calories ?? "–"} kcal logged`,
        action: { label: "Open planner", onClick: () => navigate({ to: "/planner" }) },
      });
      reset();
    } catch (err) {
      if (saveId !== requestId.current) return;
      toast.error("Couldn't save to planner", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      savePending.current = false;
      setSaving(false);
    }
  }

  async function addAllToPantry() {
    if (!items?.length || !user || savePending.current) return;
    savePending.current = true;
    const saveId = requestId.current;
    setSaving(true);
    try {
      await saveScannedIngredients(user.id, items);
      if (saveId !== requestId.current) return;
      queryClient.invalidateQueries({ queryKey: ["pantry"] });
      toast.success(`Added ${items.length} item${items.length === 1 ? "" : "s"} to your pantry`);
      reset();
    } catch (err) {
      if (saveId !== requestId.current) return;
      toast.error("Couldn't save to pantry", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      savePending.current = false;
      setSaving(false);
    }
  }

  const macros = dish
    ? [
        { label: "Protein", value: dish.protein_g, unit: "g" },
        { label: "Carbs", value: dish.carbs_g, unit: "g" },
        { label: "Fat", value: dish.fat_g, unit: "g" },
        { label: "Fibre", value: dish.fiber_g, unit: "g" },
      ]
    : [];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-background">
          <Camera className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-3xl leading-tight">Food Scanner</h1>
          <p className="text-sm text-muted-foreground">
            Point your camera at a dish — we'll name it, count the nutrition, and plan it.
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-1 rounded-full bg-muted p-1 text-sm">
        {(
          [
            { id: "dish", label: "Identify dish", icon: Utensils },
            { id: "ingredients", label: "Log ingredients", icon: Camera },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={busy || saving}
            aria-pressed={mode === m.id}
            onClick={() => {
              setMode(m.id);
              reset();
            }}
            className={`flex items-center justify-center gap-2 rounded-full px-3 py-2 font-medium transition-colors ${
              mode === m.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            <m.icon className="h-4 w-4" />
            {m.label}
          </button>
        ))}
      </div>

      <input
        ref={inputRef}
        type="file"
        aria-label="Take a food photo"
        accept="image/*"
        capture="environment"
        disabled={busy || saving}
        className="hidden"
        onChange={handleFile}
      />

      <input
        ref={galleryRef}
        type="file"
        aria-label="Choose a food photo"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        disabled={busy || saving}
        onChange={handleFile}
      />

      {preview ? (
        <div className="mt-6 overflow-hidden rounded-3xl border border-border bg-card">
          <img src={preview} alt="Scanned food" className="max-h-64 w-full object-cover" />
        </div>
      ) : (
        <div className="mt-6 rounded-3xl border border-dashed border-border bg-card px-5 py-10 text-center">
          <Camera className="mx-auto mb-4 h-8 w-8 text-primary" />
          <p className="font-medium">Scan a photo of your food</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "dish"
              ? "Photograph a plated meal to estimate its calories and macros."
              : "Photograph your ingredients or groceries to add them to your pantry."}
          </p>
        </div>
      )}
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <Button onClick={() => inputRef.current?.click()} disabled={busy || saving}>
          <Camera className="mr-2 h-4 w-4" /> Take photo
        </Button>
        <Button
          variant="outline"
          onClick={() => galleryRef.current?.click()}
          disabled={busy || saving}
        >
          <ImagePlus className="mr-2 h-4 w-4" /> Choose photo
        </Button>
      </div>
      {scanError && (
        <p role="alert" className="mt-4 text-center text-sm text-destructive">
          {scanError}
        </p>
      )}
      {items?.length === 0 && !busy && (
        <p role="status" className="mt-4 text-center text-sm text-muted-foreground">
          No ingredients found. Try a clearer, closer photo.
        </p>
      )}

      {busy && (
        <div
          role="status"
          className="mt-6 flex items-center justify-center gap-2 text-muted-foreground"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          {mode === "dish" ? "Identifying your dish…" : "Identifying ingredients…"}
        </div>
      )}

      {dish && (
        <section className="mt-6 rounded-3xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl">{dish.name}</h2>
              <p className="text-sm text-muted-foreground">
                {[dish.cuisine, dish.portion].filter(Boolean).join(" · ")}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
              {Math.round(dish.confidence * 100)}% match
            </span>
          </div>
          {dish.description && <p className="mt-2 text-sm">{dish.description}</p>}

          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-primary px-4 py-3 text-primary-foreground">
            <Flame className="h-6 w-6" />
            <div>
              <div className="font-display text-2xl leading-none">{dish.calories ?? "–"}</div>
              <div className="text-xs opacity-80">kcal per portion (estimate)</div>
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-4 gap-2">
            {macros.map((m) => (
              <div key={m.label} className="rounded-2xl bg-muted px-2 py-3 text-center">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {m.label}
                </dt>
                <dd className="font-display text-lg">
                  {m.value ?? "–"}
                  <span className="text-xs font-normal">{m.value != null ? m.unit : ""}</span>
                </dd>
              </div>
            ))}
          </dl>

          {dish.ingredients.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {dish.ingredients.map((ing, i) => (
                <li
                  key={`${ing}-${i}`}
                  className="rounded-full border border-border px-3 py-1 text-xs"
                >
                  {ing}
                </li>
              ))}
            </ul>
          )}
          {dish.health_note && (
            <p className="mt-4 text-sm text-muted-foreground">{dish.health_note}</p>
          )}

          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <CalendarDays className="h-4 w-4" /> Save to planner
            </p>
            <div className="flex flex-wrap gap-2">
              <Select value={planDate} onValueChange={setPlanDate}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {days.map((d, i) => (
                    <SelectItem key={isoLocal(d)} value={isoLocal(d)}>
                      {i === 0
                        ? "Today"
                        : i === 1
                          ? "Tomorrow"
                          : d.toLocaleDateString(undefined, {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                            })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={mealType} onValueChange={setMealType}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEAL_TYPES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-3 flex gap-3">
              <Button onClick={saveDishToPlanner} disabled={saving} className="rounded-full">
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Add to planner
              </Button>
              <Button
                variant="secondary"
                className="rounded-full"
                disabled={saving}
                onClick={reset}
              >
                <Camera className="mr-2 h-4 w-4" />
                Scan again
              </Button>
            </div>
          </div>
        </section>
      )}

      {items && items.length > 0 && (
        <section className="mt-6">
          <h2 className="font-display text-xl">Found {items.length} ingredients</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {items.map((item, i) => (
              <li
                key={`${item.name}-${i}`}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-sm"
              >
                {item.name}
                {item.quantity ? (
                  <span className="text-muted-foreground"> · {item.quantity}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex gap-3">
            <Button onClick={addAllToPantry} disabled={saving} className="rounded-full">
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Add all to pantry
            </Button>
            <Button variant="secondary" className="rounded-full" disabled={saving} onClick={reset}>
              <Camera className="mr-2 h-4 w-4" />
              Scan again
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}
