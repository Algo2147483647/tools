const { parentPort, workerData } = require('node:worker_threads');
const { solve } = require('./engine.cjs');
try {
  const result = solve(workerData.input, (stage, message) => parentPort.postMessage({ type: 'event', stage, message }));
  parentPort.postMessage({ type: 'result', result });
} catch (error) { parentPort.postMessage({ type: 'error', error: { code: error.code || 'INVALID_INPUT', message: error.message } }); }
