bash

mkdir -p /home/claude/coffee-ring/src/scenes && cd /home/claude/coffee-ring

cat > package.json <<'EOF'
{
  "name": "coffee-ring-video",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "remotion studio",
    "render": "remotion render src/index.ts CoffeeRing out/coffee-ring.mp4"
  },
  "dependencies": {
    "@remotion/cli": "4.0.528",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "remotion": "4.0.528"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "typescript": "^5.6.0"
  }
}
EOF

cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "noEmit": true
  },
  "include": ["src"]
}
EOF

cat > src/index.ts <<'EOF'
import {registerRoot} from 'remotion';
import {RemotionRoot} from './Root';

registerRoot(RemotionRoot);
EOF

cat > src/palette.ts <<'EOF'
export const W = 1080;
export const H = 1920;

export const C = {
  cream: '#F4EBDD',
  creamDark: '#E6D7BE',
  glass: '#EFE8D8',
  wood: '#EAD9BD',
  woodLine: '#D6BF9B',
  coffee: '#4A2C1D',
  coffeeMid: '#6E4530',
  coffeeLight: '#A87A55',
  coffeeTan: '#C9A47F',
  ink: '#2B1A12',
  teal: '#3C8D89',
  tealSoft: '#A9CBC6',
  paper: '#FAF5EA',
};

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const prog = (f: number, a: number, b: number) => clamp01((f - a) / (b - a));
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOut = (t: number) => {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const easeInOutQuint = (t: number) => {
  t = clamp01(t);
  return t < 0.5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2;
};

// Deterministic random (mulberry32) so every render is identical.
export const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
EOF

cat > src/Shell.tsx <<'EOF'
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {C} from './palette';

export const FONT = 'Poppins, "Helvetica Neue", Helvetica, Arial, sans-serif';

// Background + paper-grain overlay. The camera lives inside this.
export const SceneShell: React.FC<{bg?: string; children: React.ReactNode}> = ({
  bg = C.cream,
  children,
}) => (
  <AbsoluteFill style={{backgroundColor: bg, overflow: 'hidden'}}>
    {children}
    <svg width={1080} height={1920} style={{position: 'absolute', left: 0, top: 0}}>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="1080" height="1920" filter="url(#grain)" opacity="0.08" style={{mixBlendMode: 'multiply'}} />
    </svg>
  </AbsoluteFill>
);

// The drawing surface. overflow: visible so the camera can zoom far out.
export const World: React.FC<{children: React.ReactNode}> = ({children}) => (
  <svg
    width={1080}
    height={1920}
    viewBox="0 0 1080 1920"
    style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}
  >
    {children}
  </svg>
);

export const Backdrop: React.FC<{fill: string}> = ({fill}) => (
  <rect x={-9000} y={-9000} width={18000} height={18000} fill={fill} />
);
EOF

cat > src/Camera.tsx <<'EOF'
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {easeInOut, lerp, W, H} from './palette';

export type Key = {
  f: number; // frame
  s: number; // zoom (1 = full frame)
  fx?: number; // world point the camera looks at
  fy?: number;
  r?: number; // roll in degrees
  ease?: (t: number) => number; // easing of the segment that ENDS at this key
};

export const camAt = (frame: number, keys: Key[]) => {
  let a = keys[0];
  let b = keys[0];
  let p = 0;
  const last = keys[keys.length - 1];
  if (frame >= last.f) {
    a = b = last;
  } else if (frame > keys[0].f) {
    for (let i = 0; i < keys.length - 1; i++) {
      if (frame <= keys[i + 1].f) {
        a = keys[i];
        b = keys[i + 1];
        p = (frame - a.f) / (b.f - a.f);
        break;
      }
    }
  }
  const e = (b.ease ?? easeInOut)(p);
  return {
    s: Math.exp(lerp(Math.log(a.s), Math.log(b.s), e)), // zoom in log space = even-feeling zooms
    fx: lerp(a.fx ?? W / 2, b.fx ?? W / 2, e),
    fy: lerp(a.fy ?? H / 2, b.fy ?? H / 2, e),
    r: lerp(a.r ?? 0, b.r ?? 0, e),
  };
};

