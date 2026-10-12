import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFrame, encodeBetaflightFdm, encodeBetaflightRc, decodeBetaflightMotors,
  encodePx4Sensors, encodeMavlink, decodePx4Actuators, MavlinkParser, crcX25 } from './protocol.mjs';
export const sampleFrame = (sequence = 0) => ({ sequence, timeUs: 1000000 + sequence * 4000,
  positionNed: [0, 0, -10], velocityNed: [1, 2, -3], quaternionWxyz: [1, 0, 0, 0],
  gyroFrd: [.1, -.2, .3], specificForceFrd: [0, 0, -9.80665],
  rc: { roll: .2, pitch: .3, yaw: -.4, throttle: .5, armed: true, angle: true } });
test('Betaflight pinned ABI packs 18 little endian doubles and AETR RC', () => {
  const frame = sampleFrame(), bytes = encodeBetaflightFdm(frame), rc = encodeBetaflightRc(frame);
  assert.equal(bytes.length, 144); assert.equal(bytes.readDoubleLE(0), 1);
  assert.equal(bytes.readDoubleLE(24), -.3); assert.equal(bytes.readDoubleLE(48), -9.80665);
  assert.equal(bytes.readDoubleLE(56), 1); assert.equal(bytes.readDoubleLE(128), -10);
  assert.equal(rc.length, 40); assert.equal(rc.readUInt16LE(8), 1600);
  assert.equal(rc.readUInt16LE(10), 1350); assert.equal(rc.readUInt16LE(12), 1500); assert.equal(rc.readUInt16LE(16), 2000);
});
test('Betaflight output order is FL FR RR RL and malformed output is rejected', () => {
  const bytes = Buffer.alloc(16); [.1,.2,.3,.4].forEach((v,i) => bytes.writeFloatLE(v,4*i));
  assert.deepEqual(decodeBetaflightMotors(bytes).map(v => Number(v.toFixed(2))), [.3,.1,.4,.2]);
  bytes.writeFloatLE(NaN); assert.equal(decodeBetaflightMotors(bytes), null);
  assert.equal(decodeBetaflightMotors(Buffer.alloc(15)), null);
});
test('sensor validation rejects malformed vectors, NaN, non-unit orientation and unsafe integers', () => {
  for (const edit of [{ quaternionWxyz: [2,0,0,0] }, { gyroFrd: [NaN,0,0] }, { timeUs: Infinity },
    { sequence: -.1 }, { positionNed: [0,0] }, { rc: { ...sampleFrame().rc, throttle: -1 } }]) {
    assert.throws(() => validateFrame({ ...sampleFrame(), ...edit }));
  }
});
test('MAVLink CRC accumulator matches the independent CRC-16/MCRF4XX check vector', () => {
  assert.equal(crcX25(Buffer.from('123456789')), 0x6f91);
});
test('PX4 sensor encoding uses FRD SI units and simulation microseconds', () => {
  const parser = new MavlinkParser(), messages = parser.push(Buffer.concat(encodePx4Sensors(sampleFrame())));
  assert.deepEqual(messages.map(v => v.id), [0,65,113,107]);
  const payload = messages[3].payload;
  assert.equal(Number(payload.readBigUInt64LE()), 1000000);
  assert.ok(Math.abs(payload.readFloatLE(16)+9.80665) < 1e-5);
  assert.equal(payload.readUInt32LE(60), 0x1fff);
  assert.equal(messages[2].payload[34],3);
});
test('MAVLink parser survives split packets, junk and rejects corrupted CRC', () => {
  const parser = new MavlinkParser(), packet = encodePx4Sensors(sampleFrame())[3];
  assert.deepEqual(parser.push(Buffer.concat([Buffer.from([9,8,7]), packet.subarray(0,15)])), []);
  assert.equal(parser.push(packet.subarray(15))[0].id,107);
  const damaged = Buffer.from(packet); damaged[20] ^= 255;
  assert.deepEqual(parser.push(damaged),[]);
  const signed = Buffer.concat([packet,Buffer.alloc(13)]); signed[2] = 1;
  assert.deepEqual(parser.push(signed),[]);
});
test('PX4 actuator modes disarm motors and preserve lockstep timestamp', () => {
  const payload = Buffer.alloc(81); payload.writeBigUInt64LE(1000000n);
  [.1,.2,.3,.4].forEach((v,i)=>payload.writeFloatLE(v,16+i*4)); payload[80]=128;
  const decoded = new MavlinkParser().push(encodeMavlink(93,payload))[0];
  assert.deepEqual(decodePx4Actuators(decoded.payload).motors.map(v=>Number(v.toFixed(2))),[.3,.1,.4,.2]);
  payload[80]=0; assert.deepEqual(decodePx4Actuators(payload).motors,[0,0,0,0]);
  assert.equal(decodePx4Actuators(payload).timeUs,1000000);
});
