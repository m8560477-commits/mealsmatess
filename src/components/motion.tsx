import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MotionReveal({
  children,
  className,
  delay = 0,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode; delay?: number }) {
  return (
    <div
      className={cn("motion-reveal", className)}
      style={{ "--motion-delay": `${delay}ms` } as CSSProperties}
      {...props}
    >
      {children}
    </div>
  );
}

export function MotionStagger({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div className={cn("motion-stagger", className)} {...props}>{children}</div>;
}

export function AnimatedNumber({ value, className }: { value: number | string; className?: string }) {
  return <span className={cn("motion-number", className)}>{value}</span>;
}
