import { analyzeDocument } from './analysis.js';

self.onmessage = ({ data: { kind, payload } }) => {
  try {
    self.postMessage({ result: analyzeDocument(kind, payload) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
