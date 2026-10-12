import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAxisProfile, FlightInputManager, processAxis, validateAxisProfile } from '../src/input';
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

describe('controller profiles and calibration', () => {
  it('swaps conflicting bindings, rejects invalid values, and returns an isolated copy', () => {
    const input = new FlightInputManager(settings, () => {}, () => {});
    input.setBinding('brake', 2);
    expect(input.getBindings()).toMatchObject({ brake: 2, camera: 0 });
    input.setBinding('assist', -1);
    input.setBinding('reset', 4.5);
    input.setBinding('boost', 100);
    for (const reserved of [4, 5, 6, 7]) input.setBinding('assist', reserved);
    expect(input.getBindings()).toMatchObject({ assist: 1, reset: 3, boost: 10 });
    const copy = input.getBindings();
    copy.brake = 8;
    expect(input.getBindings().brake).toBe(2);
    input.resetBindings();
    expect(input.getBindings()).toMatchObject({ brake: 0, camera: 2 });
  });

  it('persists validated per-device bindings and southpaw layout', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) });
    const pad = standardPad([0.55, 0, 0, -0.55]);
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const first = new FlightInputManager(settings, () => {}, () => {});
    first.poll('drone');
    first.setBinding('brake', 2);
    first.stickLayout = 'southpaw';
    first.dispose();
    const second = new FlightInputManager(settings, () => {}, () => {});
    const flight = second.poll('drone');
    expect(second.getBindings().brake).toBe(2);
    expect(second.stickLayout).toBe('southpaw');
    expect(flight.roll).toBeCloseTo(0.5);
    expect(flight.throttleDelta).toBeCloseTo(0.5);
    expect(flight.yaw).toBe(0);
    const another = { ...pad, id: 'Another controller' };
    vi.stubGlobal('navigator', { getGamepads: () => [another] });
    second.poll('drone');
    expect(second.getBindings().brake).toBe(0);
    expect(second.stickLayout).toBe('standard');
  });

  it('rejects corrupt stored profiles and tolerates failed writes', () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => key.includes('profiles') ? JSON.stringify({ default: { bindings: { brake: 0, assist: 0, reset: 3, boost: 10, camera: 2, pause: 9 }, layout: 'invalid', range: { min: [0, 0, 0, 0], max: [1, 1, 1, 1] } } }) : '{}',
      setItem: () => { throw new Error('Storage blocked'); },
    });
    const input = new FlightInputManager(settings, () => {}, () => {});
    expect(input.getBindings()).toMatchObject({ brake: 0, assist: 1 });
    expect(input.stickLayout).toBe('standard');
    expect(() => input.setBinding('brake', 2)).not.toThrow();
    expect(input.getBindings().brake).toBe(2);
  });

  it('discards saved profiles that assign fixed spacecraft buttons to another action', () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => key.includes('profiles') ? JSON.stringify({ default: { bindings: { brake: 6, assist: 1, reset: 3, boost: 10, camera: 2, pause: 9 } } }) : '{}',
    });
    const input = new FlightInputManager(settings, () => {}, () => {});
    expect(input.getBindings().brake).toBe(0);
  });

  it('captures both ends of all four axes and scales asymmetrical travel around calibrated centers', () => {
    const axes = [0.1, 0.1, 0.1, 0.1];
    const pad = standardPad(axes);
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const input = new FlightInputManager(settings, () => {}, () => {});
    expect(input.calibrate()).toBe(true);
    expect(input.beginRangeCalibration()).toBe(true);
    axes.fill(-0.6); input.poll('drone');
    axes.fill(0.8); input.poll('drone');
    expect(input.finishRangeCalibration()).toBe(true);
    expect(input.rangeCalibrating).toBe(false);
    expect(input.poll('drone')).toMatchObject({ pitch: 1, roll: 1, yaw: 1, throttleDelta: -1 });
    axes.fill(-0.6);
    expect(input.poll('drone')).toMatchObject({ pitch: -1, roll: -1, yaw: -1, throttleDelta: 1 });
    axes.fill(0.1);
    expect(input.poll('drone').roll).toBe(0);
    axes.fill(0.485);
    expect(input.poll('drone').roll).toBeCloseTo(0.5);
    input.resetCalibration();
    expect(input.poll('drone').roll).toBeCloseTo((0.485 - 0.1) / 0.9);
  });

  it('keeps incomplete sweeps open and does not change the applied calibration', () => {
    const axes = [0, 0, 0, 0];
    const pad = standardPad(axes);
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const input = new FlightInputManager(settings, () => {}, () => {});
    input.beginRangeCalibration();
    axes.fill(0.8); input.poll('drone');
    axes[0] = -0.8; input.poll('drone');
    expect(input.finishRangeCalibration()).toBe(false);
    expect(input.rangeCalibrating).toBe(true);
    expect(input.poll('drone').roll).toBeCloseTo(0.7 / 0.9);
    axes.fill(-0.8); input.poll('drone');
    expect(input.finishRangeCalibration()).toBe(true);
    expect(input.poll('drone').roll).toBe(-1);
  });

  it('cancels an unfinished sweep without losing the saved center or range', () => {
    const axes = [0.1, 0.1, 0.1, 0.1];
    const pad = standardPad(axes);
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const input = new FlightInputManager(settings, () => {}, () => {});
    input.calibrate(); input.beginRangeCalibration();
    axes.fill(-0.6); input.poll('drone'); axes.fill(0.8); input.poll('drone');
    expect(input.finishRangeCalibration()).toBe(true);
    input.beginRangeCalibration();
    axes.fill(-1); input.poll('drone'); axes.fill(1); input.poll('drone');
    input.cancelRangeCalibration();
    expect(input.rangeCalibrating).toBe(false);
    expect(input.finishRangeCalibration()).toBe(false);
    axes.fill(0.1); expect(input.poll('drone').roll).toBe(0);
    axes.fill(0.8); expect(input.poll('drone').roll).toBe(1);
    axes.fill(-0.6); expect(input.poll('drone').roll).toBe(-1);
  });
});

