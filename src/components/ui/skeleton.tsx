import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "relative overflow-hidden rounded-md bg-muted skeleton-shimmer",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
