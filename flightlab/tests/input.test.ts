import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlightInputManager, processAxis } from '../src/input';
import type { InputSettings } from '../src/types';

const settings: InputSettings = {
  deadzone: 0.1, sensitivity: 1, expo: 0, invertPitch: false, vibration: true,
};

afterEach(() => vi.unstubAllGlobals());

function standardPad(axes = [0, 0, 0, 0]): Gamepad {
  return {
    id: 'Test standard controller', index: 0, connected: true, mapping: 'standard', axes,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    timestamp: 0, vibrationActuator: null,
  } as unknown as Gamepad;
}

describe('controller axis processing', () => {
  it('removes stick drift and rescales the usable range continuously', () => {
    expect(processAxis(0.08, settings)).toBe(0);
    expect(processAxis(-0.1, settings)).toBe(0);
    expect(processAxis(0.55, settings)).toBeCloseTo(0.5);
    expect(processAxis(-0.55, settings)).toBeCloseTo(-0.5);
    expect(processAxis(1, settings)).toBe(1);
  });

  it('uses calibration offsets before applying the deadzone', () => {
    expect(processAxis(0.16, settings, 0.12)).toBe(0);
    expect(processAxis(0.67, settings, 0.12)).toBeCloseTo(0.5);
  });

  it('softens center input with expo without losing full travel', () => {
    expect(processAxis(0.55, { ...settings, expo: 1 })).toBeCloseTo(0.125);
    expect(processAxis(1, { ...settings, expo: 1 })).toBe(1);
    expect(processAxis(-1, { ...settings, expo: 1 })).toBe(-1);
  });

  it('limits overrange device values and high sensitivity', () => {
    expect(processAxis(100, settings)).toBe(1);
    expect(processAxis(-100, settings)).toBe(-1);
    expect(processAxis(0.9, { ...settings, sensitivity: 3 })).toBe(1);
  });

  it('rejects invalid readings and tolerates corrupt settings', () => {
    expect(processAxis(NaN, settings)).toBe(0);
    expect(processAxis(Infinity, settings)).toBe(0);
    const value = processAxis(0.5, { ...settings, deadzone: NaN, expo: Infinity, sensitivity: NaN }, NaN);
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
    expect(processAxis(1, { ...settings, deadzone: 2 })).toBe(1);
  });

  it('provides neutral keyboard fallback without browser capabilities', () => {
    const input = new FlightInputManager(settings, () => {}, () => {});
    expect(input.poll('space')).toEqual({
      pitch: 0, roll: 0, yaw: 0, throttleDelta: 0, moveX: 0, moveY: 0, moveZ: 0, brake: false, boost: false,
    });
    expect(input.controllerName).toBe('Keyboard');
    expect(input.connected).toBe(false);
    expect(input.calibrate()).toBe(false);
    input.dispose();
    expect(input.poll('drone').throttleDelta).toBe(0);
  });
});

