import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Image,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { runAiDiagnostics } from "@/lib/ai-diagnostics.functions";

type TestName = "backend" | "recipe" | "mia" | "image" | "database" | "storage" | "security";
type Result = {
  test: TestName;
  ok: boolean;
  detail: string;
  provider?: string;
  model?: string;
  textModel?: string;
  imageModel?: string;
  speechModel?: string;
  authentication?: string;
};

const tests: { name: TestName; label: string; description: string; icon: typeof Sparkles }[] = [
  {
    name: "backend",
    label: "Backend + provider config",
    description: "Authenticated server and selected model configuration",
    icon: Sparkles,
  },
  {
    name: "recipe",
    label: "Structured recipe output",
    description: "Live recipe generation and schema validation",
    icon: CheckCircle2,
  },
  {
    name: "mia",
    label: "Mia food response",
    description: "Live food question through the assistant model",
    icon: MessageCircle,
  },
  {
    name: "image",
    label: "Recipe image generation",
    description: "Live image model call; may use Gateway credits",
    icon: Image,
  },
  {
    name: "database",
    label: "Database read + write",
    description: "Temporary user-scoped record, read back, then delete",
    icon: Database,
  },
  {
    name: "storage",
    label: "Image storage + retrieval",
    description: "Temporary upload, signed retrieval, then cleanup",
    icon: Image,
  },
  {
    name: "security",
    label: "Auth + rate limiting",
    description: "Admin authorization and repeat-request rejection",
    icon: ShieldCheck,
  },
];

export function AiDiagnosticsTab() {
  const [results, setResults] = useState<Partial<Record<TestName, Result>>>({});
  const [busy, setBusy] = useState<TestName | null>(null);

  async function run(test: TestName) {
    setBusy(test);
    try {
      const result = await runAiDiagnostics({ data: { test } });
      setResults((current) => ({ ...current, [test]: result as Result }));
    } catch {
      setResults((current) => ({
        ...current,
        [test]: {
          test,
          ok: false,
          detail: "The protected diagnostics request failed. Check authentication and server logs.",
        },
      }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="ai-diagnostics-heading" className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle id="ai-diagnostics-heading">MealMate AI diagnostics</CardTitle>
          <CardDescription>
            Admin-only live checks. Credentials are never displayed. Image generation can incur AI
            Gateway charges.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {tests.map(({ name, label, description, icon: Icon }) => {
            const result = results[name];
            return (
              <div
                key={name}
                className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4"
              >
                <div className="flex items-start gap-3">
                  <Icon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium">{label}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                  </div>
                  {result && (
                    <Badge variant={result.ok ? "secondary" : "destructive"}>
                      {result.ok ? "Passed" : "Failed"}
                    </Badge>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  disabled={busy !== null}
                  onClick={() => void run(name)}
                  aria-label={`Run ${label} diagnostic`}
                >
                  {busy === name ? (
                    <Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" />
                  ) : null}
                  {busy === name ? "Testing…" : "Run test"}
                </Button>
                {result && (
                  <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
                    {result.detail}
                    {result.provider ? ` Provider: ${result.provider}.` : ""}
                    {result.model ? ` Model: ${result.model}.` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Database and storage tests create temporary records in your signed-in admin account and
        remove them immediately after verification.
      </p>
    </section>
  );
}
