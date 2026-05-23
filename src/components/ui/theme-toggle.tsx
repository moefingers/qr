import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme, type Mode } from '../../hooks/use-theme';
import styles from './theme-toggle.module.css';

const ORDER: Mode[] = ['light', 'dark', 'system'];
const LABEL: Record<Mode, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

export function ThemeToggle() {
  const { mode, setMode } = useTheme();

  return (
    <div className={styles.group} role="group" aria-label="Theme mode">
      {ORDER.map((m) => {
        const Icon = m === 'light' ? Sun : m === 'dark' ? Moon : Monitor;
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            className={`${styles.item} ${active ? styles.active : ''}`}
            aria-pressed={active}
            aria-label={LABEL[m]}
            title={LABEL[m]}
            onClick={() => setMode(m)}
          >
            <Icon size={14} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
