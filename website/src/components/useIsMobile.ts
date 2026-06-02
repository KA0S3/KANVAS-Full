import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 860;
const MOBILE_SHAPE_QUERY = "(orientation: portrait) and (max-aspect-ratio: 4/5)";

function getMobileQuery() {
  return `(max-width: ${MOBILE_BREAKPOINT}px) and ${MOBILE_SHAPE_QUERY}`;
}

function getIsMobile() {
  if (typeof window === "undefined") return false;
  return window.matchMedia(getMobileQuery()).matches;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(getIsMobile);

  useEffect(() => {
    const mediaQuery = window.matchMedia(getMobileQuery());
    const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);

    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
}
