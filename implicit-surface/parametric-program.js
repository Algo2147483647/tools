/* Restricted, case-sensitive scalar programs. No dynamic JavaScript evaluation. */
(function (root) {
  "use strict";
  function createProgram(math) {
    const own = (object, key) =>
      Object.prototype.hasOwnProperty.call(object, key);
    function compile(source) {
      if (typeof source !== "string" || !source.trim())
        throw new Error("Enter a parametric program.");
      if (source.length > 65536)
        throw new Error("Keep programs under 65,536 characters.");
      const definitions = new Map(),
        parameters = [];
      const fail = (message, offset = 0) => {
        const before = source.slice(0, offset),
          line = before.split("\n").length;
        const column = offset - before.lastIndexOf("\n");
        const error = new Error(`Line ${line}, column ${column}: ${message}`);
        Object.assign(error, { line, column, offset });
        throw error;
      };
      const parse = (text, offset) => {
        try {
          return math.parseExpression(text);
        } catch (error) {
          fail(error.message, offset + (error.offset || 0));
        }
      };
      // Preserve source offsets while removing comments and joining bracketed lines.
      const clean = source.replace(/#[^\n]*/g, (text) =>
        " ".repeat(text.length),
      );
      let start = 0,
        depth = 0;
      const statements = [];
      for (let i = 0; i <= clean.length; i++) {
        const c = clean[i];
        if (c === "(" || c === "[") depth++;
        if (c === ")" || c === "]") depth--;
        if (depth < 0) fail("Unexpected closing bracket.", i);
        if (i === clean.length || (!depth && (c === "\n" || c === ";"))) {
          const text = clean.slice(start, i),
            leading = text.search(/\S/);
          if (leading >= 0)
            statements.push({ text: text.trim(), offset: start + leading });
          start = i + 1;
        }
      }
      if (depth) fail("Unclosed bracket.", source.length);
      if (statements.length > 256) fail("Use at most 256 definitions.");
      const reserved = (name) =>
        own(math.functions, name) ||
        own(math.constants, name) ||
        ["parameter", "const"].includes(name);
      for (const statement of statements) {
        const { text, offset } = statement;
        const match = text.match(
          /^(?:(parameter|const)\s+)?([A-Za-z_][A-Za-z_0-9]*)(?:\s*\(([^()]*)\))?\s*=\s*([\s\S]+)$/,
        );
        if (!match)
          fail(
            "Expected a parameter, constant, function, or scalar definition.",
            offset,
          );
        const [, prefix, name, formalText, body] = match;
        if (reserved(name)) fail(`“${name}” is reserved.`, offset);
        if (definitions.has(name))
          fail(`Duplicate definition “${name}”.`, offset);
        const bodyOffset = offset + text.length - body.length;
        let kind = prefix || (formalText !== undefined ? "function" : "scalar");
        if (prefix && formalText !== undefined)
          fail("Parameters and constants cannot have arguments.", offset);
        if (["X", "Y", "Z"].includes(name) && kind !== "scalar")
          fail(`${name} must be a scalar coordinate output.`, offset);
        const def = { name, kind, offset, bodyOffset };
        if (kind === "parameter") {
          const range = body.match(/^\[([\s\S]*)\]$/);
          if (!range)
            fail("A parameter range must be [minimum, maximum].", bodyOffset);
          let nesting = 0,
            split = -1;
          for (let i = 0; i < range[1].length; i++) {
            if (range[1][i] === "(") nesting++;
            if (range[1][i] === ")") nesting--;
            if (!nesting && range[1][i] === ",") {
              if (split >= 0)
                fail("A range needs exactly two bounds.", bodyOffset);
              split = i;
            }
          }
          if (split < 0) fail("A range needs two bounds.", bodyOffset);
          def.bounds = [
            {
              ast: parse(range[1].slice(0, split), bodyOffset + 1),
              offset: bodyOffset + 1,
            },
            {
              ast: parse(range[1].slice(split + 1), bodyOffset + split + 2),
              offset: bodyOffset + split + 2,
            },
          ];
          def.index = parameters.length;
          parameters.push(def);
        } else {
          def.args =
            formalText === undefined
              ? []
              : formalText.split(",").map((v) => v.trim());
          if (formalText === "") def.args = [];
          if (
            def.args.length > 8 ||
            new Set(def.args).size !== def.args.length ||
            def.args.some(
              (arg) => !/^[A-Za-z_][A-Za-z_0-9]*$/.test(arg) || reserved(arg),
            )
          )
            fail(
              "Use at most eight unique, non-reserved argument names.",
              offset,
            );
          def.ast = parse(body, bodyOffset);
        }
        definitions.set(name, def);
      }
      if (parameters.length !== 2) fail("Declare exactly two parameters.");
      for (const output of ["X", "Y", "Z"])
        if (!definitions.has(output))
          fail(`Missing coordinate output ${output}.`);
      // Validate every definition, including unused functions, before expansion.
      const dependencies = new Map();
      function check(ast, def, offset, constantOnly = false) {
        if (ast.type === "name") {
          if (def.args?.includes(ast.name) || own(math.constants, ast.name))
            return;
          const target = definitions.get(ast.name);
          if (!target) fail(`Unknown name “${ast.name}”.`, offset + ast.at);
          if (target.kind === "function")
            fail(
              `Function “${ast.name}” needs parentheses and arguments.`,
              offset + ast.at,
            );
          if (
            (constantOnly || def.kind === "const" || def.kind === "function") &&
            target.kind !== "const"
          )
            fail(
              `Pass “${ast.name}” explicitly as a function argument; only constants may be captured.`,
              offset + ast.at,
            );
          dependencies.get(def.name).add(ast.name);
        } else if (ast.type === "call") {
          const builtin = own(math.functions, ast.name)
            ? math.functions[ast.name]
            : null;
          const target = definitions.get(ast.name);
          if (!builtin && target?.kind !== "function")
            fail(
              `Unknown function “${ast.name}”. Use * for multiplication by a named value.`,
              offset + ast.at,
            );
          const arity = builtin ? builtin[1] : target.args.length;
          if (ast.args.length !== arity)
            fail(`${ast.name} expects ${arity} argument(s).`, offset + ast.at);
          if (!builtin) dependencies.get(def.name).add(ast.name);
          ast.args.forEach((arg) => check(arg, def, offset, constantOnly));
        } else if (ast.type === "binary") {
          check(ast.a, def, offset, constantOnly);
          check(ast.b, def, offset, constantOnly);
        } else if (ast.type === "negate")
          check(ast.a, def, offset, constantOnly);
      }
      for (const def of definitions.values())
        dependencies.set(def.name, new Set());
      for (const def of definitions.values()) {
        if (def.bounds)
          def.bounds.forEach((bound) =>
            check(bound.ast, def, bound.offset, true),
          );
        else check(def.ast, def, def.bodyOffset);
      }
      const visited = new Set(),
        stack = [];
      function visit(name) {
        if (stack.includes(name))
          fail(
            `Circular dependency: ${[...stack.slice(stack.indexOf(name)), name].join(" → ")}.`,
            definitions.get(name).offset,
          );
        if (visited.has(name)) return;
        stack.push(name);
        if (stack.length > 48)
          fail(
            "Definition dependency depth exceeds 48.",
            definitions.get(name).offset,
          );
        dependencies.get(name).forEach(visit);
        stack.pop();
        visited.add(name);
      }
      definitions.forEach((_, name) => visit(name));
      const nodes = [],
        interned = new Map(),
        globals = new Map();
      const calculate = (op, a, b) => {
        switch (op) {
          case "+":
            return a + b;
          case "-":
            return a - b;
          case "*":
            return a * b;
          case "/":
            return a / b;
          case "^":
            return Math.pow(a, b);
          case "negate":
            return -a;
          default:
            return math.functions[op][0](a, b);
        }
      };
      const operation = (node, values) =>
        calculate(node.op, values[node.inputs[0]], values[node.inputs[1]]);
      function add(node) {
        if (node.inputs) {
          node.mask = node.inputs.reduce(
            (mask, id) => mask | nodes[id].mask,
            0,
          );
          if (!node.mask)
            node = {
              value: calculate(
                node.op,
                nodes[node.inputs[0]]?.value,
                nodes[node.inputs[1]]?.value,
              ),
              mask: 0,
            };
        }
        const key = node.inputs
          ? `${node.op}:${node.inputs.join(",")}`
          : node.parameter !== undefined
            ? `p:${node.parameter}`
            : `n:${Object.is(node.value, -0) ? "-0" : node.value}`;
        if (interned.has(key)) return interned.get(key);
        if (nodes.length >= 8192)
          fail("The expanded program exceeds 8,192 operations.");
        const id = nodes.length;
        nodes.push(node);
        interned.set(key, id);
        return id;
      }
      let expanded = 0;
      function expand(ast, locals = new Map(), depth = 0) {
        if (++expanded > 100000 || depth > 96)
          fail("The expanded program is too complex.");
        if (ast.type === "number") return add({ value: ast.value, mask: 0 });
        if (ast.type === "name") {
          if (locals.has(ast.name)) return locals.get(ast.name);
          if (own(math.constants, ast.name))
            return add({ value: math.constants[ast.name], mask: 0 });
          return global(ast.name, depth + 1);
        }
        if (ast.type === "binary")
          return add({
            op: ast.op,
            inputs: [
              expand(ast.a, locals, depth + 1),
              expand(ast.b, locals, depth + 1),
            ],
          });
        if (ast.type === "negate")
          return add({
            op: "negate",
            inputs: [expand(ast.a, locals, depth + 1)],
          });
        const inputs = ast.args.map((arg) => expand(arg, locals, depth + 1));
        if (own(math.functions, ast.name)) return add({ op: ast.name, inputs });
        const def = definitions.get(ast.name);
        return expand(
          def.ast,
          new Map(def.args.map((name, i) => [name, inputs[i]])),
          depth + 1,
        );
      }
      function global(name, depth = 0) {
        if (globals.has(name)) return globals.get(name);
        const def = definitions.get(name);
        const id =
          def.kind === "parameter"
            ? add({ parameter: def.index, mask: 1 << def.index })
            : expand(def.ast, new Map(), depth + 1);
        globals.set(name, id);
        return id;
      }
      for (const def of definitions.values())
        if (def.kind === "const") {
          const node = nodes[global(def.name)];
          if (node.mask || !Number.isFinite(node.value))
            fail(`Constant “${def.name}” must be finite.`, def.offset);
        }
      const domain = parameters.map((def) => {
        const range = def.bounds.map((bound) => nodes[expand(bound.ast)].value);
        const span = range[1] - range[0];
        if (
          !range.every(Number.isFinite) ||
          !(span > 0) ||
          !Number.isFinite(span)
        )
          fail(
            `Parameter “${def.name}” needs finite, increasing bounds.`,
            def.offset,
          );
        return range;
      });
      const outputs = ["X", "Y", "Z"].map((name) => global(name));
      const groups = [[], [], [], []];
      nodes.forEach((node, id) => groups[node.mask].push(id));
      const scratch = new Float64Array(nodes.length);
      function evaluate(a, b, out = [0, 0, 0]) {
        const values = scratch;
        nodes.forEach((node, id) => {
          values[id] =
            node.parameter !== undefined
              ? [a, b][node.parameter]
              : node.inputs
                ? operation(node, values)
                : node.value;
        });
        outputs.forEach((id, i) => (out[i] = values[id]));
        return out;
      }
      function sampling(options = {}) {
        const counts = domain.map(([lo, hi], i) =>
          options.mode === "step"
            ? Math.ceil((hi - lo) / options.steps?.[i])
            : options.counts?.[i],
        );
        if (
          options.mode === "step" &&
          (!options.steps ||
            options.steps.some((v) => !Number.isFinite(v) || v <= 0))
        )
          throw new Error(
            "Both parameter steps must be positive finite numbers.",
          );
        if (counts.some((n) => !Number.isInteger(n) || n < 1 || n > 16384))
          throw new Error("Use 1–16,384 cells per parameter.");
        const cells = counts[0] * counts[1],
          points = (counts[0] + 1) * (counts[1] + 1);
        if (cells * 2 > 420000)
          throw new Error(
            "This grid exceeds 420,000 triangles. Reduce either parameter's cell count or increase its step.",
          );
        const steps = domain.map(([a, b], i) => (b - a) / counts[i]);
        domain.forEach(([a, b], i) => {
          if (a + steps[i] === a || b - steps[i] === b)
            throw new Error(
              `The ${parameters[i].name} range cannot be sampled accurately at this resolution.`,
            );
        });
        const cacheValues =
          groups[1].length * (counts[0] + 1) +
          groups[2].length * (counts[1] + 1);
        const bytes = cacheValues * 8 + points * 64 + cells * 2 * 108;
        const operations =
          cacheValues + groups[3].length * points + nodes.length * cells;
        if (bytes > 192 * 1024 * 1024)
          throw new Error(
            "Estimated build memory exceeds 192 MiB. Reduce sampling or simplify the program.",
          );
        if (operations > 100000000)
          throw new Error(
            "Estimated evaluation cost exceeds 100 million operations. Reduce sampling or simplify the program.",
          );
        return {
          counts,
          steps,
          cells,
          points,
          bytes,
          operations,
          names: parameters.map((p) => p.name),
          domain,
        };
      }
      function createSampler(grid) {
        const values = new Float64Array(nodes.length);
        groups[0].forEach((id) => (values[id] = nodes[id].value));
        const caches = [1, 2].map((mask, axis) => {
          const ids = groups[mask],
            cache = new Float64Array(ids.length * (grid.counts[axis] + 1));
          for (let i = 0; i <= grid.counts[axis]; i++) {
            const t =
              domain[axis][0] +
              ((domain[axis][1] - domain[axis][0]) * i) / grid.counts[axis];
            ids.forEach((id, k) => {
              const node = nodes[id];
              values[id] =
                node.parameter !== undefined ? t : operation(node, values);
              cache[i * ids.length + k] = values[id];
            });
          }
          return cache;
        });
        return (i, j, out) => {
          groups[1].forEach(
            (id, k) => (values[id] = caches[0][i * groups[1].length + k]),
          );
          groups[2].forEach(
            (id, k) => (values[id] = caches[1][j * groups[2].length + k]),
          );
          groups[3].forEach(
            (id) => (values[id] = operation(nodes[id], values)),
          );
          outputs.forEach((id, axis) => (out[axis] = values[id]));
          return out;
        };
      }
      return {
        domain,
        parameters: parameters.map((p) => p.name),
        evaluate,
        sampling,
        createSampler,
        operationCount: nodes.length,
      };
    }
    return { compile };
  }
  root.SurfaceProgram = { createProgram };
  if (typeof module !== "undefined" && module.exports)
    module.exports = root.SurfaceProgram;
})(typeof globalThis !== "undefined" ? globalThis : this);
