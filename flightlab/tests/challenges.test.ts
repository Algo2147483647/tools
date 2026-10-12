import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { crossedGate, formatTime } from '../src/challenges';

const gate = {position: new Vector3(0, 0, -10), normal: new Vector3(0, 0, -1), radius: 5};
describe('Race gate crossing', () => {
  it('detects a fast forward crossing even when endpoints are outside the gate', () => {
    expect(crossedGate(new Vector3(0, 0, 0), new Vector3(0, 0, -20), gate)).toBe(true);
  });
  it('rejects backward passes and misses beyond the aperture', () => {
    expect(crossedGate(new Vector3(0, 0, -20), new Vector3(0, 0, 0), gate)).toBe(false);
    expect(crossedGate(new Vector3(8, 0, 0), new Vector3(8, 0, -20), gate)).toBe(false);
  });
  it('does not count moving near a gate without passing its plane', () => {
    expect(crossedGate(new Vector3(0, 0, 0), new Vector3(0, 0, -9), gate)).toBe(false);
  });
  it('formats times and unavailable records', () => {
    expect(formatTime(65.25)).toBe('01:05.25');
    expect(formatTime(Infinity)).toBe('—');
  });
});
