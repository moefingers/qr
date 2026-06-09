export type DotShape =
  | 'square'
  | 'dot'
  | 'rounded'
  | 'diamond'
  | 'star'
  | 'heart';
export type CornerShape = 'square' | 'rounded' | 'dot';
export type GradientType = 'linear' | 'radial';
export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export type QrMode = 'contact' | 'url' | 'text' | 'wifi' | 'emailmsg' | 'sms';

export interface VCardData {
  firstName: string;
  lastName: string;
  title: string;
  org: string;
  phoneMobile: string;
  phoneWork: string;
  email: string;
  website: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  notes: string;
}

export interface WifiData {
  ssid: string;
  password: string;
  encryption: 'WPA' | 'WEP' | 'nopass';
  hidden: boolean;
}

export interface EmailData {
  to: string;
  subject: string;
  body: string;
}

export interface SmsData {
  to: string;
  body: string;
}

export interface StyleData {
  dotShape: DotShape;
  cornerOuterShape: CornerShape;
  cornerInnerShape: CornerShape;
  dotColor: string;
  bgColor: string;
  cornerColor: string;
  useGradient: boolean;
  gradientEndColor: string;
  gradientType: GradientType;
  gradientAngle: number;
  transparentBg: boolean;
  ecLevel: ErrorCorrectionLevel;
  shapeScale: number;
  quietZone: number;
  qrSize: number;
  logoSize: number;
  logoMargin: number;
  logoBgEnabled: boolean;
  // Distance (in modules, fractional) the dodge mask extends past the
  // logo's alpha silhouette before the soft fade begins. 0 = mask flush
  // to the silhouette; 1 = mask grows by one full module on every side.
  dodgeAggressiveness: number;
  // Width of the linear fade beyond `dodgeAggressiveness`. Within
  // `aggressiveness` strength is 1.0 (full erase); past
  // `aggressiveness + softness` strength is 0 (untouched); in between
  // the dodge ramps linearly.
  dodgeSoftness: number;
  // Fraction (0..1) of a module's area that the logo bitmap must cover
  // for that module to be considered for the dodge mask. Filters out
  // thin strokes that would otherwise drag huge clearance zones around
  // them.
  dodgeCoverageThreshold: number;
  logoIndependent: boolean;
  logoColor: string;
  logoUseGradient: boolean;
  logoGradientEndColor: string;
  logoGradientType: GradientType;
  logoGradientAngle: number;
  logoHueShift: number;
  // When true (default), an active QR color animation paints over the
  // logo too — the logo is baked into the animation mask as a silhouette
  // and loses its own colors. When false, the logo is excluded from the
  // mask and redrawn in its own colors on top, where it can carry its
  // own (transform-based) animation independent of the color track.
  logoColorOver: boolean;
  // Transform animation applied to the logo (pulse / scale / flip). A
  // separate axis from logoColorOver: the logo can move whether or not the
  // color animation paints it.
  logoAnimationType: LogoAnimationType;
  logoAnimationSpeed: number;
  previewBg: 'light' | 'dark';
  animationType: AnimationType;
  animationSpeed: number;
  animationDirection: AnimationDirection;
  animationTimingFunction: AnimationTimingFunction;
  animationStops: AnimationStop[];
  activePreset: string | null;
}

// The image layers an animated QR is composited from. Built by the
// editor, consumed by the preview, fullscreen modal, and every export
// path. When the QR isn't animated, all three are null.
export interface AnimationLayers {
  // Monochrome alpha mask the color animation flows through. Set when the
  // QR color animation is active. Excludes the logo when it's redrawn as
  // its own layer.
  colorMaskUrl: string | null;
  // Fully-rendered static QR (logo excluded) used as the per-frame base
  // when there's no color animation but the logo animates on its own.
  baseImageUrl: string | null;
  // The logo, in its own colors, on a transparent full-size canvas —
  // composited on top of every frame and given its own transform
  // animation. Set whenever the logo is redrawn rather than colored over.
  logoLayerUrl: string | null;
}

