import type { FlightInput, FlightMode, InputAction, InputSettings } from './types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const CALIBRATION_KEY = 'flightlab.controller-calibration.v1';

/** Rescale a centered axis after its deadzone, then blend a linear and cubic curve. */
export function processAxis(value: number, settings: InputSettings, offset = 0): number {
  if (!Number.isFinite(value)) return 0;
  const centered = clamp(value - finite(offset), -1, 1);
  const deadzone = clamp(finite(settings.deadzone, 0.08), 0, 0.95);
  if (Math.abs(centered) <= deadzone) return 0;
  const magnitude = (Math.abs(centered) - deadzone) / (1 - deadzone);
  const expo = clamp(finite(settings.expo, 0.25), 0, 1);
  const sensitivity = clamp(finite(settings.sensitivity, 1), 0, 3);
  const curved = ((1 - expo) * magnitude + expo * magnitude ** 3) * sensitivity;
  return Math.sign(centered) * clamp(curved, 0, 1);
}

const keyActions: Record<string, InputAction> = {
  Escape: 'pause', KeyR: 'reset', KeyC: 'camera', KeyF: 'assist',
};
const flightKeys = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS',
  'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'KeyZ', 'KeyX', 'Space', 'ShiftLeft', 'ShiftRight',
  ...Object.keys(keyActions),
]);

function editableFocused(): boolean {
  if (typeof document === 'undefined') return false;
  const element = document.activeElement as HTMLElement | null;
  return !!element && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(element.tagName));
}

const emptyInput = (): FlightInput => ({
  pitch: 0, roll: 0, yaw: 0, throttleDelta: 0, moveX: 0, moveY: 0, moveZ: 0, brake: false, boost: false,
});

export class FlightInputManager {
  private settings: InputSettings;
  private keys = new Set<string>();
  private lastButtons: boolean[] = [];
  private pad: Gamepad | null = null;
  private device: 'keyboard' | 'gamepad' = 'keyboard';
  private calibrations: Record<string, number[]> = {};
  private rumbleUntil = 0;
  private disposed = false;

