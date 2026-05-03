export type DotShape = 'square' | 'dot' | 'rounded' | 'diamond' | 'star' | 'heart';
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
  dodgeAggressiveness: number;
  logoIndependent: boolean;
  logoColor: string;
  logoUseGradient: boolean;
  logoGradientEndColor: string;
  logoGradientType: GradientType;
  logoGradientAngle: number;
  logoHueShift: number;
  previewBg: 'light' | 'dark';
  animationType: AnimationType;
  animationSpeed: number;
  animationDirection: AnimationDirection;
  animationStops: AnimationStop[];
  activePreset: string | null;
}

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
export type AnimationDirection = 'cw' | 'ccw';

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
  dodgeAggressiveness: 30,
  logoIndependent: false,
  logoColor: '#000000',
  logoUseGradient: false,
  logoGradientEndColor: '#818cf8',
  logoGradientType: 'linear',
  logoGradientAngle: 45,
  logoHueShift: 0,
  previewBg: 'dark',
  animationType: 'none',
  animationSpeed: 50,
  animationDirection: 'cw',
  animationStops: [
    { color: '#000000', colorEnd: '#000000', position: 10, positionEnd: 20 },
    { color: '#5eead4', colorEnd: '#5eead4', position: 20, positionEnd: 15 },
    { color: '#000000', colorEnd: '#000000', position: 30, positionEnd: 10 },
  ],
  activePreset: null,
};
