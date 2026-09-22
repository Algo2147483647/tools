import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import Icon from './Icon';
import { applyTheme, readTheme, saveTheme, themes, themeStorageKey, type ThemeId } from './theme';

export default function ThemePicker() {
  const [theme, setTheme] = useState<ThemeId>(readTheme);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<(HTMLButtonElement | null)[]>([]);
  const current = themes.find((item) => item.id === theme)!;

  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key !== themeStorageKey && event.key !== null) return;
      const next = readTheme();
      setTheme(next);
      applyTheme(next);
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    options.current[themes.findIndex((item) => item.id === theme)]?.focus();
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, theme]);

  function choose(id: ThemeId) {
    setTheme(id);
    saveTheme(id);
    setOpen(false);
    trigger.current?.focus();
  }

  function keyboard(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const index = options.current.findIndex((option) => option === document.activeElement);
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? themes.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + themes.length) % themes.length;
      options.current[next]?.focus();
    }
    event.stopPropagation();
  }

  return (
    <div
      className="theme-picker"
      ref={root}
      data-theme-control
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className="theme-trigger secondary"
        type="button"
        aria-label={`Color theme: ${current.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'color-theme-menu' : undefined}
        title="Change color theme"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Icon name="palette" size={16} />
        <span>{current.name}</span>
        <Icon name="chevron" size={11} />
      </button>
      {open && (
        <div
          id="color-theme-menu"
          className="theme-menu"
          role="menu"
          aria-label="Color themes"
          onKeyDown={keyboard}
        >
          <div className="theme-menu-heading">Color theme</div>
          {themes.map((item, index) => (
            <button
              key={item.id}
              ref={(element) => {
                options.current[index] = element;
              }}
              type="button"
              className={`theme-option ${theme === item.id ? 'active' : ''}`}
              role="menuitemradio"
              aria-checked={theme === item.id}
              tabIndex={-1}
              onClick={() => choose(item.id)}
            >
              <span className="theme-swatch" style={{ '--swatch': item.color } as CSSProperties} />
              <span>{item.name}</span>
              {theme === item.id && <Icon name="check" size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
