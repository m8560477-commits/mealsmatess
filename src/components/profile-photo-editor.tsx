import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/user-avatar";
import { useProfilePhoto } from "@/hooks/use-profile-photo";
import {
  compressProfileImage,
  cropGeometry,
  profilePhotoError,
  removeProfilePhoto,
  uploadProfilePhoto,
  validateProfileImage,
  type PhotoCrop,
} from "@/lib/profile-photo";

export function ProfilePhotoEditor() {
  const { uid, photoURL } = useProfilePhoto();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [crop, setCrop] = useState<PhotoCrop>({ zoom: 1, x: 50, y: 50 });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number; crop: PhotoCrop } | null>(null);
  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source);
    },
    [source],
  );
  const loaded = dimensions.width > 0;
  const geometry = loaded ? cropGeometry(dimensions.width, dimensions.height, crop) : null;
  function choose(file?: File) {
    if (!file) return;
    setError("");
    try {
      validateProfileImage(file);
      setDimensions({ width: 0, height: 0 });
      setCrop({ zoom: 1, x: 50, y: 50 });
      setSource(URL.createObjectURL(file));
      setConfirmRemove(false);
    } catch (failure) {
      setError(profilePhotoError(failure));
    }
  }
  async function save(remove = false) {
    if (!uid || busy) return;
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      const result = remove
        ? await removeProfilePhoto(uid)
        : await uploadProfilePhoto(
            uid,
            await compressProfileImage(image.current!, crop),
            setProgress,
          );
      toast.success(remove ? "Profile picture removed" : "Profile picture updated");
      if (!result.authSynced)
        toast.info("Your photo is saved. Account synchronization will retry when you reconnect.");
      setSource(null);
      setOpen(false);
    } catch (failure) {
      setError(profilePhotoError(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="relative shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-primary"
        aria-label="Edit profile picture"
        onClick={() => {
          setOpen(true);
          setError("");
          setConfirmRemove(false);
        }}
      >
        <UserAvatar className="size-24 border-2 border-primary/40 shadow-lg" />
        <span className="absolute bottom-0 right-0 rounded-full border-2 border-background bg-primary p-2 text-primary-foreground">
          <Camera size={16} />
        </span>
      </button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) {
            setOpen(value);
            if (!value) setSource(null);
          }
        }}
      >
        <DialogContent
          className="auto-rows-max max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl"
          onInteractOutside={(event) => {
            if (busy) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <DialogTitle className="font-heading text-xl font-semibold">
            Your profile picture
          </DialogTitle>
          <DialogDescription>
            Choose a photo, then crop it to make it yours. JPG, PNG or WEBP, up to 5 MB.
          </DialogDescription>
          <input
            ref={gallery}
            aria-label="Choose profile picture from gallery"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              choose(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <input
            ref={camera}
            aria-label="Take profile picture"
            type="file"
            accept="image/*"
            capture="user"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              choose(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {source ? (
            <>
              <div
                className="relative mx-auto aspect-square w-full max-w-64 touch-none overflow-hidden rounded-full border-2 border-primary/50 bg-secondary"
                onPointerDown={(event) => {
                  if (busy || !loaded) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  drag.current = { x: event.clientX, y: event.clientY, crop };
                }}
                onPointerMove={(event) => {
                  if (!drag.current || !geometry) return;
                  const scale = event.currentTarget.clientWidth / geometry.side;
                  const { x, y, crop: initial } = drag.current;
                  const clamp = (value: number) => Math.max(0, Math.min(100, value));
                  setCrop({
                    ...initial,
                    x:
                      dimensions.width === geometry.side
                        ? 50
                        : clamp(
                            initial.x -
                              ((event.clientX - x) / scale / (dimensions.width - geometry.side)) *
                                100,
                          ),
                    y:
                      dimensions.height === geometry.side
                        ? 50
                        : clamp(
                            initial.y -
                              ((event.clientY - y) / scale / (dimensions.height - geometry.side)) *
                                100,
                          ),
                  });
                }}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
              >
                <img
                  ref={image}
                  src={source}
                  alt="Profile picture crop preview"
                  draggable={false}
                  className="absolute max-w-none select-none"
                  style={
                    geometry
                      ? {
                          width: `${(dimensions.width / geometry.side) * 100}%`,
                          height: `${(dimensions.height / geometry.side) * 100}%`,
                          left: `${(-geometry.left / geometry.side) * 100}%`,
                          top: `${(-geometry.top / geometry.side) * 100}%`,
                        }
                      : { visibility: "hidden" }
                  }
                  onLoad={(event) =>
                    setDimensions({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    })
                  }
                  onError={() => {
                    setDimensions({ width: 0, height: 0 });
                    setError("This image couldn’t be opened. Choose another JPG, PNG or WEBP.");
                  }}
                />
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Drag to reposition, or use the controls below.
              </p>
              <fieldset className="space-y-3" disabled={busy || !loaded}>
                {(
                  [
                    ["zoom", "Zoom", 1, 3, 0.01],
                    ["x", "Horizontal position", 0, 100, 1],
                    ["y", "Vertical position", 0, 100, 1],
                  ] as const
                ).map(([key, label, min, max, step]) => (
                  <label key={key} className="flex flex-col gap-1 text-sm">
                    {label}
                    <input
                      className="w-full accent-primary"
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={crop[key]}
                      onChange={(event) => setCrop({ ...crop, [key]: Number(event.target.value) })}
                    />
                  </label>
                ))}
              </fieldset>
            </>
          ) : (
            <UserAvatar className="mx-auto size-32 border-2 border-primary/30" />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              className="premium-secondary flex items-center gap-2"
              disabled={busy}
              onClick={() => gallery.current?.click()}
            >
              <ImagePlus size={16} />
              Choose photo
            </button>
            <button
              className="premium-secondary flex items-center gap-2"
              disabled={busy}
              onClick={() => camera.current?.click()}
            >
              <Camera size={16} />
              Camera
            </button>
          </div>
          {busy && (
            <div role="status" aria-live="polite">
              <p className="text-sm">
                {progress < 100 ? `Saving photo… ${progress}%` : "Updating your profile…"}
              </p>
              <progress
                aria-label="Profile picture upload progress"
                max={100}
                value={progress}
                className="w-full accent-primary"
              />
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {source && (
            <button
              className="premium-primary"
              disabled={busy || !loaded}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save picture"}
            </button>
          )}
          {photoURL && !source && (
            <div>
              {confirmRemove ? (
                <div className="space-y-2">
                  <p className="text-sm">Remove your picture and use the MealMate avatar?</p>
                  <button
                    className="premium-secondary text-destructive"
                    disabled={busy}
                    onClick={() => void save(true)}
                  >
                    Confirm removal
                  </button>
                </div>
              ) : (
                <button
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                  disabled={busy}
                  onClick={() => setConfirmRemove(true)}
                >
                  <Trash2 size={16} />
                  Remove picture
                </button>
              )}
            </div>
          )}
          <button
            className="text-sm text-muted-foreground"
            disabled={busy}
            onClick={() => {
              setSource(null);
              setOpen(false);
            }}
          >
            Cancel
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