describe('controller menu navigation', () => {
  it('suppresses flight and emits menu directions with a delayed repeat', () => {
    let now = 0;
    vi.stubGlobal('performance', { now: () => now });
    const axes = [0, 0, 0, 0];
    const pad = standardPad(axes);
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const action = vi.fn(), menu = vi.fn();
    const input = new FlightInputManager(settings, action, () => {});
    input.setMenuHandler(menu);
    input.setContext('menu'); input.poll('space');
    axes[1] = 0.8;
    expect(input.poll('space').moveY).toBe(0);
    expect(menu).toHaveBeenCalledExactlyOnceWith('down');
    now = 419; input.poll('space'); expect(menu).toHaveBeenCalledTimes(1);
    now = 420; input.poll('space'); expect(menu).toHaveBeenCalledTimes(2);
    now = 559; input.poll('space'); expect(menu).toHaveBeenCalledTimes(2);
    now = 560; input.poll('space'); expect(menu).toHaveBeenCalledTimes(3);
    Object.assign(pad.buttons[2], { pressed: true }); input.poll('space');
    expect(action).not.toHaveBeenCalled();
    axes[1] = 0;
    Object.assign(pad.buttons[0], { pressed: true }); input.poll('space');
    expect(menu).toHaveBeenLastCalledWith('confirm');
    Object.assign(pad.buttons[1], { pressed: true }); input.poll('space');
    expect(menu).toHaveBeenLastCalledWith('back');
    Object.assign(pad.buttons[9], { pressed: true }); input.poll('space');
    expect(action).toHaveBeenCalledExactlyOnceWith('pause');
  });

  it('requires release before flight after confirming a launch', () => {
    const pad = standardPad();
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const input = new FlightInputManager(settings, () => {}, () => {});
    input.setMenuHandler(action => { if (action === 'confirm') input.setContext('flight'); });
    input.setContext('menu'); input.poll('drone');
    Object.assign(pad.buttons[0], { pressed: true });
    expect(input.poll('drone').brake).toBe(false);
    expect(input.poll('drone').brake).toBe(false);
    Object.assign(pad.buttons[0], { pressed: false }); input.poll('drone');
    Object.assign(pad.buttons[0], { pressed: true });
    expect(input.poll('drone').brake).toBe(true);
  });

  it('does not let stick range calibration move menu focus', () => {
    const axes = [0, 0, 0, 0];
    const pad = standardPad(axes);
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const menu = vi.fn();
    const input = new FlightInputManager(settings, () => {}, () => {});
    input.setMenuHandler(menu); input.setContext('menu'); input.poll('drone');
    input.beginRangeCalibration();
    axes.fill(-0.8); input.poll('drone'); axes.fill(0.8); input.poll('drone');
    expect(menu).not.toHaveBeenCalled();
    Object.assign(pad.buttons[13], { pressed: true }); input.poll('drone');
    expect(menu).toHaveBeenCalledExactlyOnceWith('down');
    expect(input.finishRangeCalibration()).toBe(true);
  });

  it('uses remapped flight actions while retaining fixed menu buttons', () => {
    const pad = standardPad();
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const action = vi.fn(), menu = vi.fn();
    const input = new FlightInputManager(settings, action, () => {});
    input.poll('drone'); input.setBinding('camera', 1);
    Object.assign(pad.buttons[1], { pressed: true }); input.poll('drone');
    expect(action).toHaveBeenCalledExactlyOnceWith('camera');
    Object.assign(pad.buttons[1], { pressed: false }); input.poll('drone');
    input.setContext('menu'); input.setMenuHandler(menu); input.poll('drone');
    Object.assign(pad.buttons[1], { pressed: true }); input.poll('drone');
    expect(menu).toHaveBeenCalledExactlyOnceWith('back');
    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe('axis freedom and RC profiles', () => {
  it.each(['pitch', 'roll', 'yaw', 'throttle', 'moveX', 'moveY', 'moveZ'] as const)('remaps and inverts the %s channel independently', channel => {
    const axes = Array(8).fill(0), pad = standardPad(axes);
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const input = new FlightInputManager(settings, () => {}, () => {});
    input.poll('drone');
    const profile = input.getAxisProfile();
    profile.channels[channel] = { ...profile.channels[channel], source: 'axis', axis: 7, inverted: true };
    expect(input.setAxisProfile(profile)).toBe(true);
    const mode = channel.startsWith('move') ? 'space' : 'drone';
    input.poll(mode); axes[7] = 0.55;
    const result = input.poll(mode);
    expect(channel === 'throttle' ? result.throttleDelta : result[channel]).toBeCloseTo(-0.5);
    input.dispose();
  });

  it.each(['pitch', 'roll', 'yaw'] as const)('keeps the spacecraft %s mapping independent from atmosphere', channel => {
    const axes = Array(8).fill(0), pad = standardPad(axes);
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const input = new FlightInputManager(settings, () => {}, () => {});
    input.poll('drone');
    const profile = input.getAxisProfile();
    profile.spaceRotation[channel] = { ...profile.spaceRotation[channel], source: 'axis', axis: 7 };
    input.setAxisProfile(profile); input.poll('space'); axes[7] = 1;
    expect(input.poll('space')[channel]).toBe(1);
    expect(input.poll('drone')[channel]).toBe(0);
    input.dispose();
  });

  it('supports button pairs for any channel and prevents duplicate action activation', () => {
    const pad = standardPad();
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const action = vi.fn(), input = new FlightInputManager(settings, action, () => {});
    input.poll('drone');
    const profile = input.getAxisProfile();
    profile.channels.pitch = { ...profile.channels.pitch, source: 'buttons', negativeButton: 2, positiveButton: 3 };
    input.setAxisProfile(profile); input.poll('drone');
    expect(input.getBindings().camera).not.toBe(2);
    expect(input.getBindings().reset).not.toBe(3);
    Object.assign(pad.buttons[3], { pressed: true });
    expect(input.poll('drone').pitch).toBe(1);
    expect(action).not.toHaveBeenCalled();
    Object.assign(pad.buttons[3], { pressed: false });
    Object.assign(pad.buttons[2], { value: 0.4 });
    expect(input.poll('drone').pitch).toBeCloseTo(-0.4);
    input.dispose();
  });

  it('provides distinct RC mode1/mode2 and southpaw presets', () => {
    const one = createAxisProfile('mode1'), two = createAxisProfile('mode2'), left = createAxisProfile('southpaw');
    expect(one.channels.pitch.axis).toBe(1);
    expect(one.channels.throttle.axis).toBe(3);
    expect(two.channels.pitch.axis).toBe(3);
    expect(two.channels.throttle.axis).toBe(1);
    expect(one.throttleMode).toBe('absolute');
    expect(two.allowNonStandard).toBe(true);
    expect(left.channels.roll.axis).toBe(0);
    expect(left.channels.yaw.axis).toBe(2);
  });

  it('requires explicit nonstandard opt-in and an idle throttle before absolute commands', () => {
    const axes = [0, -1, 0, 0], pad = { ...standardPad(axes), mapping: '' as GamepadMappingType };
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const input = new FlightInputManager(settings, () => {}, () => {});
    expect(input.poll('drone').throttle).toBeUndefined();
    input.applyAxisPreset('mode2');
    expect(input.poll('drone').throttle).toBeUndefined(); // High throttle is latched out.
    axes[1] = 0;
    expect(input.poll('drone').throttle).toBeUndefined(); // Center is not idle.
    axes[1] = 1; input.poll('drone');
    expect(input.poll('drone').throttle).toBe(0);
    axes[1] = 0;
    expect(input.poll('drone').throttle).toBe(0.5);
    axes[1] = -1;
    expect(input.poll('drone').throttle).toBe(1);
    expect(input.poll('drone').throttleDelta).toBe(0);
    expect(input.controllerName).toContain('custom USB profile');
    input.dispose();
  });

  it('lets button-pair absolute throttle pass the idle gate while its idle button is held', () => {
    const pad = standardPad();
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const input = new FlightInputManager(settings, () => {}, () => {});
    input.poll('drone');
    const profile = input.getAxisProfile();
    profile.throttleMode = 'absolute';
    profile.channels.throttle = { ...profile.channels.throttle, source: 'buttons', negativeButton: 12, positiveButton: 13, inverted: false };
    input.setAxisProfile(profile);
    Object.assign(pad.buttons[12], { pressed: true, value: 1 });
    input.poll('drone');
    expect(input.poll('drone').throttle).toBe(0);
    Object.assign(pad.buttons[12], { pressed: false, value: 0 });
    expect(input.poll('drone').throttle).toBe(0.5);
    input.dispose();
  });

  it('applies independent per-axis deadzone, expo, rate and center curves', () => {
    const axes = [0, 0, 0, 0], pad = standardPad(axes);
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const input = new FlightInputManager(settings, () => {}, () => {});
    input.poll('drone');
    const profile = input.getAxisProfile();
    profile.channels.roll = { ...profile.channels.roll, deadzone: 0, expo: 1, rate: 0.5, center: 0.5 };
    input.setAxisProfile(profile); input.poll('drone');
    axes[2] = 0.5; axes[3] = 0.55;
    expect(input.poll('drone').roll).toBeCloseTo((0.5 * 0.125 + 0.5 * 0.125 ** 2) * 0.5);
    expect(input.poll('drone').pitch).toBeCloseTo(0.5);
    axes[2] = 1;
    expect(input.poll('drone').roll).toBeCloseTo(0.5);
    input.dispose();
  });

  it('calibrates mapped axes through index7, persists travel and ignores unused sliders', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) });
    const axes = [0, 0, 0, 0, 1, 1, -1, 0.1], pad = standardPad(axes);
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const input = new FlightInputManager(settings, () => {}, () => {});
    input.poll('drone');
    const profile = input.getAxisProfile(); profile.channels.roll.axis = 7;
    input.setAxisProfile(profile); input.poll('drone');
    expect(input.calibrate()).toBe(true);
    expect(input.beginRangeCalibration()).toBe(true);
    for (const i of [0, 1, 2, 3, 7]) axes[i] = -0.6;
    input.poll('drone');
    for (const i of [0, 1, 2, 3, 7]) axes[i] = 0.8;
    input.poll('drone');
    expect(input.finishRangeCalibration()).toBe(true);
    input.dispose();
    const restored = new FlightInputManager(settings, () => {}, () => {});
    expect(restored.poll('drone').roll).toBe(1);
    axes[7] = -0.6;
    expect(restored.poll('drone').roll).toBe(-1);
    axes[7] = 0.1;
    expect(restored.poll('drone').roll).toBe(0);
    restored.dispose();
  });

  it('imports only validated profiles and protects callers from shared mutable objects', () => {
    const input = new FlightInputManager(settings, () => {}, () => {});
    const original = input.exportAxisProfile();
    for (const text of ['null', '{', '{}', JSON.stringify({ ...createAxisProfile(), version: 99 }), ' '.repeat(32769)]) {
      expect(input.importAxisProfile(text)).toBe(false);
      expect(input.exportAxisProfile()).toBe(original);
    }
    const corrupt = createAxisProfile(); corrupt.channels.pitch.axis = 32;
    expect(validateAxisProfile(corrupt)).toBeNull();
    corrupt.channels.pitch.axis = 3; corrupt.channels.pitch.expo = NaN;
    expect(input.setAxisProfile(corrupt)).toBe(false);
    const custom = createAxisProfile('mode1');
    expect(input.importAxisProfile(JSON.stringify(custom))).toBe(true);
    const copy = input.getAxisProfile(); copy.channels.pitch.axis = 7;
    expect(input.getAxisProfile().channels.pitch.axis).toBe(1);
    const sample = input.poll('drone'); sample.pitch = 1;
    expect(input.getLastInput().pitch).toBe(0);
    input.getLastInput().pitch = 1;
    expect(input.getLastInput().pitch).toBe(0);
    expect(input.getAxisFields()).toHaveLength(10);
    input.dispose();
  });

  it('uses Back/Share or V for arming once per press', () => {
    const listeners = new Map<string, (event: unknown) => void>();
    vi.stubGlobal('window', { addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener), removeEventListener: (type: string) => listeners.delete(type) });
    const pad = standardPad();
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const action = vi.fn(), input = new FlightInputManager(settings, action, () => {});
    input.poll('drone');
    Object.assign(pad.buttons[8], { pressed: true }); input.poll('drone'); input.poll('drone');
    expect(action).toHaveBeenCalledExactlyOnceWith('arm');
    listeners.get('keydown')!({ code: 'KeyV', repeat: false, preventDefault: () => {} });
    listeners.get('keydown')!({ code: 'KeyV', repeat: true, preventDefault: () => {} });
    expect(action.mock.calls).toEqual([['arm'], ['arm']]);
    input.dispose();
  });
});
