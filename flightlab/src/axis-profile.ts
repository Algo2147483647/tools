/** Serializable, device-local controller configuration. Values are normalized commands. */
export type AxisChannel = 'pitch' | 'roll' | 'yaw' | 'throttle' | 'moveX' | 'moveY' | 'moveZ';
export type AxisPreset = 'gamepad' | 'mode1' | 'mode2' | 'southpaw';
export interface AxisBinding {
  source: 'axis' | 'buttons' | 'none';
  axis: number;
  negativeButton: number;
  positiveButton: number;
  inverted: boolean;
  /** Null inherits the main controller setting. */
  deadzone: number | null;
  expo: number | null;
  /** Output gain, followed by clamping to the normalized command range. */
  rate: number;
  /** Center slope, smoothly converging to full-scale response at the endpoints. */
  center: number;
}
export interface AxisProfile {
  version: 1;
  preset: AxisPreset | 'custom';
  allowNonStandard: boolean;
  throttleMode: 'incremental' | 'absolute';
  channels: Record<AxisChannel, AxisBinding>;
  spaceRotation: Record<'pitch' | 'roll' | 'yaw', AxisBinding>;
}
export interface AxisField { channel: AxisChannel; label: string; spaceRotation: boolean; }
export const AXIS_FIELDS: readonly AxisField[] = [
  { channel: 'pitch', label: 'Pitch', spaceRotation: false },
  { channel: 'roll', label: 'Roll', spaceRotation: false },
  { channel: 'yaw', label: 'Yaw', spaceRotation: false },
  { channel: 'throttle', label: 'Throttle', spaceRotation: false },
  { channel: 'moveX', label: 'Space: right / left', spaceRotation: false },
  { channel: 'moveY', label: 'Space: up / down', spaceRotation: false },
  { channel: 'moveZ', label: 'Space: forward / back', spaceRotation: false },
  { channel: 'pitch', label: 'Space: pitch', spaceRotation: true },
  { channel: 'roll', label: 'Space: roll', spaceRotation: true },
  { channel: 'yaw', label: 'Space: yaw', spaceRotation: true },
];
const axis = (index: number, inverted = false): AxisBinding => ({ source: 'axis', axis: index, negativeButton: 0, positiveButton: 1, inverted, deadzone: null, expo: null, rate: 1, center: 1 });
const buttons = (negativeButton: number, positiveButton: number): AxisBinding => ({ ...axis(0), source: 'buttons', negativeButton, positiveButton });

/** Mode 1 / 2 use common USB adapter axes: left X/Y = 0/1, right X/Y = 2/3.
 * Adapters can report another order; every channel remains explicitly editable. */
export function createAxisProfile(preset: AxisPreset = 'gamepad'): AxisProfile {
  const southpaw = preset === 'southpaw';
  const leftX = southpaw ? 2 : 0, leftY = southpaw ? 3 : 1;
  const rightX = southpaw ? 0 : 2, rightY = southpaw ? 1 : 3;
  const rc = preset === 'mode1' || preset === 'mode2';
  return {
    version: 1, preset, allowNonStandard: rc, throttleMode: rc ? 'absolute' : 'incremental',
    channels: {
      pitch: axis(preset === 'mode1' ? 1 : rightY), roll: axis(rightX), yaw: axis(leftX),
      throttle: axis(preset === 'mode1' ? 3 : leftY, true),
      moveX: axis(leftX), moveY: axis(leftY, true), moveZ: buttons(6, 7),
    },
    spaceRotation: { pitch: axis(rightY), roll: buttons(4, 5), yaw: axis(rightX) },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function finiteRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
function validateBinding(value: unknown): AxisBinding | null {
  if (!isRecord(value) || !['axis', 'buttons', 'none'].includes(String(value.source))) return null;
  if (!finiteRange(value.axis, 0, 31) || !Number.isInteger(value.axis)) return null;
  if (!finiteRange(value.negativeButton, 0, 63) || !Number.isInteger(value.negativeButton) ||
      !finiteRange(value.positiveButton, 0, 63) || !Number.isInteger(value.positiveButton)) return null;
  if (value.source === 'buttons' && value.negativeButton === value.positiveButton) return null;
  if (typeof value.inverted !== 'boolean' || !(value.deadzone === null || finiteRange(value.deadzone, 0, 0.5)) ||
      !(value.expo === null || finiteRange(value.expo, 0, 1)) || !finiteRange(value.rate, 0.1, 2) || !finiteRange(value.center, 0.1, 2)) return null;
  return {
    source: value.source as AxisBinding['source'], axis: value.axis, negativeButton: value.negativeButton,
    positiveButton: value.positiveButton, inverted: value.inverted,
    deadzone: value.deadzone as number | null, expo: value.expo as number | null,
    rate: value.rate, center: value.center,
  };
}

/** Reject malformed or future-schema profiles without partially applying them. */
export function validateAxisProfile(value: unknown): AxisProfile | null {
  if (!isRecord(value) || value.version !== 1 || !['gamepad', 'mode1', 'mode2', 'southpaw', 'custom'].includes(String(value.preset)) ||
      typeof value.allowNonStandard !== 'boolean' || !['incremental', 'absolute'].includes(String(value.throttleMode)) ||
      !isRecord(value.channels) || !isRecord(value.spaceRotation)) return null;
  const result = createAxisProfile();
  result.preset = value.preset as AxisProfile['preset'];
  result.allowNonStandard = value.allowNonStandard;
  result.throttleMode = value.throttleMode as AxisProfile['throttleMode'];
  for (const channel of Object.keys(result.channels) as AxisChannel[]) {
    const binding = validateBinding(value.channels[channel]);
    if (!binding) return null;
    result.channels[channel] = binding;
  }
  for (const channel of ['pitch', 'roll', 'yaw'] as const) {
    const binding = validateBinding(value.spaceRotation[channel]);
    if (!binding) return null;
    result.spaceRotation[channel] = binding;
  }
  return result;
}
