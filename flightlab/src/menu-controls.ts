import type { MenuAction } from './input';

type MenuControl = HTMLButtonElement | HTMLInputElement | HTMLSelectElement;

function visibleEnabled(element: MenuControl): boolean {
  if (element.disabled || element.getAttribute('aria-disabled') === 'true' || element.closest('[hidden], [inert], [aria-hidden="true"], fieldset:disabled')) return false;
  if (element.tagName === 'INPUT' && (element as HTMLInputElement).type === 'hidden') return false;
  const bounds = element.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return false;
  if (typeof getComputedStyle === 'function') {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}
function focus(element: MenuControl): void {
  element.focus({ preventScroll: true });
  element.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
}
function changed(element: MenuControl): void {
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}
function adjust(element: MenuControl, direction: -1 | 1): boolean {
  if (element.tagName === 'SELECT') {
    const select = element as HTMLSelectElement;
    const enabled = Array.from(select.options).map((option, index) => ({ option, index })).filter(({ option }) => !option.disabled && !(option.parentElement?.tagName === 'OPTGROUP' && (option.parentElement as HTMLOptGroupElement).disabled));
    const position = enabled.findIndex(({ index }) => index === select.selectedIndex);
    const next = enabled[Math.max(0, Math.min(enabled.length - 1, position + direction))];
    if (next && next.index !== select.selectedIndex) { select.selectedIndex = next.index; changed(select); }
    return true;
  }
  if (element.tagName !== 'INPUT') return false;
  const input = element as HTMLInputElement;
  if (input.type === 'range' || input.type === 'number') {
    const min = input.min === '' ? (input.type === 'range' ? 0 : -Infinity) : Number(input.min);
    const max = input.max === '' ? (input.type === 'range' ? 100 : Infinity) : Number(input.max);
    const step = input.step === '' || input.step === 'any' ? (Number.isFinite(max - min) ? (max - min) / 100 || 1 : 1) : Number(input.step);
    const current = Number(input.value) || 0;
    const value = Math.max(min, Math.min(max, Number((current + direction * step).toFixed(8))));
    if (Number.isFinite(value) && value !== current) { input.value = String(value); changed(input); }
    return true;
  }
  if (input.type === 'checkbox') {
    const checked = direction > 0;
    if (checked !== input.checked) { input.checked = checked; changed(input); }
    return true;
  }
  return false;
}

/**
 * Navigate only the supplied active menu or modal. Up/Down move between controls;
 * Left/Right adjust selects, ranges, numbers and checkboxes without opening native
 * popups. A/Confirm activates buttons, toggles checkboxes, or advances a select.
 */
export function navigateMenu(root: HTMLElement, action: MenuAction, onBack: () => void): void {
  if (action === 'back') { onBack(); return; }
  const controls = Array.from(root.querySelectorAll<MenuControl>('button, select, input')).filter(visibleEnabled);
  if (!controls.length) return;
  const active = root.ownerDocument.activeElement as MenuControl | null;
  const currentIndex = controls.findIndex(element => element === active);
  if (currentIndex < 0) { focus(controls[0]); return; }
  const current = controls[currentIndex];
  if (action === 'confirm') {
    if (current.tagName === 'SELECT') {
      const select = current as HTMLSelectElement;
      const enabled = Array.from(select.options).map((option, index) => ({ option, index })).filter(({ option }) => !option.disabled && !(option.parentElement?.tagName === 'OPTGROUP' && (option.parentElement as HTMLOptGroupElement).disabled));
      const next = enabled.find(({ index }) => index > select.selectedIndex) ?? enabled[0];
      if (next && next.index !== select.selectedIndex) { select.selectedIndex = next.index; changed(select); }
    } else if (current.tagName === 'BUTTON' || (current.tagName === 'INPUT' && ['checkbox', 'radio', 'button', 'submit', 'reset'].includes((current as HTMLInputElement).type))) current.click();
    else focus(current);
    return;
  }
  if ((action === 'left' || action === 'right') && adjust(current, action === 'left' ? -1 : 1)) return;
  const origin = current.getBoundingClientRect();
  const ox = origin.left + origin.width / 2, oy = origin.top + origin.height / 2;
  const horizontal = action === 'left' || action === 'right';
  const sign = action === 'left' || action === 'up' ? -1 : 1;
  let candidate: MenuControl | null = null;
  let best = Infinity;
  for (const control of controls) {
    if (control === current) continue;
    const bounds = control.getBoundingClientRect();
    const dx = bounds.left + bounds.width / 2 - ox, dy = bounds.top + bounds.height / 2 - oy;
    const forward = (horizontal ? dx : dy) * sign;
    const sideways = Math.abs(horizontal ? dy : dx);
    if (forward < 4) continue;
    const score = forward + sideways * 2;
    if (score < best) { best = score; candidate = control; }
  }
  // Wrapped DOM order keeps all controls reachable in a single-column panel.
  focus(candidate ?? controls[(currentIndex + sign + controls.length) % controls.length]);
}
