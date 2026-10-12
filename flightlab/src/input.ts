import type { FlightInput, FlightMode, InputAction, InputSettings } from './types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const CALIBRATION_KEY = 'flightlab.controller-calibration.v1';
const PROFILES_KEY = 'flightlab.controller-profiles.v2';
export type ButtonAction = 'brake' | 'assist' | 'camera' | 'reset' | 'boost' | 'pause';
export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back';
export type StickLayout = 'standard' | 'southpaw';
export const BUTTON_LABELS: readonly string[] = [
  'A / Cross', 'B / Circle', 'X / Square', 'Y / Triangle', 'LB / L1', 'RB / R1',
  'LT / L2', 'RT / R2', 'Back / Share', 'Start / Options', 'Left Stick', 'Right Stick',
  'D-pad Up', 'D-pad Down', 'D-pad Left', 'D-pad Right', 'Home',
];
const DEFAULT_BINDINGS: Record<ButtonAction, number> = { brake: 0, assist: 1, camera: 2, reset: 3, boost: 10, pause: 9 };
const RESERVED_BUTTONS = new Set([4, 5, 6, 7]); // Spacecraft roll and translation axes.
interface AxisRange { min: number[]; max: number[]; }
interface ControllerProfile { bindings: Record<ButtonAction, number>; layout: StickLayout; range?: AxisRange; }
interface RangeSession extends AxisRange { id: string; }
const freshProfile = (): ControllerProfile => ({ bindings: { ...DEFAULT_BINDINGS }, layout: 'standard' });

/** Rescale a centered axis after its deadzone, then blend a linear and cubic curve. */
export function processAxis(value: number, settings: InputSettings, offset = 0): number {
  if (!Number.isFinite(value)) return 0;
  const centered = clamp(value - finite(offset), -1, 1);
  const deadzone = clamp(finite(settings.deadzone, 0.08), 0, 0.95);
  if (Math.abs(centered) <= deadzone) return 0;
  const magnitude = (Math.abs(centered) - deadzone) / (1 - deadzone);
  const expo = clamp(finite(settings.expo, 0.25), 0, 1);
  const sensitivity = clamp(finite(settings.sensitivity, 1), 0, 3);
  return Math.sign(centered) * clamp(((1 - expo) * magnitude + expo * magnitude ** 3) * sensitivity, 0, 1);
}

const keyActions: Record<string, InputAction> = { Escape: 'pause', KeyR: 'reset', KeyC: 'camera', KeyF: 'assist' };
const menuKeys: Record<string, MenuAction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'confirm', Space: 'confirm', Escape: 'back',
};
const flightKeys = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD',
  'KeyQ', 'KeyE', 'KeyZ', 'KeyX', 'Space', 'ShiftLeft', 'ShiftRight', ...Object.keys(keyActions),
]);
function editableFocused(): boolean {
  if (typeof document === 'undefined') return false;
  const element = document.activeElement as HTMLElement | null;
  return !!element && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(element.tagName));
}
const emptyInput = (): FlightInput => ({
  pitch: 0, roll: 0, yaw: 0, throttleDelta: 0, moveX: 0, moveY: 0, moveZ: 0, brake: false, boost: false,
});
const validAxes = (value: unknown, limit: number): value is number[] =>
  Array.isArray(value) && value.length >= 4 && value.length <= 32 && value.every(axis => typeof axis === 'number' && Number.isFinite(axis) && Math.abs(axis) <= limit);

export class FlightInputManager {
  private settings: InputSettings;
  private keys = new Set<string>();
  private heldKeys = new Set<string>();
  private lastButtons: boolean[] = [];
  private pad: Gamepad | null = null;
  private device: 'keyboard' | 'gamepad' = 'keyboard';
  private calibrations: Record<string, number[]> = Object.create(null);
  private profiles: Record<string, ControllerProfile> = Object.create(null);
  private rangeSession: RangeSession | null = null;
  private context: 'flight' | 'menu' = 'flight';
  private menuHandler: (action: MenuAction) => void = () => {};
  private requireNeutral = false;
  private direction: MenuAction | null = null;
  private nextRepeat = 0;
  private rumbleUntil = 0;
  private disposed = false;

