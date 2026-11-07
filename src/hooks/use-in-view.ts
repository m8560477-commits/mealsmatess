import { useEffect, useRef, useState } from "react";
/** Start optional work once it approaches the app's scrolling viewport. */
export function useInView(margin = "300px") {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { root: document.getElementById("app-scroll"), rootMargin: margin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [margin, visible]);
  return { ref, visible };
}
