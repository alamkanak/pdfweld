import { useEffect, useRef, useState } from "react";
export function useVisible(margin = "500px") {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: margin },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [margin]);
  return { ref, visible };
}
