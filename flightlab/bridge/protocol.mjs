// Wire codecs for the pinned Betaflight 4.5.2 SITL ABI and MAVLink common dialect.
// Protocol references and coordinate conventions are in ../README-SITL.md.
export const CRC_EXTRA = { 0: 50, 65: 118, 93: 47, 107: 108, 113: 124 };
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export function validateFrame(frame) {
  if (!frame || !Number.isSafeInteger(frame.sequence) || frame.sequence < 0 ||
      !Number.isSafeInteger(frame.timeUs) || frame.timeUs <= 0) throw Error('Invalid simulation sequence or timestamp.');
  for (const [key, count, limit] of [['positionNed', 3, 1e7], ['velocityNed', 3, 1e4],
    ['quaternionWxyz', 4, 1.001], ['gyroFrd', 3, 1e4], ['specificForceFrd', 3, 1e5]]) {
    const values = frame[key];
    if (!Array.isArray(values) || values.length !== count || values.some(v => !Number.isFinite(v) || Math.abs(v) > limit)) throw Error(`Invalid ${key}.`);
  }
  if (Math.abs(Math.hypot(...frame.quaternionWxyz) - 1) > 0.01) throw Error('Quaternion must be normalized.');
  const rc = frame.rc;
  if (!rc || ['roll', 'pitch', 'yaw', 'throttle'].some(k => !Number.isFinite(rc[k]) || Math.abs(rc[k]) > 1) || rc.throttle < 0 ||
      typeof rc.armed !== 'boolean' || typeof rc.angle !== 'boolean') throw Error('Invalid RC controls.');
  return frame;
}
export function pressurePa(altitude) { return 101325 * Math.pow(Math.max(0.1, 1 - 2.25577e-5 * altitude), 5.25588); }
export function rcChannels(rc) {
  // AETR: pitch input is positive nose-up; Betaflight pitch command is nose-down.
  return [1500 + rc.roll * 500, 1500 - rc.pitch * 500, 1000 + rc.throttle * 1000,
    1500 + rc.yaw * 500, rc.armed ? 2000 : 1000, rc.angle ? 2000 : 1000,
    ...Array(10).fill(1000)].map(Math.round);
}
export function encodeBetaflightFdm(frame) {
  validateFrame(frame);
  const [w, x, y, z] = frame.quaternionWxyz;
  // Legacy SITL negates pitch and yaw gyro before passing samples to firmware.
  // The direct quaternion uses the equivalent FLU-body / NWU-world basis.
  const values = [frame.timeUs / 1e6, frame.gyroFrd[0], frame.gyroFrd[1], -frame.gyroFrd[2],
    ...frame.specificForceFrd, w, x, -y, -z, ...frame.velocityNed, ...frame.positionNed,
    pressurePa(-frame.positionNed[2])];
  const bytes = Buffer.alloc(144);
  values.forEach((value, i) => bytes.writeDoubleLE(value, i * 8));
  return bytes;
}
export function encodeBetaflightRc(frame) {
  const bytes = Buffer.alloc(40); bytes.writeDoubleLE(frame.timeUs / 1e6);
  rcChannels(frame.rc).forEach((v, i) => bytes.writeUInt16LE(v, 8 + i * 2));
  return bytes;
}
export function decodeBetaflightMotors(bytes) {
  if (bytes.length !== 16) return null;
  const values = Array.from({ length: 4 }, (_, i) => bytes.readFloatLE(i * 4));
  if (values.some(v => !Number.isFinite(v) || v < -0.01 || v > 1.01)) return null;
  // Gazebo packet order FR, RL, FL, RR -> FlightLab FL, FR, RR, RL.
  return [2, 0, 3, 1].map(i => clamp(values[i], 0, 1));
}
export function crcX25(bytes, extra) {
  let crc = 0xffff;
  for (const value of extra === undefined ? bytes : [...bytes, extra]) {
    let tmp = value ^ (crc & 0xff); tmp ^= (tmp << 4) & 0xff;
    crc = ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff;
  }
  return crc;
}
export function encodeMavlink(id, payload, sequence = 0) {
  if (CRC_EXTRA[id] === undefined) throw Error('Unsupported MAVLink message.');
  const bytes = Buffer.alloc(payload.length + 12);
  bytes[0] = 0xfd; bytes[1] = payload.length; bytes[4] = sequence & 255; bytes[5] = 255; bytes[6] = 190;
  bytes.writeUIntLE(id, 7, 3); payload.copy(bytes, 10);
  bytes.writeUInt16LE(crcX25(bytes.subarray(1, -2), CRC_EXTRA[id]), bytes.length - 2);
  return bytes;
}
export class MavlinkParser {
  buffer = Buffer.alloc(0);
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]); const messages = [];
    if (this.buffer.length > 65536) this.buffer = Buffer.alloc(0);
    while (this.buffer.length >= 8) {
      const start = this.buffer.findIndex(v => v === 0xfd || v === 0xfe);
      if (start < 0) { this.buffer = Buffer.alloc(0); break; }
      if (start) this.buffer = this.buffer.subarray(start);
      const v2 = this.buffer[0] === 0xfd, header = v2 ? 10 : 6;
      if (this.buffer.length < header) break;
      const length = this.buffer[1], signed = v2 && (this.buffer[2] & 1), total = header + length + 2 + (signed ? 13 : 0);
      if (this.buffer.length < total) break;
      const bytes = this.buffer.subarray(0, total); this.buffer = this.buffer.subarray(total);
      const id = v2 ? bytes.readUIntLE(7, 3) : bytes[5], extra = CRC_EXTRA[id];
      // Signed or unknown incompatibility flags are unsupported; never accept unauthenticated signed frames.
      if ((v2 && bytes[2] !== 0) || extra === undefined) continue;
      if (crcX25(bytes.subarray(1, header + length), extra) !== bytes.readUInt16LE(header + length)) continue;
      messages.push({ id, payload: bytes.subarray(header, header + length) });
    }
    return messages;
  }
}
function rotateInverse(q, v) {
  const [w, x, y, z] = q, [vx, vy, vz] = v;
  return [(1 - 2 * (y*y + z*z))*vx + 2*(x*y + z*w)*vy + 2*(x*z - y*w)*vz,
    2*(x*y - z*w)*vx + (1 - 2*(x*x + z*z))*vy + 2*(y*z + x*w)*vz,
    2*(x*z + y*w)*vx + 2*(y*z - x*w)*vy + (1 - 2*(x*x + y*y))*vz];
}
export function encodePx4Sensors(frame, sequence = 0) {
  validateFrame(frame);
  const altitude = -frame.positionNed[2], sensor = Buffer.alloc(64);
  sensor.writeBigUInt64LE(BigInt(frame.timeUs));
  const magnetic = rotateInverse(frame.quaternionWxyz, [0.215, 0.008, 0.427]);
  [...frame.specificForceFrd, ...frame.gyroFrd, ...magnetic, pressurePa(altitude)/100,
    0, altitude, 20].forEach((v, i) => sensor.writeFloatLE(v, 8 + 4*i));
  sensor.writeUInt32LE(0x1fff, 60);
  const gps = Buffer.alloc(36); gps.writeBigUInt64LE(BigInt(frame.timeUs));
  const lat = 47.397742 + frame.positionNed[0] / 111320;
  const lon = 8.545594 + frame.positionNed[1] / (111320 * Math.cos(47.397742 * Math.PI / 180));
  gps.writeInt32LE(Math.round(clamp(lat, -90, 90) * 1e7), 8); gps.writeInt32LE(Math.round(clamp(lon, -180, 180) * 1e7), 12);
  gps.writeInt32LE(Math.round(clamp(altitude * 1000, -2147483648, 2147483647)), 16);
  gps.writeUInt16LE(50, 20); gps.writeUInt16LE(80, 22);
  gps.writeUInt16LE(Math.min(65534, Math.round(Math.hypot(...frame.velocityNed.slice(0, 2))*100)), 24);
  frame.velocityNed.forEach((v, i) => gps.writeInt16LE(Math.round(clamp(v*100, -32768, 32767)), 26 + 2*i));
  gps.writeUInt16LE(Math.round((Math.atan2(frame.velocityNed[1], frame.velocityNed[0])*180/Math.PI + 360)%360*100), 32);
  gps[34] = 3; gps[35] = 12;
  const rc = Buffer.alloc(42); rc.writeUInt32LE(Math.floor(frame.timeUs / 1000) >>> 0);
  [...rcChannels(frame.rc), 1000, 1000].forEach((v, i) => rc.writeUInt16LE(v, 4+2*i)); rc[40] = 18; rc[41] = 255;
  const heartbeat = Buffer.alloc(9); heartbeat[4] = 6; heartbeat[5] = 8; heartbeat[7] = 4; heartbeat[8] = 3;
  return [encodeMavlink(0, heartbeat, sequence), encodeMavlink(65, rc, sequence+1),
    encodeMavlink(113, gps, sequence+2), encodeMavlink(107, sensor, sequence+3)];
}
export function decodePx4Actuators(payload) {
  // MAVLink 2 may trim trailing zeros, including the disarmed mode byte.
  if (payload.length < 16 || payload.length > 81) return null;
  const padded = Buffer.alloc(81); payload.copy(padded);
  const values = Array.from({ length: 4 }, (_, i) => padded.readFloatLE(16+4*i));
  if (values.some(v => !Number.isFinite(v) || v < -1.01 || v > 1.01)) return null;
  return { timeUs: Number(padded.readBigUInt64LE()), armed: Boolean(padded[80] & 128),
    motors: [2, 0, 3, 1].map(i => padded[80] & 128 ? clamp(values[i], 0, 1) : 0) };
}
