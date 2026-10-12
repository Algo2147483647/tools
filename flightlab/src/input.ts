import type { FlightInput, FlightMode, InputAction, InputSettings } from './types';
import { AXIS_FIELDS, createAxisProfile, validateAxisProfile } from './axis-profile';
import type { AxisBinding, AxisField, AxisPreset, AxisProfile } from './axis-profile';
export { createAxisProfile, validateAxisProfile } from './axis-profile';
export type { AxisBinding, AxisChannel, AxisField, AxisPreset, AxisProfile } from './axis-profile';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const CALIBRATION_KEY = 'flightlab.controller-calibration.v1';
const PROFILES_KEY = 'flightlab.controller-profiles.v2';
export type ButtonAction = 'brake' | 'assist' | 'camera' | 'reset' | 'boost' | 'pause' | 'arm';
export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back';
export type StickLayout = 'standard' | 'southpaw';
export const BUTTON_LABELS: readonly string[] = [
  'A / Cross', 'B / Circle', 'X / Square', 'Y / Triangle', 'LB / L1', 'RB / R1',
  'LT / L2', 'RT / R2', 'Back / Share', 'Start / Options', 'Left Stick', 'Right Stick',
  'D-pad Up', 'D-pad Down', 'D-pad Left', 'D-pad Right', 'Home',
];
const DEFAULT_BINDINGS: Record<ButtonAction, number> = { brake: 0, assist: 1, camera: 2, reset: 3, boost: 10, pause: 9, arm: 8 };
interface AxisRange { min: number[]; max: number[]; }
interface ControllerProfile { bindings: Record<ButtonAction, number>; layout: StickLayout; axes: AxisProfile; range?: AxisRange; }
interface RangeSession extends AxisRange { id: string; }
const freshProfile = (): ControllerProfile => ({ bindings: { ...DEFAULT_BINDINGS }, layout: 'standard', axes: createAxisProfile() });
function reservedButtons(profile: AxisProfile): Set<number> {
  return new Set([...Object.values(profile.channels), ...Object.values(profile.spaceRotation)]
    .filter(binding => binding.source === 'buttons').flatMap(binding => [binding.negativeButton, binding.positiveButton]));
}

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

