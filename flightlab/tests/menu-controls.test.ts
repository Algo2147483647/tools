import { describe, expect, it, vi } from 'vitest';
import { navigateMenu } from '../src/menu-controls';

// The navigation algorithm uses the same small DOM surface across real controls.
// These fixtures provide geometry and event recording without a browser dependency.
function menuFixture(specifications: Array<{ tag?: string; x?: number; y: number; disabled?: boolean; hidden?: boolean; type?: string; value?: string; options?: Array<{ disabled: boolean }> }>) {
  const ownerDocument: { activeElement: unknown } = { activeElement: null };
  const controls = specifications.map(specification => {
    const control = {
      tagName: specification.tag ?? 'BUTTON', disabled: !!specification.disabled,
      type: specification.type ?? '', value: specification.value ?? '0.5', min: '0', max: '1', step: '0.1', checked: false,
      selectedIndex: 0, options: specification.options ?? [],
      getAttribute: () => null,
      closest: () => specification.hidden ? {} : null,
      getBoundingClientRect: () => ({ left: specification.x ?? 0, top: specification.y, width: 100, height: 20 }),
      focus: vi.fn(() => { ownerDocument.activeElement = control; }),
      scrollIntoView: vi.fn(), click: vi.fn(), dispatchEvent: vi.fn(),
    };
    return control;
  });
  const root = { ownerDocument, querySelectorAll: () => controls } as unknown as HTMLElement;
  return { root, controls, ownerDocument };
}

describe('menu focus and activation', () => {
  it('focuses the first visible enabled control without accidentally launching it', () => {
    const { root, controls, ownerDocument } = menuFixture([{ y: 0, hidden: true }, { y: 30, disabled: true }, { y: 60 }]);
    navigateMenu(root, 'confirm', () => {});
    expect(ownerDocument.activeElement).toBe(controls[2]);
    expect(controls[2].click).not.toHaveBeenCalled();
    navigateMenu(root, 'confirm', () => {});
    expect(controls[2].click).toHaveBeenCalledOnce();
    expect(controls[2].scrollIntoView).toHaveBeenCalled();
  });

  it('moves geometrically through a grid and wraps when reaching an edge', () => {
    const { root, controls, ownerDocument } = menuFixture([{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 0, y: 40 }, { x: 120, y: 40 }]);
    navigateMenu(root, 'down', () => {});
    navigateMenu(root, 'right', () => {});
    expect(ownerDocument.activeElement).toBe(controls[1]);
    navigateMenu(root, 'down', () => {});
    expect(ownerDocument.activeElement).toBe(controls[3]);
    navigateMenu(root, 'left', () => {});
    expect(ownerDocument.activeElement).toBe(controls[2]);
    navigateMenu(root, 'up', () => {});
    expect(ownerDocument.activeElement).toBe(controls[0]);
    navigateMenu(root, 'up', () => {});
    expect(ownerDocument.activeElement).toBe(controls[3]);
  });

  it('changes sliders by their configured step, clamps at bounds and dispatches both events', () => {
    const { root, controls } = menuFixture([{ tag: 'INPUT', type: 'range', y: 0, value: '0.9' }]);
    navigateMenu(root, 'confirm', () => {});
    navigateMenu(root, 'right', () => {});
    expect(controls[0].value).toBe('1');
    expect(controls[0].dispatchEvent.mock.calls.map(([event]) => (event as Event).type)).toEqual(['input', 'change']);
    navigateMenu(root, 'right', () => {});
    expect(controls[0].dispatchEvent).toHaveBeenCalledTimes(2);
    navigateMenu(root, 'left', () => {});
    expect(controls[0].value).toBe('0.9');
  });

  it('changes selects directly, skips disabled options and navigates away with Down', () => {
    const { root, controls, ownerDocument } = menuFixture([
      { tag: 'SELECT', y: 0, options: [{ disabled: false }, { disabled: true }, { disabled: false }] },
      { y: 30 },
    ]);
    navigateMenu(root, 'confirm', () => {});
    navigateMenu(root, 'right', () => {});
    expect(controls[0].selectedIndex).toBe(2);
    expect(controls[0].click).not.toHaveBeenCalled();
    navigateMenu(root, 'confirm', () => {});
    expect(controls[0].selectedIndex).toBe(0);
    navigateMenu(root, 'down', () => {});
    expect(ownerDocument.activeElement).toBe(controls[1]);
  });

  it('sets checkboxes predictably with Left/Right and invokes the Back callback', () => {
    const { root, controls } = menuFixture([{ tag: 'INPUT', type: 'checkbox', y: 0 }]);
    const onBack = vi.fn();
    navigateMenu(root, 'confirm', onBack);
    navigateMenu(root, 'right', onBack);
    expect(controls[0].checked).toBe(true);
    navigateMenu(root, 'left', onBack);
    expect(controls[0].checked).toBe(false);
    navigateMenu(root, 'back', onBack);
    expect(onBack).toHaveBeenCalledOnce();
  });
});