export const Camera: React.FC<{frame: number; keys: Key[]; children: React.ReactNode}> = ({
  frame,
  keys,
  children,
}) => {
  const {s, fx, fy, r} = camAt(frame, keys);
  const rad = (r * Math.PI) / 180;
  const dx = fx - W / 2;
  const dy = fy - H / 2;
  // keep the focus point in the centre of the frame
  const tx = -s * (Math.cos(rad) * dx - Math.sin(rad) * dy);
  const ty = -s * (Math.sin(rad) * dx + Math.cos(rad) * dy);
  return (
    <AbsoluteFill
      style={{
        transformOrigin: '50% 50%',
        transform: `translate(${tx}px, ${ty}px) rotate(${r}deg) scale(${s})`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
EOF

cat > src/timeline.ts <<'EOF'
export const FPS = 30;

// One entry per scene. `sec` is the on-screen time; `text` is the narration line (also the captions).
export const BEATS = [
  {id: 'Ring', sec: 4, text: 'Spilled coffee should dry into an even stain. It never does.'},
  {id: 'FreshDrop', sec: 4, text: 'A fresh drop is a smooth, even disc.'},
  {id: 'Drying', sec: 5, text: 'But as it dries, the middle fades and the edge turns dark. Where did the middle go?'},
  {id: 'PinnedEdge', sec: 6, text: "The edge is stuck to the table, and it's thin, so water leaves there first."},
  {id: 'Flow', sec: 8, text: "The stuck edge can't shrink, so water rushes outward from the middle, dragging coffee like a river dragging leaves."},
  {id: 'Pile', sec: 6, text: "When the water's gone, every particle is parked at the edge. That's the ring."},
  {id: 'EggJam', sec: 5, text: 'In 2011, scientists made it vanish. Swap round particles for egg-shaped ones.'},
  {id: 'TwoStains', sec: 6, text: 'Eggs jam together at the surface and never reach the edge. The stain dries flat.'},
  {id: 'Cafe', sec: 6, text: "Next time you spill coffee, you're watching a river that flows for minutes. Send this to a coffee drinker."},
];

export const TOTAL_FRAMES = BEATS.reduce((n, b) => n + b.sec * FPS, 0);
EOF

cat > src/Captions.tsx <<'EOF'
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {BEATS, FPS} from './timeline';
import {C, clamp01, easeOut} from './palette';
import {FONT} from './Shell';

// 2-3 words at a time, one bold word, top of the frame, lower third left empty.
const chunkWords = (text: string): string[] => {
  const words = text.split(' ');
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    const left = words.length - i;
    const n = left <= 3 ? left : left === 4 ? 2 : 3;
    out.push(words.slice(i, i + n).join(' '));
    i += n;
  }
  return out;
};

const boldIndex = (words: string[]) => {
  let best = 0;
  words.forEach((w, i) => {
    if (w.replace(/[^a-zA-Z0-9-]/g, '').length > words[best].replace(/[^a-zA-Z0-9-]/g, '').length) best = i;
  });
  return best;
};

export const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  let start = 0;
  for (const beat of BEATS) {
    const dur = beat.sec * FPS;
    if (frame < start + dur) {
      const local = frame - start;
      const chunks = chunkWords(beat.text);
      const per = dur / chunks.length;
      const idx = Math.min(chunks.length - 1, Math.floor(local / per));
      const t = local - idx * per;
      const pop = easeOut(clamp01(t / 6));
      const words = chunks[idx].split(' ');
      const bi = boldIndex(words);
      return (
        <AbsoluteFill style={{justifyContent: 'flex-start', alignItems: 'center', paddingTop: 170}}>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 92,
              lineHeight: 1.1,
              textAlign: 'center',
              color: C.ink,
              opacity: pop,
              scale: String(0.86 + 0.14 * pop),
              maxWidth: 920,
              WebkitTextStroke: `16px ${C.cream}`,
              paintOrder: 'stroke fill',
            }}
          >
            {words.map((w, i) => (
              <span key={i} style={{fontWeight: i === bi ? 900 : 500}}>
                {w}
                {i < words.length - 1 ? ' ' : ''}
              </span>
            ))}
          </div>
        </AbsoluteFill>
      );
    }
    start += dur;
  }
  return null;
};
EOF
echo done
