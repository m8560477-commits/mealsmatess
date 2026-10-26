import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

void import("@/lib/billing/revenuecat.client").then(({ startNativeBillingIdentity }) =>
  startNativeBillingIdentity(),
);

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
});
