'use client';

import { useRef } from 'react';
import {
  User,
  Link,
  Type,
  Wifi,
  Mail,
  MessageSquare,
  Upload,
} from 'lucide-react';
import type { QrMode, VCardData, WifiData, EmailData, SmsData } from './qr-types';

interface Props {
  mode: QrMode;
  onModeChange: (mode: QrMode) => void;
  vcardData: VCardData;
  onVcardChange: (data: VCardData) => void;
  urlData: string;
  onUrlChange: (url: string) => void;
  textData: string;
  onTextChange: (text: string) => void;
  wifiData: WifiData;
  onWifiChange: (data: WifiData) => void;
  emailData: EmailData;
  onEmailChange: (data: EmailData) => void;
  smsData: SmsData;
  onSmsChange: (data: SmsData) => void;
}

const MODES: { id: QrMode; label: string; icon: typeof User }[] = [
  { id: 'contact', label: 'Contact', icon: User },
  { id: 'url', label: 'URL', icon: Link },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'wifi', label: 'WiFi', icon: Wifi },
  { id: 'emailmsg', label: 'Email', icon: Mail },
  { id: 'sms', label: 'SMS', icon: MessageSquare },
];

// --- VCF parsing utilities ---

function decodeQuotedPrintable(str: string): string {
  const bytes: number[] = [];
  let i = 0;
  while (i < str.length) {
    if (str[i] === '=' && i + 2 < str.length && /[0-9A-Fa-f]{2}/.test(str.substring(i + 1, i + 3))) {
      bytes.push(parseInt(str.substring(i + 1, i + 3), 16));
      i += 3;
    } else {
      const code = str.charCodeAt(i);
      if (code < 128) {
        bytes.push(code);
      } else {
        const encoded = new TextEncoder().encode(str[i]);
        for (const b of encoded) bytes.push(b);
      }
      i++;
    }
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}

function parseVCF(text: string): VCardData {
  // Normalize line endings
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Join QUOTED-PRINTABLE soft line breaks
  text = text.replace(/=\n/g, '');
  // Unfold RFC 2425 continuation lines
  text = text.replace(/\n[ \t]/g, '');

  const rawLines = text.split('\n');

  const vcardKeywords =
    /^(BEGIN|END|VERSION|N|FN|ORG|TITLE|TEL|EMAIL|URL|ADR|NOTE|PHOTO|BDAY|REV|UID|PRODID|X-|CATEGORIES|GEO|TZ|ROLE|AGENT|SORT-STRING|SOUND|LABEL|KEY|MAILER|CLASS|SOURCE|PROFILE)/i;
  const lines: string[] = [];
  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(':');
    const looksLikeProperty = colonIdx > 0 && vcardKeywords.test(trimmed.split(/[;:]/)[0]);
    if (!looksLikeProperty && lines.length > 0) {
      lines[lines.length - 1] += '\n' + trimmed;
    } else {
      lines.push(trimmed);
    }
  }

  const result: VCardData = {
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

  let mobileSet = false;
  let workPhoneSet = false;

  for (const raw of lines) {
    if (!raw || raw.trim().length === 0) continue;

    const colonIdx = raw.indexOf(':');
    if (colonIdx < 0) continue;

    const propFull = raw.substring(0, colonIdx).trim();
    const value = raw.substring(colonIdx + 1).trim();
    if (!value) continue;

    const parts = propFull.split(';');
    const prop = parts[0].toUpperCase();
    const params = parts.slice(1).map((p) => p.toUpperCase());
    const paramsStr = params.join(';');

    // Decode value based on encoding
    let decoded = value;
    if (paramsStr.includes('ENCODING=QUOTED-PRINTABLE')) {
      decoded = decodeQuotedPrintable(value);
    } else if (
      paramsStr.includes('ENCODING=BASE64') ||
      paramsStr.includes('ENCODING=B') ||
      params.some((p) => p === 'B' || p === 'BASE64')
    ) {
      try {
        const binary = atob(value.replace(/\s/g, ''));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        decoded = new TextDecoder('utf-8').decode(bytes);
      } catch {
        decoded = value;
      }
    }

    // Unescape backslash sequences
    decoded = decoded.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\\\/g, '\\');

    switch (prop) {
      case 'N': {
        const np = decoded.split(';');
        if (np[0]) result.lastName = np[0].trim();
        if (np[1]) result.firstName = np[1].trim();
        break;
      }
      case 'FN': {
        if (!result.firstName && !result.lastName) {
          const p = decoded.trim().split(/\s+/);
          if (p.length >= 2) {
            result.firstName = p.slice(0, -1).join(' ');
            result.lastName = p[p.length - 1];
          } else {
            result.firstName = decoded.trim();
          }
        }
        break;
      }
      case 'ORG':
        result.org = decoded.split(';')[0].trim();
        break;
      case 'TITLE':
        result.title = decoded.trim();
        break;
      case 'TEL': {
        const isMobile = paramsStr.includes('CELL') || paramsStr.includes('MOBILE');
        const isFax = paramsStr.includes('FAX');
        if (isFax) break;
        if ((isMobile || !mobileSet) && !mobileSet) {
          result.phoneMobile = decoded.trim();
          mobileSet = true;
        } else if (!workPhoneSet) {
          result.phoneWork = decoded.trim();
          workPhoneSet = true;
        }
        break;
      }
      case 'EMAIL':
        if (!result.email) result.email = decoded.trim();
        break;
      case 'URL':
        if (!result.website) result.website = decoded.trim();
        break;
      case 'ADR': {
        const ap = decoded.split(';');
        if (ap[2]) result.street = ap[2].trim();
        if (ap[3]) result.city = ap[3].trim();
        if (ap[4]) result.state = ap[4].trim();
        if (ap[5]) result.zip = ap[5].trim();
        if (ap[6]) result.country = ap[6].trim();
        break;
      }
      case 'NOTE':
        result.notes = decoded.trim();
        break;
    }
  }

  return result;
}

