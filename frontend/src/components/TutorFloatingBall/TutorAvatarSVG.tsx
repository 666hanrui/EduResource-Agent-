import { useEffect, useRef, useState } from 'react';

export function TutorAvatarSVG() {
  const containerRef = useRef<SVGSVGElement | null>(null);
  const [pupilOffset, setPupilOffset] = useState({ x: 0, y: 0 });
  const [isBlinking, setIsBlinking] = useState(false);

  // 1. Mouse movement tracking for pupils
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const eyeCenterX = rect.left + rect.width / 2;
      const eyeCenterY = rect.top + rect.height / 2;

      const dx = e.clientX - eyeCenterX;
      const dy = e.clientY - eyeCenterY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Max movement of pupils inside eye sockets
      const maxOffset = 1.2; 
      const angle = Math.atan2(dy, dx);
      
      const moveDistance = Math.min(maxOffset, distance / 60); // Sensitivity factor
      const offsetX = Math.cos(angle) * moveDistance;
      const offsetY = Math.sin(angle) * moveDistance;

      setPupilOffset({ x: offsetX, y: offsetY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // 2. Automated blinking timer
  useEffect(() => {
    const triggerBlink = () => {
      setIsBlinking(true);
      setTimeout(() => {
        setIsBlinking(false);
      }, 120); // Blink duration 120ms
    };

    const interval = setInterval(() => {
      if (Math.random() > 0.3) {
        triggerBlink();
      }
    }, 3500); // Check every 3.5 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <svg
      ref={containerRef}
      width="44"
      height="44"
      viewBox="0 0 40 40"
      style={{
        display: 'block',
        animation: 'avatar-breathing 4s ease-in-out infinite',
        overflow: 'visible',
      }}
    >
      <style>{`
        @keyframes avatar-breathing {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-1.0px); }
        }
      `}</style>
      
      {/* Background Soft Glow */}
      <circle cx="20" cy="20" r="22" fill="url(#bgGlow)" />

      {/* Kizuna AI Pink Heart Ribbon (Top Headband) */}
      <g style={{ transform: 'translateY(1px)' }}>
        {/* Left ear/loop of ribbon */}
        <path 
          d="M 18.5 9 C 14 3, 9 4, 12.5 10 C 13.5 11.5, 17 11, 18.5 9" 
          fill="#ff6b8b" 
          stroke="#e04d70" 
          strokeWidth="0.75" 
          strokeLinejoin="round" 
        />
        {/* Right ear/loop of ribbon */}
        <path 
          d="M 21.5 9 C 26 3, 31 4, 27.5 10 C 26.5 11.5, 23 11, 21.5 9" 
          fill="#ff6b8b" 
          stroke="#e04d70" 
          strokeWidth="0.75" 
          strokeLinejoin="round" 
        />
        {/* Ribbon center knot */}
        <circle cx="20" cy="9.5" r="1.5" fill="#ff477e" />
      </g>
      
      {/* Back Hair (Reddish-brown / Pinkish highlights) */}
      <path 
        d="M 9 15 C 9 10, 31 10, 31 15 L 33 34 C 33 36, 7 36, 7 34 Z" 
        fill="#7c2d37" 
      />
      
      {/* Headband Band */}
      <path 
        d="M 9.5 15 C 13 12.5, 27 12.5, 30.5 15" 
        fill="none" 
        stroke="#ffffff" 
        strokeWidth="1.5" 
      />

      {/* Face Skin */}
      <path 
        d="M 9.5 17 C 9.5 13, 30.5 13, 30.5 17 C 30.5 24, 27 28, 20 28 C 13 28, 9.5 24, 9.5 17 Z" 
        fill="#fff0e6" 
      />

      {/* Blushing Cheeks */}
      <ellipse cx="13" cy="22.5" rx="2.5" ry="1.2" fill="rgba(255, 107, 139, 0.4)" />
      <ellipse cx="27" cy="22.5" rx="2.5" ry="1.2" fill="rgba(255, 107, 139, 0.4)" />

      {/* Hair Bangs (Front framing face) */}
      {/* Left side strand */}
      <path d="M 9.5 15 C 9.5 20, 11 25, 11.5 26.5 C 12 24, 11 20, 11 17 Z" fill="#9c3d49" />
      {/* Right side strand */}
      <path d="M 30.5 15 C 30.5 20, 29 25, 28.5 26.5 C 28 24, 29 20, 29 17 Z" fill="#9c3d49" />
      {/* Center bangs */}
      <path d="M 12 14.5 Q 16 18 17 19.5 C 17.5 18.5, 17 15, 16 14.5 Z" fill="#9c3d49" />
      <path d="M 28 14.5 Q 24 18 23 19.5 C 22.5 18.5, 23 15, 24 14.5 Z" fill="#9c3d49" />
      <path d="M 18 14 Q 20 18 20.5 19 C 21 18, 21.5 16, 21.5 14 Z" fill="#7c2d37" />

      {/* Eyes Sockets & Blinking */}
      <g style={{ transform: isBlinking ? 'scaleY(0.05)' : 'scaleY(1)', transformOrigin: '20px 19px', transition: 'transform 0.08s ease-out' }}>
        {/* Left Eye Sclera */}
        <ellipse cx="14.5" cy="18.5" rx="3.5" ry="4.5" fill="#ffffff" stroke="#3a1c1c" strokeWidth="0.75" />
        {/* Left Iris (Sparkling Green) */}
        <g style={{ transform: `translate(${pupilOffset.x}px, ${pupilOffset.y}px)`, transition: 'transform 0.05s ease-out' }}>
          <ellipse cx="14.5" cy="18.5" rx="2.5" ry="3.5" fill="#00bfa5" />
          <ellipse cx="14.5" cy="18.5" rx="1.6" ry="2.4" fill="#00796b" />
          {/* Pupil Center */}
          <circle cx="14.5" cy="18.5" r="0.8" fill="#004d40" />
          {/* Catchlight shines */}
          <circle cx="13.7" cy="17.2" r="0.8" fill="#ffffff" />
          <circle cx="15.3" cy="19.8" r="0.4" fill="#ffffff" />
        </g>
        
        {/* Right Eye Sclera */}
        <ellipse cx="25.5" cy="18.5" rx="3.5" ry="4.5" fill="#ffffff" stroke="#3a1c1c" strokeWidth="0.75" />
        {/* Right Iris (Sparkling Green) */}
        <g style={{ transform: `translate(${pupilOffset.x}px, ${pupilOffset.y}px)`, transition: 'transform 0.05s ease-out' }}>
          <ellipse cx="25.5" cy="18.5" rx="2.5" ry="3.5" fill="#00bfa5" />
          <ellipse cx="25.5" cy="18.5" rx="1.6" ry="2.4" fill="#00796b" />
          {/* Pupil Center */}
          <circle cx="25.5" cy="18.5" r="0.8" fill="#004d40" />
          {/* Catchlight shines */}
          <circle cx="24.7" cy="17.2" r="0.8" fill="#ffffff" />
          <circle cx="26.3" cy="19.8" r="0.4" fill="#ffffff" />
        </g>
      </g>
      
      {/* Cute Eyebrows */}
      <path d="M 12 13.5 Q 14.5 12.5 16 13.2" fill="none" stroke="#5c2020" strokeWidth="0.75" strokeLinecap="round" />
      <path d="M 28 13.5 Q 25.5 12.5 24 13.2" fill="none" stroke="#5c2020" strokeWidth="0.75" strokeLinecap="round" />

      {/* Cute Little Smile */}
      <path 
        d="M 18.5 24 Q 20 25.5 21.5 24" 
        fill="none" 
        stroke="#e04d70" 
        strokeWidth="1.2" 
        strokeLinecap="round" 
      />

      <defs>
        <radialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255, 107, 139, 0.25)" />
          <stop offset="100%" stopColor="rgba(255, 107, 139, 0)" />
        </radialGradient>
      </defs>
    </svg>
  );
}
