import http from 'node:http';
import dgram from 'node:dgram';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { validateFrame, encodeBetaflightFdm, encodeBetaflightRc, decodeBetaflightMotors,
  encodePx4Sensors, decodePx4Actuators, MavlinkParser } from './protocol.mjs';

export async function startBridge(options = {}) {
  const ports = { websocket: 4190, bfMotors: 9002, bfSensors: 9003, bfRc: 9004, px4: 4560, ...options.ports };
  const allowedOrigins = options.allowedOrigins ?? ['http://127.0.0.1:4188', 'http://localhost:4188'];
  const timeoutMs = options.timeoutMs ?? 2000;
  let client = null, socket = null, px4Peer = null, protocol = null, pending = null, timer = null, lastTime = -1, lastSequence = -1, mavSequence = 0;
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:4188');
    res.end(JSON.stringify({ service: 'FlightLab local SITL bridge', version: 1, protocol,
      firmwareVerified: false, transport: socket ? 'open' : 'closed', pending: pending?.sequence ?? null }));
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false });
  server.on('upgrade', (req, transport, head) => {
    if (req.url !== '/sitl' || !allowedOrigins.includes(req.headers.origin) || client) {
      transport.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); transport.destroy(); return;
    }
    wss.handleUpgrade(req, transport, head, ws => wss.emit('connection', ws));
  });
  const send = value => { if (client?.readyState === WebSocket.OPEN) client.send(JSON.stringify(value)); };
  function stopTransport() {
    clearTimeout(timer); timer = null; pending = null; protocol = null;
    const old = socket; socket = null; px4Peer?.destroy(); px4Peer = null;
    if (old instanceof net.Socket) old.destroy();
    else if (old) { try { old.close(); } catch {} }
  }
  function fail(message) { stopTransport(); send({ type: 'error', message }); }
  function acceptMotors(motors, timestamp) {
    if (!pending) return;
    // PX4 echoes simulation timestamps. Betaflight's motor packet has no timestamp:
    // one outstanding sensor frame is the strongest ordering its ABI allows.
    if (timestamp !== undefined && timestamp !== pending.timeUs) return;
    clearTimeout(timer); timer = null;
    const frame = pending; pending = null;
    send({ type: 'actuators', sequence: frame.sequence, timeUs: frame.timeUs,
      motors: frame.rc.armed ? motors : [0, 0, 0, 0] });
  }
  function openTransport(selected) {
    stopTransport(); protocol = selected; lastTime = -1; lastSequence = -1; mavSequence = 0;
    if (selected === 'betaflight') {
      const udp = dgram.createSocket('udp4'); socket = udp;
      udp.on('error', error => { if (socket === udp) fail(`Betaflight UDP: ${error.message}`); });
      udp.on('message', (bytes, remote) => {
        if (socket !== udp || remote.address !== '127.0.0.1') return;
        const motors = decodeBetaflightMotors(bytes); if (motors) acceptMotors(motors);
      });
      udp.bind(ports.bfMotors, '127.0.0.1', () => {
        if (socket === udp) send({ type: 'ready', protocol: selected, message: 'UDP ready; waiting for real firmware responses.' });
      });
    } else {
      // Current PX4 is the TCP client; the simulator owns the listening port.
      const listener = net.createServer(tcp => {
        if (socket !== listener || px4Peer || tcp.remoteAddress !== '127.0.0.1') { tcp.destroy(); return; }
        px4Peer = tcp; tcp.setNoDelay(true); const parser = new MavlinkParser();
        tcp.on('error', error => { if (px4Peer === tcp) fail(`PX4 TCP: ${error.message}`); });
        tcp.on('close', () => { if (px4Peer === tcp) fail('PX4 firmware disconnected.'); });
        tcp.on('data', bytes => {
          if (px4Peer !== tcp) return;
          for (const message of parser.push(bytes)) {
            if (message.id !== 93) continue;
            const result = decodePx4Actuators(message.payload);
            if (result) acceptMotors(result.motors, result.timeUs);
          }
        });
        if (pending) sendPx4(pending);
      });
      socket = listener;
      listener.on('error', error => { if (socket === listener) fail(`PX4 TCP: ${error.message}`); });
      listener.listen(ports.px4, '127.0.0.1', () => {
        if (socket === listener) send({ type: 'ready', protocol: selected, message: 'Listening for PX4 on localhost TCP 4560.' });
      });
    }
  }
  function sendPx4(frame) {
    if (!px4Peer) return;
    for (const packet of encodePx4Sensors(frame, mavSequence)) px4Peer.write(packet);
    mavSequence = (mavSequence + 4) & 255;
  }
  wss.on('connection', ws => {
    client = ws;
    ws.on('close', () => { if (client === ws) { stopTransport(); client = null; } });
    ws.on('error', () => { if (client === ws) { stopTransport(); client = null; } });
    ws.on('message', (bytes, binary) => {
      try {
        if (binary) throw Error('JSON messages required.');
        const message = JSON.parse(bytes.toString());
        if (message.type === 'connect') {
          if (!['betaflight', 'px4'].includes(message.protocol)) throw Error('Unsupported firmware protocol.');
          openTransport(message.protocol); return;
        }
        if (message.type === 'disconnect') { stopTransport(); send({ type: 'disconnected' }); return; }
        if (message.type !== 'frame') throw Error('Unknown message type.');
        if (!socket || !protocol) throw Error('Connect firmware before sending sensors.');
        if (pending) throw Error('Lockstep violation: wait for the previous actuator response.');
        const frame = validateFrame(message.frame);
        if (frame.timeUs <= lastTime || frame.sequence <= lastSequence) throw Error('Simulation time and sequence must increase. Reconnect after resetting.');
        lastTime = frame.timeUs; lastSequence = frame.sequence; pending = frame;
        timer = setTimeout(() => fail('Firmware actuator timeout. Simulation stopped; no fallback motor output.'), timeoutMs);
        if (protocol === 'betaflight') {
          const udp = socket;
          // RC is sent before the corresponding sensor sample releases the firmware PID loop.
          udp.send(encodeBetaflightRc(frame), ports.bfRc, '127.0.0.1', error => {
            if (error && socket === udp) fail(error.message);
            else if (socket === udp && pending === frame) udp.send(encodeBetaflightFdm(frame), ports.bfSensors, '127.0.0.1');
          });
        } else {
          sendPx4(frame);
        }
      } catch (error) { fail(error instanceof Error ? error.message : 'Invalid bridge request.'); }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(ports.websocket, '127.0.0.1', resolve); });
  return { port: server.address().port, close: async () => {
    stopTransport(); for (const ws of wss.clients) ws.terminate();
    await new Promise(resolve => wss.close(resolve)); await new Promise(resolve => server.close(resolve));
  }};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bridge = await startBridge();
  console.log(`FlightLab SITL bridge: ws://127.0.0.1:${bridge.port}/sitl`);
  console.log('Real firmware only. Run bridge/mock-firmware.mjs separately for explicitly labeled protocol tests.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await bridge.close(); process.exit(0); });
}