  constructor(
    settings: InputSettings,
    private readonly onAction: (action: InputAction) => void,
    private readonly onDisconnect: () => void,
  ) {
    this.settings = { ...settings };
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(CALIBRATION_KEY) || '{}');
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        for (const [id, axes] of Object.entries(stored)) {
          if (Array.isArray(axes) && axes.length <= 32 && axes.every(axis => typeof axis === 'number' && Number.isFinite(axis) && Math.abs(axis) <= 0.35)) {
            this.calibrations[id] = axes;
          }
        }
      }
    } catch { /* Storage may be unavailable in private or restricted contexts. */ }
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDown);
      window.addEventListener('keyup', this.handleKeyUp);
      window.addEventListener('blur', this.clearKeys);
      window.addEventListener('gamepaddisconnected', this.handleDisconnect);
      document.addEventListener('visibilitychange', this.handleVisibility);
    }
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    const action = keyActions[event.code];
    const buttonFocused = typeof document !== 'undefined' && document.activeElement?.tagName === 'BUTTON';
    const focusedShortcut = event.code === 'Escape' || (buttonFocused && !!action);
    if (!flightKeys.has(event.code) || (editableFocused() && !focusedShortcut)) return;
    event.preventDefault();
    this.device = 'keyboard';
    if (action && !event.repeat) this.onAction(action);
    this.keys.add(event.code);
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private clearKeys = (): void => { this.keys.clear(); };
  private handleVisibility = (): void => {
    if (document.hidden) this.clearKeys();
  };

  private handleDisconnect = (event: GamepadEvent): void => {
    if (this.pad?.index === event.gamepad.index) this.disconnect();
  };

  private disconnect(): void {
    const wasConnected = this.pad !== null;
    this.pad = null;
    this.lastButtons = [];
    this.device = 'keyboard';
    if (wasConnected) this.onDisconnect();
  }

  private readGamepad(): Gamepad | null {
    try {
      if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
      const pads = Array.from(navigator.getGamepads()).filter((pad): pad is Gamepad => !!pad?.connected);
      const previous = this.pad;
      const next = pads.find(pad => pad.index === previous?.index) ?? pads.find(pad => pad.mapping === 'standard') ?? pads[0] ?? null;
      if (previous && !pads.some(pad => pad.index === previous.index)) this.disconnect();
      if (next?.id !== this.pad?.id || next?.index !== this.pad?.index) this.lastButtons = [];
      this.pad = next;
      return next;
    } catch {
      if (this.pad) this.disconnect();
      return null;
    }
  }

  poll(mode: FlightMode): FlightInput {
    if (this.disposed) return emptyInput();
    const pad = this.readGamepad();
    const hidden = typeof document !== 'undefined' && document.hidden;
    const suppressed = editableFocused() || hidden;
    const result = emptyInput();
    const key = (code: string) => this.keys.has(code) ? 1 : 0;
    if (suppressed) this.clearKeys();
    if (!suppressed) {
      result.pitch = key('ArrowDown') - key('ArrowUp');
      result.roll = key('ArrowRight') - key('ArrowLeft');
      result.brake = this.keys.has('Space');
      result.boost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      if (mode === 'space') {
        result.moveX = key('KeyD') - key('KeyA');
        result.moveY = key('KeyX') - key('KeyZ');
        result.moveZ = key('KeyW') - key('KeyS');
        result.yaw = key('ArrowRight') - key('ArrowLeft');
        result.roll = key('KeyE') - key('KeyQ');
      } else {
        result.yaw = key('KeyD') - key('KeyA');
        result.throttleDelta = key('KeyW') - key('KeyS');
      }
    }

    if (pad?.mapping === 'standard') {
      const offsets = this.calibrations[pad.id] ?? [];
      const axis = (index: number) => processAxis(pad.axes[index] ?? 0, this.settings, offsets[index] ?? 0);
      const pressed = (index: number) => !!pad.buttons[index]?.pressed;
      const trigger = (index: number) => clamp(finite(pad.buttons[index]?.value ?? 0), 0, 1);
      const buttons = pad.buttons.map(button => !!button.pressed);
      // Start remains available on pause/settings controls, just like Escape on the keyboard.
      if (!hidden && buttons[9] && !this.lastButtons[9]) {
        this.device = 'gamepad';
        this.onAction('pause');
      }
      if (!suppressed) {
        const actions: [number, InputAction][] = [[1, 'assist'], [2, 'camera'], [3, 'reset']];
        for (const [index, action] of actions) {
          if (buttons[index] && !this.lastButtons[index]) this.onAction(action);
        }
        const lx = axis(0), ly = axis(1), rx = axis(2), ry = axis(3);
        if ([lx, ly, rx, ry].some(value => Math.abs(value) > 0.02) || buttons.some(Boolean) || trigger(6) > 0.1 || trigger(7) > 0.1) {
          this.device = 'gamepad';
        }
        result.pitch = clamp(result.pitch + ry, -1, 1);
        result.brake ||= pressed(0);
        result.boost ||= pressed(10);
        if (mode === 'space') {
          result.moveX = clamp(result.moveX + lx, -1, 1);
          result.moveY = clamp(result.moveY - ly, -1, 1);
          result.moveZ = clamp(result.moveZ + trigger(7) - trigger(6), -1, 1);
          result.yaw = clamp(result.yaw + rx, -1, 1);
          result.roll = clamp(result.roll + Number(pressed(5)) - Number(pressed(4)), -1, 1);
        } else {
          result.yaw = clamp(result.yaw + lx, -1, 1);
          result.roll = clamp(result.roll + rx, -1, 1);
          result.throttleDelta = clamp(result.throttleDelta - ly, -1, 1);
        }
      }
      // Consume edges while a settings control is focused, so closing it cannot fire an action.
      this.lastButtons = buttons;
    }
    if (this.settings.invertPitch) result.pitch *= -1;
    return result;
  }

  updateSettings(settings: InputSettings): void { this.settings = { ...settings }; }

  /** Call only with both sticks released. Reject off-center readings rather than hiding them. */
  calibrate(): boolean {
    const pad = this.readGamepad();
    if (!pad || pad.mapping !== 'standard' || pad.axes.length < 4) return false;
    const offsets = Array.from(pad.axes).slice(0, 4);
    if (offsets.some(axis => !Number.isFinite(axis) || Math.abs(axis) > 0.35)) return false;
    this.calibrations[pad.id] = offsets;
    try { localStorage.setItem(CALIBRATION_KEY, JSON.stringify(this.calibrations)); } catch { /* In-memory calibration still applies. */ }
    return true;
  }

  rumble(strength: number, duration = 100): void {
    if (!this.settings.vibration || !this.pad || this.disposed) return;
    const now = performance.now();
    if (now < this.rumbleUntil) return;
    const intensity = clamp(finite(strength), 0, 1);
    if (intensity === 0) return;
    const milliseconds = clamp(finite(duration, 100), 10, 1000);
    const actuator = this.pad.vibrationActuator;
    if (!actuator || typeof actuator.playEffect !== 'function') return;
    this.rumbleUntil = now + Math.min(milliseconds, 120);
    try {
      void actuator.playEffect('dual-rumble', {
        startDelay: 0, duration: milliseconds, weakMagnitude: intensity, strongMagnitude: intensity * 0.7,
      }).catch(() => { /* The browser or controller may refuse vibration. */ });
    } catch { /* Some devices expose an actuator without supporting dual-rumble. */ }
  }

  get controllerName(): string {
    if (!this.pad) return 'Keyboard';
    return this.pad.mapping === 'standard' ? this.pad.id : `${this.pad.id} — unsupported mapping; use keyboard`;
  }
  get connected(): boolean { return this.pad !== null; }
  get rawAxes(): number[] { return this.pad ? Array.from(this.pad.axes).map(axis => finite(axis)) : []; }
  get activeDevice(): 'keyboard' | 'gamepad' { return this.device; }

  dispose(): void {
    this.disposed = true;
    this.clearKeys();
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDown);
      window.removeEventListener('keyup', this.handleKeyUp);
      window.removeEventListener('blur', this.clearKeys);
      window.removeEventListener('gamepaddisconnected', this.handleDisconnect);
      document.removeEventListener('visibilitychange', this.handleVisibility);
    }
    try { void this.pad?.vibrationActuator?.reset().catch(() => {}); } catch { /* Optional capability. */ }
  }
}
