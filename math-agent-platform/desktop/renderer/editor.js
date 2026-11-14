import Editor from '@toast-ui/editor';
import '@toast-ui/editor/dist/toastui-editor.css';
import 'katex/dist/katex.min.css';
import { renderMarkdown } from './markdown.cjs';
window.toastui = { Editor };
window.mathMarkdown = { renderMarkdown };

import { liveMath } from './live-math.cjs';
window.liveMath = liveMath;
