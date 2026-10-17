import React from "react";

export interface ProduceFlipGraphicProps {
  produceType?: string | null;
  side: "front" | "back";
}

/**
 * Custom vector graphics depicting the front (top view) and back (underside/ground spot)
 * of produce (Avocado & Watermelon).
 */
export const ProduceFlipGraphic: React.FC<ProduceFlipGraphicProps> = ({
  produceType = "watermelon",
  side,
}) => {
  const isWatermelon = produceType === "watermelon";

  if (isWatermelon) {
    if (side === "front") {
      // Watermelon TOP VIEW: Deep forest green rind with dark jagged stripes, small coiled green stem
      return (
        <svg viewBox="0 0 100 100" width="68" height="68" style={{ filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.3))" }}>
          <defs>
            <radialGradient id="wm-front-grad" cx="40%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#489650" />
              <stop offset="70%" stopColor="#2E6934" />
              <stop offset="100%" stopColor="#1E4723" />
            </radialGradient>
            <linearGradient id="wm-stripe" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#133617" />
              <stop offset="100%" stopColor="#0B230E" />
            </linearGradient>
          </defs>
          {/* Main Melon Body */}
          <circle cx="50" cy="50" r="42" fill="url(#wm-front-grad)" stroke="#1B3D20" strokeWidth="2" />
          {/* Jagged Stripes */}
          <path d="M 50 10 Q 42 30 46 50 Q 52 70 50 90" stroke="url(#wm-stripe)" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.85" />
          <path d="M 30 18 Q 22 35 25 55 Q 30 75 32 84" stroke="url(#wm-stripe)" strokeWidth="5.5" strokeLinecap="round" fill="none" opacity="0.85" />
          <path d="M 70 18 Q 78 35 75 55 Q 70 75 68 84" stroke="url(#wm-stripe)" strokeWidth="5.5" strokeLinecap="round" fill="none" opacity="0.85" />
          <path d="M 16 32 Q 10 50 14 68" stroke="url(#wm-stripe)" strokeWidth="4.5" strokeLinecap="round" fill="none" opacity="0.85" />
          <path d="M 84 32 Q 90 50 86 68" stroke="url(#wm-stripe)" strokeWidth="4.5" strokeLinecap="round" fill="none" opacity="0.85" />
          {/* Curled Top Stem */}
          <path d="M 50 14 Q 52 6 58 5 Q 63 4 60 9 Q 56 12 50 14" fill="#8FBC8F" stroke="#2E5A33" strokeWidth="1" />
        </svg>
      );
    }

    // Watermelon UNDERSIDE VIEW: Creamy buttery-yellow ground/field spot with brown pollination webbing
    return (
      <svg viewBox="0 0 100 100" width="68" height="68" style={{ filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.3))" }}>
        <defs>
          <radialGradient id="wm-back-grad" cx="45%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#F5D547" />
            <stop offset="45%" stopColor="#E6C035" />
            <stop offset="75%" stopColor="#4A854C" />
            <stop offset="100%" stopColor="#224E26" />
          </radialGradient>
        </defs>
        {/* Base with field spot radiating */}
        <circle cx="50" cy="50" r="42" fill="url(#wm-back-grad)" stroke="#224E26" strokeWidth="2" />
        {/* Rind stripes fading into the field spot */}
        <path d="M 50 8 Q 44 20 46 28" stroke="#1A421D" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.6" />
        <path d="M 28 16 Q 22 28 26 38" stroke="#1A421D" strokeWidth="4.5" strokeLinecap="round" fill="none" opacity="0.6" />
        <path d="M 72 16 Q 78 28 74 38" stroke="#1A421D" strokeWidth="4.5" strokeLinecap="round" fill="none" opacity="0.6" />
        {/* Sweet Sugar Webbing / Bee-sting scars */}
        <path d="M 42 45 Q 48 42 55 48 Q 62 52 58 60" stroke="#7A5813" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.75" />
        <path d="M 46 54 Q 52 58 48 66" stroke="#7A5813" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.7" />
        <path d="M 38 52 Q 44 50 46 54" stroke="#7A5813" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.6" />
        {/* Buttery highlight center */}
        <ellipse cx="48" cy="52" rx="16" ry="14" fill="#FFF275" opacity="0.45" />
      </svg>
    );
  }

  // Avocado graphics
  if (side === "front") {
    // Avocado FRONT / WHOLE: Dark pebbled skin pear shape with top stem
    return (
      <svg viewBox="0 0 100 100" width="68" height="68" style={{ filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.3))" }}>
        <defs>
          <radialGradient id="avo-skin" cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#3C4B37" />
            <stop offset="60%" stopColor="#253222" />
            <stop offset="100%" stopColor="#141D12" />
          </radialGradient>
        </defs>
        {/* Pear Shape Body */}
        <path
          d="M 50 14 C 42 14 36 24 34 38 C 30 52 24 64 24 74 C 24 88 35 94 50 94 C 65 94 76 88 76 74 C 76 64 70 52 66 38 C 64 24 58 14 50 14 Z"
          fill="url(#avo-skin)"
          stroke="#10180F"
          strokeWidth="2"
        />
        {/* Pebbled skin texture dots */}
        <circle cx="44" cy="40" r="1.5" fill="#586E52" opacity="0.6" />
        <circle cx="56" cy="48" r="1.5" fill="#586E52" opacity="0.6" />
        <circle cx="38" cy="62" r="1.5" fill="#586E52" opacity="0.6" />
        <circle cx="60" cy="70" r="1.5" fill="#586E52" opacity="0.6" />
        <circle cx="48" cy="78" r="1.5" fill="#586E52" opacity="0.6" />
        {/* Top button stem */}
        <ellipse cx="50" cy="14" rx="4" ry="2.5" fill="#755B32" stroke="#4A371B" strokeWidth="1" />
      </svg>
    );
  }

  // Avocado UNDERSIDE / CUT HALF: Golden lime flesh with circular pit cavity
  return (
    <svg viewBox="0 0 100 100" width="68" height="68" style={{ filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.3))" }}>
      <defs>
        <radialGradient id="avo-flesh" cx="50%" cy="65%" r="55%">
          <stop offset="0%" stopColor="#F9EDB3" />
          <stop offset="55%" stopColor="#D4E487" />
          <stop offset="85%" stopColor="#7E9F49" />
          <stop offset="100%" stopColor="#253222" />
        </radialGradient>
        <radialGradient id="avo-seed" cx="40%" cy="38%" r="60%">
          <stop offset="0%" stopColor="#9C6B3E" />
          <stop offset="70%" stopColor="#674322" />
          <stop offset="100%" stopColor="#3E2410" />
        </radialGradient>
      </defs>
      {/* Outer Rind Border */}
      <path
        d="M 50 14 C 42 14 36 24 34 38 C 30 52 24 64 24 74 C 24 88 35 94 50 94 C 65 94 76 88 76 74 C 76 64 70 52 66 38 C 64 24 58 14 50 14 Z"
        fill="url(#avo-flesh)"
        stroke="#182316"
        strokeWidth="3"
      />
      {/* Central Round Pit */}
      <circle cx="50" cy="66" r="15" fill="url(#avo-seed)" stroke="#3E2410" strokeWidth="1.5" />
      {/* Pit reflection highlight */}
      <ellipse cx="46" cy="62" rx="4" ry="2.5" fill="#DDB282" opacity="0.65" transform="rotate(-20 46 62)" />
    </svg>
  );
};