// The not-animated value, shared so callers don't each re-spell it. Frozen
// because it's a singleton read-only sentinel, never mutated in place.
export const EMPTY_ANIMATION_LAYERS: AnimationLayers = Object.freeze({
  colorMaskUrl: null,
  baseImageUrl: null,
  logoLayerUrl: null,
});

export interface AnimationStop {
  color: string;
  colorEnd: string;
  position: number;
  positionEnd: number;
}

export type AnimationType =
  | 'none'
  | 'sweep'
  | 'pulse'
  | 'wave'
  | 'radialLoop'
  | 'breathe'
  | 'spiral'
  | 'colorCycle';
// 'cw' = forward, 'ccw' = reverse, 'alt' = bounce (forward then reverse).
// cw/ccw names retained so saved profiles continue to load without a
// migration step.
export type AnimationDirection = 'cw' | 'ccw' | 'alt';

// Logo transform animations. Distinct from the color-based AnimationType
// above: these move/scale/fade the redrawn logo layer rather than
// recoloring it.
//   pulse  — opacity oscillates (fade in/out)
//   scale  — uniform expand / contract around center
//   flipX  — horizontal scaleX swept from +100% through 0 to -100% (a
//            coin-flip), and back
export type LogoAnimationType = 'none' | 'pulse' | 'scale' | 'flipX';

// CSS-compatible animation-timing-function keywords. Closed union so a
// value can be injected straight into the animated preview's CSS without
// further sanitization, and the export workers can apply a matching
// easing curve when computing per-frame phase.
export type AnimationTimingFunction =
  | 'linear'
  | 'ease'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out';

export const DEFAULT_VCARD: VCardData = {
  firstName: '',
  lastName: '',
  title: '',
  org: '',
  phoneMobile: '',
  phoneWork: '',
  email: '',
  website: '',
  street: '',
  city: '',
  state: '',
  zip: '',
  country: '',
  notes: '',
};

export const DEFAULT_WIFI: WifiData = {
  ssid: '',
  password: '',
  encryption: 'WPA',
  hidden: false,
};

export const DEFAULT_EMAIL: EmailData = {
  to: '',
  subject: '',
  body: '',
};

export const DEFAULT_SMS: SmsData = {
  to: '',
  body: '',
};

export const DEFAULT_STYLE: StyleData = {
  dotShape: 'square',
  cornerOuterShape: 'square',
  cornerInnerShape: 'square',
  dotColor: '#000000',
  bgColor: '#ffffff',
  cornerColor: '',
  useGradient: false,
  gradientEndColor: '#818cf8',
  gradientType: 'linear',
  gradientAngle: 45,
  transparentBg: false,
  ecLevel: 'M',
  shapeScale: 120,
  quietZone: 2,
  qrSize: 400,
  logoSize: 0.25,
  logoMargin: 8,
  logoBgEnabled: true,
  dodgeAggressiveness: 1,
  dodgeSoftness: 0.5,
  dodgeCoverageThreshold: 0,
  logoIndependent: false,
  logoColor: '#000000',
  logoUseGradient: false,
  logoGradientEndColor: '#818cf8',
  logoGradientType: 'linear',
  logoGradientAngle: 45,
  logoHueShift: 0,
  logoColorOver: true,
  logoAnimationType: 'none',
  logoAnimationSpeed: 50,
  previewBg: 'dark',
  animationType: 'none',
  animationSpeed: 50,
  animationDirection: 'cw',
  animationTimingFunction: 'linear',
  animationStops: [
    { color: '#000000', colorEnd: '#000000', position: 10, positionEnd: 20 },
    { color: '#5eead4', colorEnd: '#5eead4', position: 20, positionEnd: 15 },
    { color: '#000000', colorEnd: '#000000', position: 30, positionEnd: 10 },
  ],
  activePreset: null,
};