const keyActions: Record<string, InputAction> = { Escape: 'pause', KeyR: 'reset', KeyC: 'camera', KeyF: 'assist', KeyV: 'arm' };
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
function textEditingFocused(): boolean {
  if (typeof document === 'undefined') return false;
  const element = document.activeElement as HTMLInputElement | null;
  if (!element) return false;
  return element.isContentEditable || element.tagName === 'TEXTAREA' || (element.tagName === 'INPUT'
    && ['text', 'number', 'email', 'url', 'search', 'tel', 'password'].includes(element.type || 'text'));
}
const emptyInput = (): FlightInput => ({
  pitch: 0, roll: 0, yaw: 0, throttleDelta: 0, moveX: 0, moveY: 0, moveZ: 0, brake: false, boost: false,
});
const validAxes = (value: unknown, limit: number): value is number[] =>
  Array.isArray(value) && value.length >= 1 && value.length <= 32 && value.every(axis => typeof axis === 'number' && Number.isFinite(axis) && Math.abs(axis) <= limit);

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
  private lastInput: FlightInput = emptyInput();
  private previousAbsoluteThrottle: number | null = null;

  constructor(settings: InputSettings, private readonly onAction: (action: InputAction) => void, private readonly onDisconnect: () => void) {
    this.settings = { ...settings };
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(CALIBRATION_KEY) || '{}');
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        for (const [id, axes] of Object.entries(stored)) if (validAxes(axes, 0.35)) this.calibrations[id] = [...axes];
      }
      const profiles: unknown = JSON.parse(localStorage.getItem(PROFILES_KEY) || '{}');
      if (profiles && typeof profiles === 'object' && !Array.isArray(profiles)) {
        for (const [id, raw] of Object.entries(profiles)) {
          if (!raw || typeof raw !== 'object') continue;
          const profile = freshProfile();
          const candidate = raw as Partial<ControllerProfile>;
          profile.axes = validateAxisProfile(candidate.axes) ?? createAxisProfile(candidate.layout === 'southpaw' ? 'southpaw' : 'gamepad');
          const bindings = candidate.bindings ? { ...DEFAULT_BINDINGS, ...candidate.bindings } : undefined;
          const reserved = reservedButtons(profile.axes);
          if (bindings && Object.keys(DEFAULT_BINDINGS).every(action => Number.isInteger(bindings[action as ButtonAction]) && bindings[action as ButtonAction] >= 0 && bindings[action as ButtonAction] < 64 && !reserved.has(bindings[action as ButtonAction]))
            && new Set(Object.keys(DEFAULT_BINDINGS).map(action => bindings[action as ButtonAction])).size === Object.keys(DEFAULT_BINDINGS).length) {
            for (const action of Object.keys(DEFAULT_BINDINGS) as ButtonAction[]) profile.bindings[action] = bindings[action];
          }
          if (candidate.layout === 'southpaw') profile.layout = 'southpaw';
          const range = candidate.range;
          const center = this.calibrations[id] ?? [0, 0, 0, 0];
          const configuredAxes = new Set([...Object.values(profile.axes.channels), ...Object.values(profile.axes.spaceRotation)]
            .filter(binding => binding.source === 'axis').map(binding => binding.axis));
          if (range && validAxes(range.min, 1) && validAxes(range.max, 1) && range.min.length === range.max.length && range.min.every((value, i) => value <= range.max[i]) &&
              [...configuredAxes].filter(i => i < range.min.length).every(i => (center[i] ?? 0) - range.min[i] >= 0.4 && range.max[i] - (center[i] ?? 0) >= 0.4)) {
            profile.range = { min: [...range.min], max: [...range.max] };
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
  getReservedButtons(): number[] { return [...reservedButtons(this.profile().axes)].sort((a, b) => a - b); }
  setBinding(action: ButtonAction, index: number): void {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_BINDINGS, action) || !Number.isInteger(index) || index < 0 || index >= 64 || reservedButtons(this.profile().axes).has(index)) return;
    const bindings = this.profile().bindings;
    const old = bindings[action];
    const conflict = (Object.keys(DEFAULT_BINDINGS) as ButtonAction[]).find(other => other !== action && bindings[other] === index);
    if (conflict) bindings[conflict] = old;
    bindings[action] = index;
    this.saveProfiles();
  }
  resetBindings(): void { this.profile().bindings = { ...DEFAULT_BINDINGS }; this.resolveButtonConflicts(); this.saveProfiles(); }
  private resolveButtonConflicts(): void {
    const unavailable = reservedButtons(this.profile().axes);
    const bindings = this.profile().bindings;
    for (const action of Object.keys(DEFAULT_BINDINGS) as ButtonAction[]) {
      if (unavailable.has(bindings[action])) {
        const replacement = Array.from({ length: 64 }, (_, index) => index).find(index => !unavailable.has(index) && !Object.values(bindings).includes(index));
        if (replacement !== undefined) bindings[action] = replacement;
      }
      unavailable.add(bindings[action]);
    }
  }
  getAxisProfile(): AxisProfile { return validateAxisProfile(this.profile().axes)!; }
  setAxisProfile(value: unknown): boolean {
    const axes = validateAxisProfile(value);
    if (!axes) return false;
    this.profile().axes = axes;
    this.profile().layout = axes.preset === 'southpaw' ? 'southpaw' : 'standard';
    this.resolveButtonConflicts();
    this.requireNeutral = true;
    this.previousAbsoluteThrottle = null;
    this.keys.clear();
    this.saveProfiles();
    return true;
  }
  applyAxisPreset(preset: AxisPreset): void {
    if (['gamepad', 'mode1', 'mode2', 'southpaw'].includes(preset)) this.setAxisProfile(createAxisProfile(preset));
  }
  getAxisFields(): AxisField[] { return AXIS_FIELDS.map(field => ({ ...field })); }
  exportAxisProfile(): string { return JSON.stringify(this.getAxisProfile(), null, 2); }
  importAxisProfile(text: string): boolean {
    if (text.length > 32768) return false;
    try { return this.setAxisProfile(JSON.parse(text)); } catch { return false; }
  }
  getLastInput(): FlightInput { return { ...this.lastInput }; }
  get stickLayout(): StickLayout { return this.profile().layout; }
  set stickLayout(layout: StickLayout) {
    if (layout !== 'standard' && layout !== 'southpaw') return;
    this.profile().layout = layout;
    this.profile().axes = createAxisProfile(layout === 'southpaw' ? 'southpaw' : 'gamepad');
    this.resolveButtonConflicts();
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
      // Preserve spaces, caret movement and native number editing in workshop fields.
      // Escape remains the consistent exit shortcut; gamepad navigation is independent.
      if (event.code !== 'Escape' && textEditingFocused()) return;
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
      const changed = next?.id !== this.pad?.id || next?.index !== this.pad?.index;
      if (changed) this.lastButtons = [];
      this.pad = next;
      if (changed) this.previousAbsoluteThrottle = null;
      if (changed && next && this.profile().axes.throttleMode === 'absolute') this.requireNeutral = true;
      return next;
    } catch { if (this.pad) this.disconnect(); return null; }
  }
  private usablePad(pad: Gamepad): boolean { return pad.mapping === 'standard' || this.profile().axes.allowNonStandard; }
  private usedAxes(pad: Gamepad): number[] {
    const configured = [...Object.values(this.profile().axes.channels), ...Object.values(this.profile().axes.spaceRotation)]
      .filter(binding => binding.source === 'axis').map(binding => binding.axis);
    return [...new Set([...(pad.mapping === 'standard' ? [0, 1, 2, 3] : []), ...configured])].filter(index => index < pad.axes.length);
  }
  private bindingValue(pad: Gamepad, binding: AxisBinding, curve = true): number {
    if (binding.source === 'none') return 0;
    const buttonValue = (index: number): number => {
      const button = pad.buttons[index];
      return clamp(finite(button?.value ?? 0) || Number(button?.pressed ?? false), 0, 1);
    };
    let raw = binding.source === 'axis' ? this.normalizedAxis(pad, binding.axis)
      : buttonValue(binding.positiveButton) - buttonValue(binding.negativeButton);
    if (binding.inverted) raw = -raw;
    if (!curve) return clamp(raw, -1, 1);
    const shaped = processAxis(raw, {
      ...this.settings, deadzone: binding.deadzone ?? (binding.source === 'buttons' ? 0 : this.settings.deadzone),
      expo: binding.expo ?? (binding.source === 'buttons' ? 0 : this.settings.expo),
      sensitivity: binding.source === 'buttons' ? 1 : this.settings.sensitivity,
    });
    const magnitude = Math.abs(shaped);
    return Math.sign(shaped) * clamp((binding.center * magnitude + (1 - binding.center) * magnitude ** 2) * binding.rate, 0, 1);
  }
  private padNeutral(pad: Gamepad, mode: FlightMode): boolean {
    if (!this.usablePad(pad)) return true;
    const profile = this.profile().axes;
    const absolute = mode !== 'space' && profile.throttleMode === 'absolute' && profile.channels.throttle.source !== 'none';
    const idleButton = absolute && profile.channels.throttle.source === 'buttons'
      ? (profile.channels.throttle.inverted ? profile.channels.throttle.positiveButton : profile.channels.throttle.negativeButton) : -1;
    const usedButtons = new Set([...reservedButtons(profile), ...Object.values(this.profile().bindings)]);
    if (pad.buttons.some((button, index) => index !== idleButton && (pad.mapping === 'standard' || usedButtons.has(index)) && (button.pressed || finite(button.value) > 0.2))) return false;
    // A non-centering RC throttle must be at idle; all other mapped axes must center.
    if (absolute && this.bindingValue(pad, profile.channels.throttle, false) > -0.8) return false;
    const throttleAxis = absolute && profile.channels.throttle.source === 'axis' ? profile.channels.throttle.axis : -1;
    return this.usedAxes(pad).every(index => index === throttleAxis || Math.abs(this.normalizedAxis(pad, index)) < 0.25);
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
    for (let i = 0; i < this.rangeSession.min.length; i++) {
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
    const axes = this.profile().axes;
    const throttleAxis = axes.throttleMode === 'absolute' && axes.channels.throttle.source === 'axis' ? axes.channels.throttle.axis : -1;
    const x = this.rangeSession || throttleAxis === 0 ? 0 : this.normalizedAxis(pad, 0);
    const y = this.rangeSession || throttleAxis === 1 ? 0 : this.normalizedAxis(pad, 1);
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
    this.lastInput = this.pollInput(mode);
    return { ...this.lastInput };
  }
  private pollInput(mode: FlightMode): FlightInput {
    const result = emptyInput();
    if (this.disposed) return result;
    const pad = this.readGamepad();
    const hidden = typeof document !== 'undefined' && document.hidden;
    const suppressed = editableFocused() || hidden;
    const buttons = pad?.buttons.map(button => !!button.pressed) ?? [];
    const previous = this.lastButtons;
    this.lastButtons = buttons;
    if (pad && this.usablePad(pad)) this.captureRange(pad);
    if (this.requireNeutral) {
      const neutral = (!pad || this.padNeutral(pad, mode)) && this.heldKeys.size === 0;
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
    if (pad && this.usablePad(pad)) {
      const bindings = this.profile().bindings;
      const pressed = (index: number) => !!buttons[index];
      if (!hidden && buttons[bindings.pause] && !previous[bindings.pause]) {
        this.device = 'gamepad'; this.onAction('pause');
        if (this.context !== 'flight' || this.requireNeutral) return emptyInput();
      }
      if (!suppressed) {
        for (const action of ['assist', 'camera', 'reset', 'arm'] as const) {
          const index = bindings[action];
          if (buttons[index] && !previous[index]) this.onAction(action);
          if (this.context !== 'flight' || this.requireNeutral) return emptyInput();
        }
        const axes = this.profile().axes;
        const rotation = mode === 'space' ? axes.spaceRotation : axes.channels;
        const pitch = this.bindingValue(pad, rotation.pitch), roll = this.bindingValue(pad, rotation.roll), yaw = this.bindingValue(pad, rotation.yaw);
        const throttle = this.bindingValue(pad, axes.channels.throttle);
        const moveX = this.bindingValue(pad, axes.channels.moveX), moveY = this.bindingValue(pad, axes.channels.moveY), moveZ = this.bindingValue(pad, axes.channels.moveZ);
        const absoluteValue = (this.bindingValue(pad, axes.channels.throttle, false) + 1) / 2;
        const throttleMoved = this.previousAbsoluteThrottle !== null && Math.abs(absoluteValue - this.previousAbsoluteThrottle) > 0.02;
        this.previousAbsoluteThrottle = absoluteValue;
        const commands = mode === 'space' ? [pitch, roll, yaw, moveX, moveY, moveZ]
          : [pitch, roll, yaw, axes.throttleMode === 'incremental' ? throttle : 0];
        if (commands.some(value => Math.abs(value) > 0.02) || buttons.some(Boolean) || (mode !== 'space' && axes.throttleMode === 'absolute' && throttleMoved)) this.device = 'gamepad';
        result.pitch = clamp(result.pitch + pitch, -1, 1);
        result.roll = clamp(result.roll + roll, -1, 1);
        result.yaw = clamp(result.yaw + yaw, -1, 1);
        result.brake ||= pressed(bindings.brake); result.boost ||= pressed(bindings.boost);
        if (mode === 'space') {
          result.moveX = clamp(result.moveX + moveX, -1, 1); result.moveY = clamp(result.moveY + moveY, -1, 1);
          result.moveZ = clamp(result.moveZ + moveZ, -1, 1);
        } else {
          if (axes.throttleMode === 'absolute' && axes.channels.throttle.source !== 'none' && result.throttleDelta === 0) {
            // Absolute collective is affine: stick bottom/center/top = 0/.5/1.
            // Centered deadzones and attitude rate curves must not create an idle jump.
            result.throttle = absoluteValue;
          } else if (axes.throttleMode === 'incremental') result.throttleDelta = clamp(result.throttleDelta + throttle, -1, 1);
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
    if (!pad || !this.usablePad(pad) || !this.usedAxes(pad).length ||
        !this.usedAxes(pad).every(index => Number.isFinite(pad.axes[index]) && Math.abs(pad.axes[index]) <= 0.35)) return false;
    // Unmapped slider/switch axes can legitimately rest at an endpoint.
    const used = new Set(this.usedAxes(pad));
    this.calibrations[pad.id] = Array.from(pad.axes).slice(0, 32).map((value, index) => used.has(index) ? value : 0);
    delete this.profile().range;
    this.rangeSession = null;
    this.saveCalibration();
    return true;
  }
  beginRangeCalibration(): boolean {
    const pad = this.readGamepad();
    if (!pad || !this.usablePad(pad) || !validAxes(Array.from(pad.axes).slice(0, 32), 1)) return false;
    const axes = Array.from(pad.axes).slice(0, 32);
    this.rangeSession = { id: pad.id, min: [...axes], max: [...axes] };
    return true;
  }
  finishRangeCalibration(): boolean {
    const pad = this.readGamepad();
    if (!pad || !this.rangeSession || pad.id !== this.rangeSession.id) return false;
    this.captureRange(pad);
    const center = this.calibrations[pad.id] ?? [0, 0, 0, 0];
    const { min, max } = this.rangeSession;
    if (!this.usedAxes(pad).every(i => (center[i] ?? 0) - min[i] >= 0.4 && max[i] - (center[i] ?? 0) >= 0.4)) return false;
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
  get controllerName(): string { return !this.pad ? 'Keyboard' : this.pad.mapping === 'standard' ? this.pad.id : this.profile().axes.allowNonStandard ? `${this.pad.id} — custom USB profile (keyboard menus)` : `${this.pad.id} — unsupported mapping; use keyboard`; }
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
