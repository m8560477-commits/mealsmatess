import { useState } from "react";
import { useProfilePhoto } from "@/hooks/use-profile-photo";
import { cn } from "@/lib/utils";

export function UserAvatar({ className = "size-9" }: { className?: string }) {
  const { photoURL } = useProfilePhoto();
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <img
      key={photoURL}
      src={photoURL && failed !== photoURL ? photoURL : "/mascots/mascot-classic.png"}
      alt="Your MealMate profile picture"
      width={96}
      height={96}
      className={cn(
        "shrink-0 rounded-full object-cover bg-secondary motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300",
        className,
      )}
      onError={() => {
        if (photoURL) setFailed(photoURL);
      }}
      referrerPolicy="no-referrer"
    />
  );
}
