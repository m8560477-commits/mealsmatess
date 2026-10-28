import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { listenForNativeSignIn } from "@/lib/native-auth";

/** Completes sign-up in the Android app when the in-app browser returns via deep link. */
export function NativeAuthListener() {
  const navigate = useNavigate();

  useEffect(
    () =>
      listenForNativeSignIn(
        () => {
          toast.success("Welcome to MealMate!");
          void navigate({ to: "/", replace: true });
        },
        (error) => {
          console.error("[Native auth] Could not finish sign-up:", error);
          toast.error(
            error instanceof Error && error.message
              ? error.message
              : "Couldn't finish sign-up. Please try again.",
          );
        },
      ),
    [navigate],
  );

  return null;
}
