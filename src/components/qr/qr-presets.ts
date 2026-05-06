import type { StyleData } from './qr-types';

export interface QrPreset {
  id: string;
  name: string;
  preview: { dot: string; bg: string };
  overrides: Partial<StyleData>;
}

export const QR_PRESETS: QrPreset[] = [
  {
    id: 'classic',
    name: 'Classic',
    preview: { dot: '#000000', bg: '#ffffff' },
    overrides: {
      dotColor: '#000000',
      bgColor: '#ffffff',
      cornerColor: '',
      useGradient: false,
      dotShape: 'square',
      cornerOuterShape: 'square',
      cornerInnerShape: 'square',
    },
  },
  {
    id: 'navy',
    name: 'Navy',
    preview: { dot: '#1e3a5f', bg: '#f0f4f8' },
    overrides: {
      dotColor: '#1e3a5f',
      bgColor: '#f0f4f8',
      cornerColor: '#0f2644',
      useGradient: false,
      dotShape: 'rounded',
      cornerOuterShape: 'rounded',
      cornerInnerShape: 'dot',
    },
  },
  {
    id: 'emerald',
    name: 'Emerald',
    preview: { dot: '#065f46', bg: '#ecfdf5' },
    overrides: {
      dotColor: '#065f46',
      bgColor: '#ecfdf5',
      cornerColor: '#064e3b',
      useGradient: false,
      dotShape: 'dot',
      cornerOuterShape: 'dot',
      cornerInnerShape: 'dot',
    },
  },
  {
    id: 'violet',
    name: 'Violet',
    preview: { dot: '#5b21b6', bg: '#f5f3ff' },
    overrides: {
      dotColor: '#5b21b6',
      bgColor: '#f5f3ff',
      cornerColor: '#4c1d95',
      useGradient: true,
      gradientEndColor: '#7c3aed',
      gradientType: 'linear',
      gradientAngle: 135,
      dotShape: 'rounded',
      cornerOuterShape: 'rounded',
      cornerInnerShape: 'rounded',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    preview: { dot: '#dc2626', bg: '#fff7ed' },
    overrides: {
      dotColor: '#dc2626',
      bgColor: '#fff7ed',
      cornerColor: '#b91c1c',
      useGradient: true,
      gradientEndColor: '#f59e0b',
      gradientType: 'linear',
      gradientAngle: 45,
      dotShape: 'dot',
      cornerOuterShape: 'dot',
      cornerInnerShape: 'dot',
    },
  },
  {
    id: 'dark',
    name: 'Dark',
    preview: { dot: '#e4e5e9', bg: '#131519' },
    overrides: {
      dotColor: '#e4e5e9',
      bgColor: '#131519',
      cornerColor: '#5eead4',
      useGradient: false,
      dotShape: 'rounded',
      cornerOuterShape: 'rounded',
      cornerInnerShape: 'dot',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    preview: { dot: '#0369a1', bg: '#f0f9ff' },
    overrides: {
      dotColor: '#0369a1',
      bgColor: '#f0f9ff',
      cornerColor: '#075985',
      useGradient: true,
      gradientEndColor: '#06b6d4',
      gradientType: 'radial',
      gradientAngle: 0,
      dotShape: 'dot',
      cornerOuterShape: 'dot',
      cornerInnerShape: 'dot',
    },
  },
  {
    id: 'corporate',
    name: 'Corporate',
    preview: { dot: '#1a1a2e', bg: '#ffffff' },
    overrides: {
      dotColor: '#1a1a2e',
      bgColor: '#ffffff',
      cornerColor: '#c0392b',
      useGradient: false,
      dotShape: 'rounded',
      cornerOuterShape: 'rounded',
      cornerInnerShape: 'rounded',
    },
  },
];
