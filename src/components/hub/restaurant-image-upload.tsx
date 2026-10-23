import { useId, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { uploadRestaurantMedia } from "@/lib/restaurants.functions";
import { MAX_RESTAURANT_IMAGE_BYTES, RESTAURANT_IMAGE_TYPES } from "@/lib/restaurant-media";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export function RestaurantImageUpload({
  restaurantId,
  kind,
  label,
  value,
  onUploaded,
  onBusyChange,
}: {
  restaurantId: string;
  kind: "logo" | "cover" | "menu-item";
  label: string;
  value?: string | null;
  onUploaded: (url: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const id = useId();
  const upload = useServerFn(uploadRestaurantMedia);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {value ? (
        <img
          src={value}
          alt={label}
          className="h-28 w-full rounded-xl bg-muted object-cover"
          loading="lazy"
        />
      ) : (
        <div className="grid h-20 place-items-center rounded-xl border border-dashed border-border">
          <ImagePlus className="size-6 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
      <Input
        id={id}
        type="file"
        accept={RESTAURANT_IMAGE_TYPES.join(",")}
        disabled={busy}
        aria-describedby={`${id}-hint`}
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file || busy) return;
          if (
            !RESTAURANT_IMAGE_TYPES.some((type) => type === file.type) ||
            file.size > MAX_RESTAURANT_IMAGE_BYTES
          ) {
            toast.error("Choose a JPEG, PNG or WebP image smaller than 2MB.");
            return;
          }
          setBusy(true);
          onBusyChange?.(true);
          try {
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(new Error("Could not read the image."));
              reader.readAsDataURL(file);
            });
            const result = await upload({
              data: { restaurantId, kind, fileName: file.name, contentType: file.type, base64 },
            });
            onUploaded(result.url);
            toast.success("Photo uploaded");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not upload the photo.");
          } finally {
            setBusy(false);
            onBusyChange?.(false);
          }
        }}
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        Public restaurant photo · JPEG, PNG or WebP · up to 2MB
      </p>
      {busy && (
        <p role="status" className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Uploading photo…
        </p>
      )}
    </div>
  );
}
