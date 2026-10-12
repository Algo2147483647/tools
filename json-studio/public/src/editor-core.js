export const EditorCore = (() => {
  function analyze(text) {
    const tokens = [],
      pairs = new Map(),
      stack = [];
    const pattern =
      /"(?:\\[\s\S]|[^"\\])*(?:"|$)|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}\[\]]/g;
    let match,
      color = text.length <= 300000;
    while ((match = pattern.exec(text))) {
      const raw = match[0],
        start = match.index,
        end = pattern.lastIndex;
      if ('{['.includes(raw)) stack.push({ raw, start });
      else if ('}]'.includes(raw)) {
        const open = stack.pop();
        if (open && (open.raw === '{' ? '}' : ']') === raw) {
          pairs.set(open.start, start);
          pairs.set(start, open.start);
        } else stack.length = 0;
      }
      let type = '';
      if (raw[0] === '"')
        type = /^\s*:/.test(text.slice(end, end + 1024)) ? 'token-key' : 'type-string';
      else if (/^[\d-]/.test(raw)) type = 'type-number';
      else if (raw === 'null') type = 'type-null';
      else if (raw === 'true' || raw === 'false') type = 'type-boolean';
      if (color && type) {
        tokens.push({ start, end, type });
        if (tokens.length > 20000) {
          tokens.length = 0;
          color = false;
        }
      }
    }
    return { tokens, pairs };
  }
  function indentSelection(text, start, end, unit, outdent = false) {
    if (start === end && !outdent)
      return {
        text: text.slice(0, start) + unit + text.slice(end),
        start: start + unit.length,
        end: start + unit.length,
      };
    const from = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
    const last = end > start && text[end - 1] === '\n' ? end - 1 : end;
    const to = text.indexOf('\n', last),
      stop = to === -1 ? text.length : to;
    let delta = 0,
      firstDelta = 0;
    const body = text
      .slice(from, stop)
      .split('\n')
      .map((line, index) => {
        const remove = outdent
          ? line.startsWith('\t')
            ? 1
            : Math.min(unit === '\t' ? 2 : unit.length, line.match(/^ */)[0].length)
          : 0;
        const change = outdent ? -remove : unit.length;
        if (!index) firstDelta = change;
        delta += change;
        return outdent ? line.slice(remove) : unit + line;
      })
      .join('\n');
    const nextStart = Math.max(from, start + firstDelta),
      nextEnd = Math.max(nextStart, end + delta);
    return { text: text.slice(0, from) + body + text.slice(stop), start: nextStart, end: nextEnd };
  }
  return { analyze, indentSelection };
})();
