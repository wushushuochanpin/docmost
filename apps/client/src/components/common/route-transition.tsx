import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * Wraps children with a subtle fade-in transition on route change.
 * Place inside <Routes> or around the main content area.
 */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [displayChildren, setDisplayChildren] = useState(children);
  const [transitionKey, setTransitionKey] = useState(location.pathname);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (location.pathname !== transitionKey) {
      setIsTransitioning(true);
      const timeout = setTimeout(() => {
        setDisplayChildren(children);
        setTransitionKey(location.pathname);
        // Trigger fade-in on next frame
        requestAnimationFrame(() => {
          setIsTransitioning(false);
        });
      }, 80); // Brief fade-out duration

      return () => clearTimeout(timeout);
    } else {
      setDisplayChildren(children);
    }
  }, [children, location.pathname, transitionKey]);

  return (
    <div
      style={{
        opacity: isTransitioning ? 0 : 1,
        transition: "opacity 120ms ease-in-out",
        minHeight: "100%",
      }}
    >
      {displayChildren}
    </div>
  );
}