// --- Shared UI primitives ---

const inputClass =
  'w-full bg-[#1a1d23] border border-[#2a2d37] rounded-lg px-3 py-2 text-[13px] text-[#e4e5e9] placeholder-[#3d4150] outline-none transition-all focus:border-[#5eead4] focus:ring-[3px] focus:ring-[rgba(94,234,212,0.12)]';

const selectClass =
  'w-full bg-[#1a1d23] border border-[#2a2d37] rounded-lg px-3 py-2 text-[13px] text-[#e4e5e9] outline-none cursor-pointer appearance-none pr-8 transition-all focus:border-[#5eead4] focus:ring-[3px] focus:ring-[rgba(94,234,212,0.12)]';

const labelClass = 'block text-[11px] font-medium text-[#6e7385] mb-1 tracking-wide';

const tipClass =
  'text-[11px] text-[#6e7385] bg-[#1a1d23] border border-[#2a2d37] rounded-lg p-3 leading-relaxed';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-3.5 last:mb-0">
      <label className={labelClass}>
        {label}
        {required && <span className="text-[#5eead4] ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5">{children}</div>;
}

function Divider() {
  return <div className="h-px bg-[#2a2d37] my-4" />;
}

function SectionLabel({ text }: { text: string }) {
  return (
    <>
      <Divider />
      <div className="text-[10px] font-medium uppercase tracking-wider text-[#6e7385] mb-3">
        {text}
      </div>
    </>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return <div className={tipClass}>{children}</div>;
}

// --- Mode panels ---

function ContactPanel({
  data,
  onChange,
}: {
  data: VCardData;
  onChange: (d: VCardData) => void;
}) {
  const set = (key: keyof VCardData, value: string) => onChange({ ...data, [key]: value });

  return (
    <div className="p-5 pt-4">
      <Row>
        <Field label="First Name" required>
          <input className={inputClass} type="text" placeholder="John" value={data.firstName} onChange={(e) => set('firstName', e.target.value)} />
        </Field>
        <Field label="Last Name" required>
          <input className={inputClass} type="text" placeholder="Doe" value={data.lastName} onChange={(e) => set('lastName', e.target.value)} />
        </Field>
      </Row>
      <Row>
        <Field label="Job Title">
          <input className={inputClass} type="text" placeholder="Software Engineer" value={data.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Organization">
          <input className={inputClass} type="text" placeholder="Acme Corp" value={data.org} onChange={(e) => set('org', e.target.value)} />
        </Field>
      </Row>
      <Divider />
      <Row>
        <Field label="Mobile Phone">
          <input className={inputClass} type="tel" placeholder="+1-555-123-4567" value={data.phoneMobile} onChange={(e) => set('phoneMobile', e.target.value)} />
        </Field>
        <Field label="Work Phone">
          <input className={inputClass} type="tel" placeholder="+1-555-987-6543" value={data.phoneWork} onChange={(e) => set('phoneWork', e.target.value)} />
        </Field>
      </Row>
      <Field label="Email">
        <input className={inputClass} type="email" placeholder="john@example.com" value={data.email} onChange={(e) => set('email', e.target.value)} />
      </Field>
      <Field label="Website">
        <input className={inputClass} type="url" placeholder="https://johndoe.com" value={data.website} onChange={(e) => set('website', e.target.value)} />
      </Field>
      <SectionLabel text="ADDRESS (work)" />
      <Field label="Street Address">
        <input className={inputClass} type="text" placeholder="123 Main Street" value={data.street} onChange={(e) => set('street', e.target.value)} />
      </Field>
      <Row>
        <Field label="City">
          <input className={inputClass} type="text" placeholder="Springfield" value={data.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="State / Region">
          <input className={inputClass} type="text" placeholder="IL" value={data.state} onChange={(e) => set('state', e.target.value)} />
        </Field>
      </Row>
      <Row>
        <Field label="Postal Code">
          <input className={inputClass} type="text" placeholder="62704" value={data.zip} onChange={(e) => set('zip', e.target.value)} />
        </Field>
        <Field label="Country">
          <input className={inputClass} type="text" placeholder="US" value={data.country} onChange={(e) => set('country', e.target.value)} />
        </Field>
      </Row>
      <Divider />
      <Field label="Note">
        <textarea className={`${inputClass} resize-y min-h-[52px]`} rows={2} placeholder="A short note (optional)" value={data.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </div>
  );
}

function UrlPanel({ data, onChange }: { data: string; onChange: (v: string) => void }) {
  return (
    <div className="p-5 pt-4">
      <Field label="URL" required>
        <input className={inputClass} type="url" placeholder="https://example.com" value={data} onChange={(e) => onChange(e.target.value)} />
      </Field>
      <Tip>
        The URL will open directly in the phone&apos;s browser when scanned. Include{' '}
        <strong className="text-[#e4e5e9] font-semibold">https://</strong> for best compatibility.
      </Tip>
    </div>
  );
}

function TextPanel({ data, onChange }: { data: string; onChange: (v: string) => void }) {
  return (
    <div className="p-5 pt-4">
      <Field label="Text Content" required>
        <textarea className={`${inputClass} resize-y min-h-[120px]`} rows={6} placeholder="Enter any text, message, instructions, serial number..." value={data} onChange={(e) => onChange(e.target.value)} />
      </Field>
      <Tip>
        Plain text is displayed directly on the phone. Great for messages, codes, instructions, or any freeform content. Supports all languages including Arabic, Chinese, emoji, etc.
      </Tip>
    </div>
  );
}

function WifiPanel({ data, onChange }: { data: WifiData; onChange: (d: WifiData) => void }) {
  return (
    <div className="p-5 pt-4">
      <Field label="Network Name (SSID)" required>
        <input className={inputClass} type="text" placeholder="MyWiFiNetwork" value={data.ssid} onChange={(e) => onChange({ ...data, ssid: e.target.value })} />
      </Field>
      <Field label="Password">
        <input className={inputClass} type="text" placeholder="Enter password (leave blank if open)" value={data.password} onChange={(e) => onChange({ ...data, password: e.target.value })} />
      </Field>
      <Row>
        <Field label="Encryption">
          <select className={selectClass} value={data.encryption} onChange={(e) => onChange({ ...data, encryption: e.target.value as WifiData['encryption'] })}>
            <option value="WPA">WPA/WPA2</option>
            <option value="WEP">WEP</option>
            <option value="nopass">None (open)</option>
          </select>
        </Field>
        <Field label="Hidden Network">
          <div className="flex items-center h-[36px]">
            <button
              type="button"
              className={`relative w-10 h-[22px] rounded-full border transition-colors ${
                data.hidden
                  ? 'bg-[#5eead4] border-[#5eead4]'
                  : 'bg-[#22252d] border-[#2a2d37]'
              }`}
              onClick={() => onChange({ ...data, hidden: !data.hidden })}
            >
              <span
                className={`absolute top-[2px] left-[2px] w-4 h-4 bg-white rounded-full transition-transform ${
                  data.hidden ? 'translate-x-[18px]' : ''
                }`}
              />
            </button>
            <span className="ml-2 text-[12px] text-[#6e7385]">{data.hidden ? 'Yes' : 'No'}</span>
          </div>
        </Field>
      </Row>
      <Tip>
        Scanning this QR code will prompt the phone to connect to the WiFi network automatically - no need to type the password. Works on iOS 11+ and Android 10+.
      </Tip>
    </div>
  );
}

function EmailPanel({ data, onChange }: { data: EmailData; onChange: (d: EmailData) => void }) {
  return (
    <div className="p-5 pt-4">
      <Field label="To Address" required>
        <input className={inputClass} type="email" placeholder="hello@example.com" value={data.to} onChange={(e) => onChange({ ...data, to: e.target.value })} />
      </Field>
      <Field label="Subject">
        <input className={inputClass} type="text" placeholder="Subject line" value={data.subject} onChange={(e) => onChange({ ...data, subject: e.target.value })} />
      </Field>
      <Field label="Body">
        <textarea className={`${inputClass} resize-y min-h-[52px]`} rows={3} placeholder="Pre-filled message body" value={data.body} onChange={(e) => onChange({ ...data, body: e.target.value })} />
      </Field>
      <Tip>
        Opens the phone&apos;s email app with a pre-filled draft. All fields are optional except the To address.
      </Tip>
    </div>
  );
}

function SmsPanel({ data, onChange }: { data: SmsData; onChange: (d: SmsData) => void }) {
  return (
    <div className="p-5 pt-4">
      <Field label="Phone Number" required>
        <input className={inputClass} type="tel" placeholder="+1-555-123-4567" value={data.to} onChange={(e) => onChange({ ...data, to: e.target.value })} />
      </Field>
      <Field label="Message">
        <textarea className={`${inputClass} resize-y min-h-[52px]`} rows={3} placeholder="Pre-filled message (optional)" value={data.body} onChange={(e) => onChange({ ...data, body: e.target.value })} />
      </Field>
      <Tip>
        Opens the phone&apos;s messaging app with a pre-filled text. Works with both SMS and iMessage/RCS.
      </Tip>
    </div>
  );
}

// --- Main component ---

export function QrDataInput({
  mode,
  onModeChange,
  vcardData,
  onVcardChange,
  urlData,
  onUrlChange,
  textData,
  onTextChange,
  wifiData,
  onWifiChange,
  emailData,
  onEmailChange,
  smsData,
  onSmsChange,
}: Props) {
  const vcfInputRef = useRef<HTMLInputElement>(null);

  function handleVCFUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const buf = new Uint8Array(ev.target!.result as ArrayBuffer);
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
      } catch {
        try {
          text = new TextDecoder('windows-1256').decode(buf);
        } catch {
          text = new TextDecoder('iso-8859-1').decode(buf);
        }
      }
      // Strip BOM
      if (text.charCodeAt(0) === 0xfeff) text = text.substring(1);

      try {
        const parsed = parseVCF(text);
        onVcardChange(parsed);
        // Switch to contact mode if not already
        if (mode !== 'contact') onModeChange('contact');
      } catch (err) {
        console.error('VCF parse error:', err);
      }

      // Reset file input
      if (vcfInputRef.current) vcfInputRef.current.value = '';
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <div className="bg-[#131519] border border-[#2a2d37] rounded-[14px] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2d37]">
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-[#6e7385]">
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M12 3v18M3 12h18" />
          </svg>
          QR Content
        </span>
        {/* VCF import button - visible when on Contact tab */}
        <label
          className={`inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#5eead4] bg-[rgba(94,234,212,0.08)] border border-[rgba(94,234,212,0.15)] px-3 py-1 rounded-full cursor-pointer transition-all hover:bg-[rgba(94,234,212,0.14)] hover:border-[rgba(94,234,212,0.3)] ${
            mode === 'contact' ? 'visible' : 'invisible'
          }`}
          title="Import .vcf file"
        >
          <Upload size={12} />
          Import .vcf
          <input
            ref={vcfInputRef}
            type="file"
            accept=".vcf,text/vcard,text/x-vcard"
            onChange={handleVCFUpload}
            className="hidden"
          />
        </label>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-[#2a2d37]">
        {MODES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`relative text-[12px] font-medium px-3.5 py-2.5 transition-colors whitespace-nowrap ${
              mode === id ? 'text-[#5eead4]' : 'text-[#6e7385] hover:text-[#e4e5e9]'
            }`}
            onClick={() => onModeChange(id)}
          >
            {label}
            {mode === id && (
              <span className="absolute bottom-[-1px] left-2 right-2 h-0.5 bg-[#5eead4] rounded-t-sm" />
            )}
          </button>
        ))}
      </div>

      {/* Panel content */}
      {mode === 'contact' && <ContactPanel data={vcardData} onChange={onVcardChange} />}
      {mode === 'url' && <UrlPanel data={urlData} onChange={onUrlChange} />}
      {mode === 'text' && <TextPanel data={textData} onChange={onTextChange} />}
      {mode === 'wifi' && <WifiPanel data={wifiData} onChange={onWifiChange} />}
      {mode === 'emailmsg' && <EmailPanel data={emailData} onChange={onEmailChange} />}
      {mode === 'sms' && <SmsPanel data={smsData} onChange={onSmsChange} />}
    </div>
  );
}