describe('gamepad safety and mode mapping', () => {
  it('allows Escape from settings and preserves Space activation on focused buttons', () => {
    const listeners = new Map<string, (event: unknown) => void>();
    vi.stubGlobal('window', {
      addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    });
    const documentStub = {
      activeElement: { tagName: 'INPUT', isContentEditable: false }, hidden: false,
      addEventListener: () => {}, removeEventListener: () => {},
    };
    vi.stubGlobal('document', documentStub);
    const action = vi.fn();
    const input = new FlightInputManager(settings, action, () => {});
    const escape = { code: 'Escape', repeat: false, preventDefault: vi.fn() };
    listeners.get('keydown')!(escape);
    expect(action).toHaveBeenCalledExactlyOnceWith('pause');
    expect(escape.preventDefault).toHaveBeenCalledOnce();
    listeners.get('keydown')!({ code: 'KeyR', repeat: false, preventDefault: vi.fn() });
    expect(action).toHaveBeenCalledTimes(1);
    documentStub.activeElement.tagName = 'BUTTON';
    listeners.get('keydown')!({ code: 'KeyR', repeat: false, preventDefault: vi.fn() });
    expect(action).toHaveBeenLastCalledWith('reset');
    expect(action).toHaveBeenCalledTimes(2);
    const space = { code: 'Space', repeat: false, preventDefault: vi.fn() };
    listeners.get('keydown')!(space);
    expect(space.preventDefault).not.toHaveBeenCalled();
    expect(input.poll('drone').brake).toBe(false);
    input.dispose();
  });

  it.each(['BUTTON', 'INPUT', 'SELECT'])('allows gamepad Start through a focused %s while suppressing flight input', tagName => {
    const pad = standardPad([1, -1, 1, -1]);
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    vi.stubGlobal('document', { activeElement: { tagName, isContentEditable: false }, hidden: false });
    const action = vi.fn();
    const input = new FlightInputManager(settings, action, () => {});
    input.poll('space');
    Object.assign(pad.buttons[9], { pressed: true });
    Object.assign(pad.buttons[2], { pressed: true });
    expect(input.poll('space')).toMatchObject({ pitch: 0, roll: 0, yaw: 0, moveX: 0, moveY: 0, moveZ: 0 });
    input.poll('space');
    expect(action).toHaveBeenCalledExactlyOnceWith('pause');
    Object.assign(pad.buttons[9], { pressed: false });
    input.poll('space');
    Object.assign(pad.buttons[9], { pressed: true });
    input.poll('space');
    expect(action.mock.calls).toEqual([['pause'], ['pause']]);
    input.dispose();
  });

  it('does not pause or defer a Start press while the page is hidden', () => {
    const pad = standardPad();
    const documentStub = { activeElement: null, hidden: true };
    vi.stubGlobal('document', documentStub);
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const action = vi.fn();
    const input = new FlightInputManager(settings, action, () => {});
    Object.assign(pad.buttons[9], { pressed: true });
    input.poll('drone');
    documentStub.hidden = false;
    input.poll('drone');
    expect(action).not.toHaveBeenCalled();
    Object.assign(pad.buttons[9], { pressed: false });
    input.poll('drone');
    Object.assign(pad.buttons[9], { pressed: true });
    input.poll('drone');
    expect(action).toHaveBeenCalledExactlyOnceWith('pause');
    input.dispose();
  });

  it('maps drone throttle and space translation separately', () => {
    const pad = standardPad([0.55, -0.55, 0.55, 0.55]);
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const input = new FlightInputManager(settings, () => {}, () => {});
    const drone = input.poll('drone');
    expect(drone.yaw).toBeCloseTo(0.5);
    expect(drone.roll).toBeCloseTo(0.5);
    expect(drone.pitch).toBeCloseTo(0.5);
    expect(drone.throttleDelta).toBeCloseTo(0.5);
    const space = input.poll('space');
    expect(space.moveX).toBeCloseTo(0.5);
    expect(space.moveY).toBeCloseTo(0.5);
    expect(space.yaw).toBeCloseTo(0.5);
    expect(space.throttleDelta).toBe(0);
    expect(space.roll).toBe(0);
    expect(input.activeDevice).toBe('gamepad');
    input.dispose();
  });

  it('fires actions once per press and reports disconnect once', () => {
    const pad = standardPad();
    let pads: Gamepad[] = [pad];
    vi.stubGlobal('navigator', { getGamepads: () => pads });
    const action = vi.fn();
    const disconnected = vi.fn();
    const input = new FlightInputManager(settings, action, disconnected);
    input.poll('drone');
    Object.assign(pad.buttons[9], { pressed: true });
    input.poll('drone');
    input.poll('drone');
    expect(action).toHaveBeenCalledExactlyOnceWith('pause');
    Object.assign(pad.buttons[9], { pressed: false });
    input.poll('drone');
    Object.assign(pad.buttons[9], { pressed: true });
    input.poll('drone');
    expect(action).toHaveBeenCalledTimes(2);
    pads = [];
    input.poll('drone');
    input.poll('drone');
    expect(disconnected).toHaveBeenCalledTimes(1);
    expect(input.activeDevice).toBe('keyboard');
    input.dispose();
  });

  it('does not apply an unknown controller layout', () => {
    const pad = { ...standardPad([1, -1, 1, -1]), mapping: '' };
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const input = new FlightInputManager(settings, () => {}, () => {});
    expect(input.poll('drone').throttleDelta).toBe(0);
    expect(input.controllerName).toContain('unsupported mapping');
    expect(input.calibrate()).toBe(false);
    input.dispose();
  });

  it('survives blocked browser permissions and malformed trigger values', () => {
    const pad = standardPad();
    Object.assign(pad.buttons[6], { value: NaN });
    Object.assign(pad.buttons[7], { value: 10 });
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const input = new FlightInputManager(settings, () => {}, () => {});
    expect(input.poll('space').moveZ).toBe(1);
    vi.stubGlobal('navigator', { getGamepads: () => { throw new Error('Blocked by permissions policy'); } });
    expect(input.poll('space').moveZ).toBe(0);
    expect(input.connected).toBe(false);
    input.dispose();
  });
});