  constructor(settings: InputSettings, private readonly onAction: (action: InputAction) => void, private readonly onDisconnect: () => void) {
    this.settings = { ...settings };
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(CALIBRATION_KEY) || '{}');
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        for (const [id, axes] of Object.entries(stored)) if (validAxes(axes, 0.35)) this.calibrations[id] = axes.slice(0, 4);
      }
      const profiles: unknown = JSON.parse(localStorage.getItem(PROFILES_KEY) || '{}');
      if (profiles && typeof profiles === 'object' && !Array.isArray(profiles)) {
        for (const [id, raw] of Object.entries(profiles)) {
          if (!raw || typeof raw !== 'object') continue;
          const profile = freshProfile();
          const candidate = raw as Partial<ControllerProfile>;
          const bindings = candidate.bindings;
          if (bindings && Object.keys(DEFAULT_BINDINGS).every(action => Number.isInteger(bindings[action as ButtonAction]) && bindings[action as ButtonAction] >= 0 && bindings[action as ButtonAction] < BUTTON_LABELS.length && !RESERVED_BUTTONS.has(bindings[action as ButtonAction]))
            && new Set(Object.keys(DEFAULT_BINDINGS).map(action => bindings[action as ButtonAction])).size === Object.keys(DEFAULT_BINDINGS).length) {
            for (const action of Object.keys(DEFAULT_BINDINGS) as ButtonAction[]) profile.bindings[action] = bindings[action];
          }
          if (candidate.layout === 'southpaw') profile.layout = 'southpaw';
          const range = candidate.range;
          const center = this.calibrations[id] ?? [0, 0, 0, 0];
          if (range && validAxes(range.min, 1) && validAxes(range.max, 1) && center.every((offset, i) => offset - range.min[i] >= 0.4 && range.max[i] - offset >= 0.4)) {
            profile.range = { min: range.min.slice(0, 4), max: range.max.slice(0, 4) };
          }
          this.profiles[id] = profile;
        }
      }
    } catch { /* Storage may be unavailable or corrupted; defaults remain usable. */ }
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDown);
      window.addEventListener('keyup', this.handleKeyUp);
      window.addEventListener('blur', this.clearKeys);
      window.addEventListener('gamepaddisconnected', this.handleDisconnect);
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.handleVisibility);
    }
  }

  private profile(): ControllerProfile {
    const id = this.pad?.id ?? 'default';
    return this.profiles[id] ??= freshProfile();
  }
  private saveProfiles(): void {
    try { localStorage.setItem(PROFILES_KEY, JSON.stringify(this.profiles)); } catch { /* In-memory settings still apply. */ }
  }
  private saveCalibration(): void {
    try { localStorage.setItem(CALIBRATION_KEY, JSON.stringify(this.calibrations)); } catch { /* Optional persistence. */ }
    this.saveProfiles();
  }
  getBindings(): Record<ButtonAction, number> { return { ...this.profile().bindings }; }
  setBinding(action: ButtonAction, index: number): void {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_BINDINGS, action) || !Number.isInteger(index) || index < 0 || index >= BUTTON_LABELS.length || RESERVED_BUTTONS.has(index)) return;
    const bindings = this.profile().bindings;
    const old = bindings[action];
    const conflict = (Object.keys(DEFAULT_BINDINGS) as ButtonAction[]).find(other => other !== action && bindings[other] === index);
    if (conflict) bindings[conflict] = old;
    bindings[action] = index;
    this.saveProfiles();
  }
  resetBindings(): void { this.profile().bindings = { ...DEFAULT_BINDINGS }; this.saveProfiles(); }
  get stickLayout(): StickLayout { return this.profile().layout; }
  set stickLayout(layout: StickLayout) {
    if (layout !== 'standard' && layout !== 'southpaw') return;
    this.profile().layout = layout;
    this.saveProfiles();
  }
  setMenuHandler(callback: (action: MenuAction) => void): void { this.menuHandler = callback; }
  setContext(context: 'flight' | 'menu'): void {
    if (context === this.context) return;
    this.context = context;
    this.keys.clear();
    this.requireNeutral = true;
    this.direction = null;
    this.nextRepeat = 0;
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    this.heldKeys.add(event.code);
    if (this.context === 'menu') {
      const action = menuKeys[event.code];
      if (action) {
        event.preventDefault();
        this.device = 'keyboard';
        if (!this.requireNeutral && (!event.repeat || !['confirm', 'back'].includes(action))) this.menuHandler(action);
      }
      return;
    }
    const action = keyActions[event.code];
    const buttonFocused = typeof document !== 'undefined' && document.activeElement?.tagName === 'BUTTON';
    const focusedShortcut = event.code === 'Escape' || (buttonFocused && !!action);
    if (!flightKeys.has(event.code) || (editableFocused() && !focusedShortcut)) return;
    event.preventDefault();
    if (this.requireNeutral) return;
    this.device = 'keyboard';
    if (action && !event.repeat) this.onAction(action);
    if (this.context === 'flight' && !this.requireNeutral) this.keys.add(event.code);
  };
  private handleKeyUp = (event: KeyboardEvent): void => { this.keys.delete(event.code); this.heldKeys.delete(event.code); };
  private clearKeys = (): void => { this.keys.clear(); this.heldKeys.clear(); };
  private handleVisibility = (): void => { if (document.hidden) this.clearKeys(); };
  private handleDisconnect = (event: GamepadEvent): void => { if (this.pad?.index === event.gamepad.index) this.disconnect(); };
  private disconnect(): void {
    const wasConnected = this.pad !== null;
    this.pad = null;
    this.lastButtons = [];
    this.device = 'keyboard';
    this.rangeSession = null;
    this.direction = null;
    this.clearKeys();
    if (wasConnected) this.onDisconnect();
  }
  private readGamepad(): Gamepad | null {
    try {
      if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') { if (this.pad) this.disconnect(); return null; }
      const pads = Array.from(navigator.getGamepads()).filter((pad): pad is Gamepad => !!pad?.connected);
      const previous = this.pad;
      const next = pads.find(pad => pad.index === previous?.index) ?? pads.find(pad => pad.mapping === 'standard') ?? pads[0] ?? null;
      if (previous && !pads.some(pad => pad.index === previous.index && pad.id === previous.id)) this.disconnect();
      if (next?.id !== this.pad?.id || next?.index !== this.pad?.index) this.lastButtons = [];
      this.pad = next;
      return next;
    } catch { if (this.pad) this.disconnect(); return null; }
  }
  private normalizedAxis(pad: Gamepad, index: number): number {
    const raw = pad.axes[index] ?? 0;
    if (!Number.isFinite(raw)) return 0;
    const center = this.calibrations[pad.id]?.[index] ?? 0;
    const range = this.profile().range;
    const delta = raw - center;
    if (!range) return delta;
    const span = delta < 0 ? center - range.min[index] : range.max[index] - center;
    return Number.isFinite(span) && span >= 0.4 ? delta / span : delta;
  }
  private captureRange(pad: Gamepad): void {
    if (this.rangeSession?.id !== pad.id) return;
    for (let i = 0; i < 4; i++) {
      const value = pad.axes[i];
      if (!Number.isFinite(value)) continue;
      this.rangeSession.min[i] = Math.min(this.rangeSession.min[i], clamp(value, -1, 1));
      this.rangeSession.max[i] = Math.max(this.rangeSession.max[i], clamp(value, -1, 1));
    }
  }
  private pollMenu(pad: Gamepad, buttons: boolean[], previous: boolean[]): void {
    // Menu bindings are fixed so remapping flight actions cannot make settings inaccessible.
    const edge = (index: number) => buttons[index] && !previous[index];
    if (edge(9)) { this.onAction('pause'); return; }
    if (edge(1)) { this.menuHandler('back'); return; }
    if (edge(0)) { this.menuHandler('confirm'); return; }
    // A range sweep must not move focus away from its Finish button.
    const x = this.rangeSession ? 0 : this.normalizedAxis(pad, 0), y = this.rangeSession ? 0 : this.normalizedAxis(pad, 1);
    const direction: MenuAction | null = buttons[12] ? 'up' : buttons[13] ? 'down' : buttons[14] ? 'left' : buttons[15] ? 'right'
      : Math.max(Math.abs(x), Math.abs(y)) < 0.5 ? null : Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
    const now = performance.now();
    if (direction && (direction !== this.direction || now >= this.nextRepeat)) {
      this.nextRepeat = now + (direction === this.direction ? 140 : 420);
      this.direction = direction;
      this.menuHandler(direction);
    } else if (!direction) this.direction = null;
  }

  poll(mode: FlightMode): FlightInput {
    const result = emptyInput();
    if (this.disposed) return result;
    const pad = this.readGamepad();
    const hidden = typeof document !== 'undefined' && document.hidden;
    const suppressed = editableFocused() || hidden;
    const buttons = pad?.buttons.map(button => !!button.pressed) ?? [];
    const previous = this.lastButtons;
    this.lastButtons = buttons;
    if (pad?.mapping === 'standard') this.captureRange(pad);
    if (this.requireNeutral) {
      const neutral = (!pad || pad.mapping !== 'standard' || (!buttons.some(Boolean) && !pad.buttons.some(button => finite(button.value) > 0.2) && pad.axes.slice(0, 4).every((_, i) => Math.abs(this.normalizedAxis(pad, i)) < 0.25))) && this.heldKeys.size === 0;
      if (neutral) this.requireNeutral = false;
      this.keys.clear();
      return result;
    }
    if (this.context === 'menu') {
      this.keys.clear();
      if (!hidden && pad?.mapping === 'standard') {
        if (buttons.some(Boolean) || pad.axes.slice(0, 2).some(value => Math.abs(value) > 0.5)) this.device = 'gamepad';
        this.pollMenu(pad, buttons, previous);
      }
      return result;
    }
    if (suppressed) this.keys.clear();
    const key = (code: string) => this.keys.has(code) ? 1 : 0;
    if (!suppressed) {
      result.pitch = key('ArrowDown') - key('ArrowUp');
      result.roll = key('ArrowRight') - key('ArrowLeft');
      result.brake = this.keys.has('Space');
      result.boost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      if (mode === 'space') {
        result.moveX = key('KeyD') - key('KeyA'); result.moveY = key('KeyX') - key('KeyZ'); result.moveZ = key('KeyW') - key('KeyS');
        result.yaw = key('ArrowRight') - key('ArrowLeft'); result.roll = key('KeyE') - key('KeyQ');
      } else { result.yaw = key('KeyD') - key('KeyA'); result.throttleDelta = key('KeyW') - key('KeyS'); }
    }
    if (pad?.mapping === 'standard') {
      const bindings = this.profile().bindings;
      const pressed = (index: number) => !!buttons[index];
      const trigger = (index: number) => clamp(finite(pad.buttons[index]?.value ?? 0), 0, 1);
      if (!hidden && buttons[bindings.pause] && !previous[bindings.pause]) {
        this.device = 'gamepad'; this.onAction('pause');
        if (this.context !== 'flight' || this.requireNeutral) return emptyInput();
      }
      if (!suppressed) {
        for (const action of ['assist', 'camera', 'reset'] as const) {
          const index = bindings[action];
          if (buttons[index] && !previous[index]) this.onAction(action);
          if (this.context !== 'flight' || this.requireNeutral) return emptyInput();
        }
        const axis = (index: number) => processAxis(this.normalizedAxis(pad, index), this.settings);
        const southpaw = this.profile().layout === 'southpaw';
        const lx = axis(southpaw ? 2 : 0), ly = axis(southpaw ? 3 : 1), rx = axis(southpaw ? 0 : 2), ry = axis(southpaw ? 1 : 3);
        if ([lx, ly, rx, ry].some(value => Math.abs(value) > 0.02) || buttons.some(Boolean) || trigger(6) > 0.1 || trigger(7) > 0.1) this.device = 'gamepad';
        result.pitch = clamp(result.pitch + ry, -1, 1);
        result.brake ||= pressed(bindings.brake); result.boost ||= pressed(bindings.boost);
        if (mode === 'space') {
          result.moveX = clamp(result.moveX + lx, -1, 1); result.moveY = clamp(result.moveY - ly, -1, 1);
          result.moveZ = clamp(result.moveZ + trigger(7) - trigger(6), -1, 1); result.yaw = clamp(result.yaw + rx, -1, 1);
          result.roll = clamp(result.roll + Number(pressed(5)) - Number(pressed(4)), -1, 1);
        } else {
          result.yaw = clamp(result.yaw + lx, -1, 1); result.roll = clamp(result.roll + rx, -1, 1);
          result.throttleDelta = clamp(result.throttleDelta - ly, -1, 1);
        }
      }
    }
    if (this.settings.invertPitch) result.pitch *= -1;
    return result;
  }

  updateSettings(settings: InputSettings): void { this.settings = { ...settings }; }
  /** Call only with both sticks released. Reject off-center readings rather than hiding them. */
  calibrate(): boolean {
    const pad = this.readGamepad();
    if (!pad || pad.mapping !== 'standard' || !validAxes(Array.from(pad.axes).slice(0, 4), 0.35)) return false;
    this.calibrations[pad.id] = Array.from(pad.axes).slice(0, 4);
    delete this.profile().range;
    this.rangeSession = null;
    this.saveCalibration();
    return true;
  }
  beginRangeCalibration(): boolean {
    const pad = this.readGamepad();
    if (!pad || pad.mapping !== 'standard' || !validAxes(Array.from(pad.axes).slice(0, 4), 1)) return false;
    const axes = Array.from(pad.axes).slice(0, 4);
    this.rangeSession = { id: pad.id, min: [...axes], max: [...axes] };
    return true;
  }
  finishRangeCalibration(): boolean {
    const pad = this.readGamepad();
    if (!pad || !this.rangeSession || pad.id !== this.rangeSession.id) return false;
    this.captureRange(pad);
    const center = this.calibrations[pad.id] ?? [0, 0, 0, 0];
    const { min, max } = this.rangeSession;
    if (!center.every((offset, i) => offset - min[i] >= 0.4 && max[i] - offset >= 0.4)) return false;
    this.profile().range = { min: [...min], max: [...max] };
    this.rangeSession = null;
    this.saveProfiles();
    return true;
  }
  /** Discard only the unfinished sweep; keep the last saved center and range. */
  cancelRangeCalibration(): void { this.rangeSession = null; }
  resetCalibration(): void {
    if (this.pad) delete this.calibrations[this.pad.id];
    delete this.profile().range;
    this.rangeSession = null;
    this.saveCalibration();
  }
  get rangeCalibrating(): boolean { return this.rangeSession !== null; }

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
      void actuator.playEffect('dual-rumble', { startDelay: 0, duration: milliseconds, weakMagnitude: intensity, strongMagnitude: intensity * 0.7 }).catch(() => {});
    } catch { /* Some devices expose an actuator without supporting dual-rumble. */ }
  }
  get controllerName(): string { return !this.pad ? 'Keyboard' : this.pad.mapping === 'standard' ? this.pad.id : `${this.pad.id} — unsupported mapping; use keyboard`; }
  get connected(): boolean { return this.pad !== null; }
  get rawAxes(): number[] { return this.pad ? Array.from(this.pad.axes).map(axis => finite(axis)) : []; }
  get activeDevice(): 'keyboard' | 'gamepad' { return this.device; }
  dispose(): void {
    this.disposed = true; this.clearKeys(); this.rangeSession = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDown); window.removeEventListener('keyup', this.handleKeyUp);
      window.removeEventListener('blur', this.clearKeys); window.removeEventListener('gamepaddisconnected', this.handleDisconnect);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.handleVisibility);
    }
    try { void this.pad?.vibrationActuator?.reset().catch(() => {}); } catch { /* Optional capability. */ }
  }
}
