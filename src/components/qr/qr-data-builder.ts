import type { VCardData, WifiData, EmailData, SmsData, QrMode } from './qr-types';

export function buildVCard(d: VCardData): string | null {
  if (!d.firstName && !d.lastName) return null;
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${d.lastName};${d.firstName};;;`,
    `FN:${[d.firstName, d.lastName].filter(Boolean).join(' ')}`,
  ];
  if (d.org) lines.push(`ORG:${d.org}`);
  if (d.title) lines.push(`TITLE:${d.title}`);
  if (d.phoneMobile) lines.push(`TEL;TYPE=CELL:${d.phoneMobile}`);
  if (d.phoneWork) lines.push(`TEL;TYPE=WORK:${d.phoneWork}`);
  if (d.email) lines.push(`EMAIL:${d.email}`);
  if (d.website) lines.push(`URL:${d.website}`);
  const addr = [d.street, d.city, d.state, d.zip, d.country];
  if (addr.some(Boolean))
    lines.push(`ADR;TYPE=WORK:;;${d.street};${d.city};${d.state};${d.zip};${d.country}`);
  if (d.notes) lines.push(`NOTE:${d.notes}`);
  lines.push('END:VCARD');
  return lines.join('\n');
}

function escapeWifi(s: string): string {
  // An all-hex value must be double-quoted, or scanners following the ZXing
  // convention may read it as a raw hex key instead of a literal string.
  if (/^[0-9a-fA-F]+$/.test(s)) return `"${s}"`;
  return s.replace(/[\\;",":]/g, (c) => '\\' + c);
}

export function buildWifi(d: WifiData): string | null {
  if (!d.ssid) return null;
  let s = `WIFI:T:${d.encryption};S:${escapeWifi(d.ssid)};`;
  if (d.encryption !== 'nopass' && d.password) s += `P:${escapeWifi(d.password)};`;
  if (d.hidden) s += 'H:true;';
  s += ';';
  return s;
}

export function buildEmail(d: EmailData): string | null {
  if (!d.to) return null;
  let mailto = `mailto:${d.to}`;
  const params: string[] = [];
  if (d.subject) params.push(`subject=${encodeURIComponent(d.subject)}`);
  if (d.body) params.push(`body=${encodeURIComponent(d.body)}`);
  if (params.length) mailto += '?' + params.join('&');
  return mailto;
}

export function buildSms(d: SmsData): string | null {
  if (!d.to) return null;
  let sms = `smsto:${d.to}`;
  if (d.body) sms += `:${d.body}`;
  return sms;
}

export function buildUrl(url: string): string | null {
  if (!url) return null;
  if (!/^[a-zA-Z]+:\/\//.test(url)) return 'https://' + url;
  return url;
}

export function buildText(text: string): string | null {
  return text || null;
}

export interface QrMeta {
  title: string;
  sub: string;
}

export function getQrMeta(
  mode: QrMode,
  vcard: VCardData,
  url: string,
  text: string,
  wifi: WifiData,
  email: EmailData,
  sms: SmsData,
): QrMeta {
  switch (mode) {
    case 'contact': {
      const name = [vcard.firstName, vcard.lastName].filter(Boolean).join(' ');
      const sub = [vcard.title, vcard.org].filter(Boolean).join(' - ');
      return { title: name, sub };
    }
    case 'url':
      return { title: url, sub: 'URL' };
    case 'text':
      return { title: text.length > 40 ? text.substring(0, 40) + '...' : text, sub: 'Plain Text' };
    case 'wifi':
      return { title: wifi.ssid, sub: 'WiFi Network' };
    case 'emailmsg':
      return { title: email.to, sub: 'Email' };
    case 'sms':
      return { title: sms.to, sub: 'SMS' };
  }
}

export function getFileName(
  mode: QrMode,
  vcard: VCardData,
  wifi: WifiData,
): string {
  switch (mode) {
    case 'contact':
      return (
        [vcard.firstName, vcard.lastName]
          .filter(Boolean)
          .join('_')
          .toLowerCase() || 'contact'
      );
    case 'url':
      return 'url';
    case 'text':
      return 'text';
    case 'wifi':
      return wifi.ssid.replace(/\s+/g, '_').toLowerCase() || 'wifi';
    case 'emailmsg':
      return 'email';
    case 'sms':
      return 'sms';
  }
}
