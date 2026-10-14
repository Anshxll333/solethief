import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

// Module-level state: survives React unmounting (SPA navigation) but resets on full browser refresh
let norenHasPlayed = false;

export default function OpeningCurtain() {
  const containerRef = useRef(null);
  const leftPanelRef = useRef(null);
  const rightPanelRef = useRef(null);
  const textRef = useRef(null);
  const isAnimatingRef = useRef(false);
  const tlRef = useRef(null);
  
  // Initialize visibility based on whether it has already played in this session
  const [isVisible, setIsVisible] = useState(() => !norenHasPlayed && !window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    // If it already played this session, skip entirely
    if (norenHasPlayed) {
      return;
    }

    return () => {
      if (tlRef.current) tlRef.current.kill();
    };
  }, []);

  const handlePointerDown = () => {
    // Ignore spam clicks or if already played
    if (isAnimatingRef.current || norenHasPlayed) return;
    
    isAnimatingRef.current = true;

    tlRef.current = gsap.timeline({
      onComplete: () => {
        norenHasPlayed = true;
        if (typeof window !== 'undefined') window.__solethief_noren_played = true;
        setIsVisible(false);
      }
    });

    // First fade out the text quickly (Tension: 0.0s - 0.25s)
    tlRef.current.to(textRef.current, {
      opacity: 0,
      duration: 0.25,
      ease: "power2.inOut",
      delay: 0.1 
    });

    // Fabric opening physics: 0.25s - 1.85s (Total pull duration ~1.6s)
    // By anchoring edges and animating scaleX: 0, we simulate fabric gathering
    tlRef.current.to(leftPanelRef.current, {
      scaleX: 0,
      skewX: "-12deg", // Deep swing outward at the bottom for heavy fabric lag
      backgroundSize: "20% 100%, 200px 200px", // Bunches up the vertical fabric folds
      duration: 1.6,
      ease: "power3.inOut" // Natural cinematic curve
    }, "-=0.05") 
    .to(rightPanelRef.current, {
      scaleX: 0,
      skewX: "12deg", 
      backgroundSize: "20% 100%, 200px 200px",
      duration: 1.6,
      ease: "power3.inOut"
    }, "<");
  };

  if (!isVisible) return null;

  return (
    <div className="norenContainer" role="button" tabIndex={0} aria-label="Enter SoleThief" ref={containerRef} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handlePointerDown(); } }} onPointerDown={handlePointerDown} style={{ cursor: 'pointer' }}>
      <div className="norenPanel norenLeft" ref={leftPanelRef}></div>
      <div className="norenPanel norenRight" ref={rightPanelRef}></div>
      
      <div className="norenContent" ref={textRef}>
        <h2 className="norenTitle">SOLETHIEF</h2>
        <p className="norenSubtitle">CURATED STREET CULTURE.</p>
        <span className="norenPrompt">TAP TO STEP INSIDE</span>
      </div>
    </div>
  );
}
