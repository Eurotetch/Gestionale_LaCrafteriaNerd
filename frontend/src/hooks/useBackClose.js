import { useEffect, useRef } from "react";

let depthCounter = 0;

/**
 * Makes the mobile/browser "back" button close an open dialog/panel instead
 * of navigating away from the page. Supports nested levels (e.g. a dialog
 * opened on top of another dialog) — back closes the topmost one first.
 */
export function useBackClose(isOpen, close) {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!isOpen) return;
    depthCounter += 1;
    const myDepth = depthCounter;
    window.history.pushState({ __dialogDepth: myDepth }, "");

    const onPopState = (e) => {
      const newDepth = (e.state && e.state.__dialogDepth) || 0;
      if (newDepth < myDepth) closeRef.current();
    };
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
      if (depthCounter === myDepth) {
        depthCounter -= 1;
        if (window.history.state?.__dialogDepth === myDepth) {
          window.history.back();
        }
      }
    };
  }, [isOpen]);
}
