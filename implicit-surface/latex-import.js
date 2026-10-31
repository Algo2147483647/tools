/* Deterministic LaTeX subset importer with structural matrix expansion. */
(function (root) {
  "use strict";
  function createImporter(programs) {
    function convert(source) {
      if (typeof source !== "string" || source.length > 65536)
        throw new Error("Use at most 65,536 LaTeX characters.");
      const tokens = [];
      const fail = (message, at = 0) => {
        const before = source.slice(0, at),
          line = before.split("\n").length,
          column = at - before.lastIndexOf("\n");
        const error = new Error(
          `LaTeX line ${line}, column ${column}: ${message}`,
        );
        Object.assign(error, { line, column, offset: at });
        throw error;
      };
      const greek = new Set([
        "alpha",
        "beta",
        "gamma",
        "delta",
        "epsilon",
        "theta",
        "phi",
        "varphi",
        "rho",
        "sigma",
        "tau",
        "omega",
        "lambda",
        "mu",
        "nu",
        "eta",
        "zeta",
        "kappa",
        "psi",
      ]);
      const unary = new Set([
        "sin",
        "cos",
        "tan",
        "asin",
        "acos",
        "atan",
        "sinh",
        "cosh",
        "tanh",
        "sqrt",
        "abs",
        "exp",
        "log",
        "ln",
        "log10",
        "log2",
        "floor",
        "ceil",
      ]);
      let i = 0;
      function rawGroup() {
        while (/\s/.test(source[i] || "") && i < source.length) i++;
        if (source[i] !== "{") fail("Expected a braced command argument.", i);
        const start = ++i;
        let depth = 1;
        while (i < source.length && depth) {
          if (source[i] === "{") depth++;
          if (source[i] === "}") depth--;
          i++;
        }
        if (depth) fail("Unclosed command argument.", start - 1);
        return source.slice(start, i - 1);
      }
      while (i < source.length) {
        const at = i,
          c = source[i];
        if (/\s/.test(c) || c === "$") {
          i++;
          continue;
        }
        if (c === "%") {
          while (i < source.length && source[i] !== "\n") i++;
          continue;
        }
        if (c === "\\") {
          const slashes = source.slice(i).match(/^\\{2,}/);
          if (slashes) {
            tokens.push({ type: "row", at });
            i += slashes[0].length - (slashes[0].length % 2);
            continue;
          }
          i++;
          if (",;! :".includes(source[i] || "\0")) {
            i++;
            continue;
          }
          if (["_", "*"].includes(source[i])) {
            tokens.push({ type: source[i++], at });
            continue;
          }
          if (["[", "]"].includes(source[i])) {
            i++;
            continue;
          }
          const command = source.slice(i).match(/^[A-Za-z]+/);
          if (!command) fail("Unsupported escape sequence.", at);
          i += command[0].length;
          const name = command[0];
          if (["left", "right", "quad", "qquad"].includes(name)) continue;
          if (name === "begin" || name === "end") {
            const environment = rawGroup().replace(/\\\*/g, "*");
            if (
              ![
                "align",
                "align*",
                "aligned",
                "equation",
                "equation*",
                "matrix",
                "pmatrix",
                "bmatrix",
              ].includes(environment)
            )
              fail(`Unsupported environment “${environment}”.`, at);
            tokens.push({ type: name, value: environment, at });
            continue;
          }
          if (name === "tag" || name === "label") {
            tokens.push({ type: "tag", value: rawGroup(), at });
            continue;
          }
          if (["cdot", "times"].includes(name)) {
            tokens.push({ type: "*", at });
            continue;
          }
          if (name === "in") {
            tokens.push({ type: "in", at });
            continue;
          }
          if (name === "frac" || name === "dfrac" || name === "tfrac") {
            tokens.push({ type: "frac", at });
            continue;
          }
          if (name === "operatorname" || name === "mathrm") {
            const value = rawGroup();
            if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value))
              fail("Only plain function names are supported here.", at);
            tokens.push({ type: "name", value, at });
            continue;
          }
          if (name === "pi" || greek.has(name)) {
            tokens.push({ type: "name", value: name, at });
            continue;
          }
          if (unary.has(name)) {
            tokens.push({ type: "unaryFunction", value: name, at });
            continue;
          }
          if (["mod", "min", "max", "pow", "atan2"].includes(name)) {
            tokens.push({ type: "name", value: name, at });
            continue;
          }
          fail(`Unsupported command \\${name}.`, at);
        }
        const number = source
          .slice(i)
          .match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
        if (number) {
          tokens.push({ type: "number", value: number[0], at });
          i += number[0].length;
          continue;
        }
        const name = source.slice(i).match(/^[A-Za-z][A-Za-z0-9]*/);
        if (name) {
          tokens.push({ type: "name", value: name[0], at });
          i += name[0].length;
          continue;
        }
        const symbols = {
          π: ["name", "pi"],
          θ: ["name", "theta"],
          α: ["name", "alpha"],
          "−": ["-"],
          "×": ["*"],
          "÷": ["/"],
        };
        if (symbols[c]) {
          tokens.push({ type: symbols[c][0], value: symbols[c][1], at });
          i++;
          continue;
        }
        if ("+-*/^(){}[],=_&".includes(c)) {
          tokens.push({ type: c, at });
          i++;
          continue;
        }
        fail(`Unsupported character “${c}”.`, at);
      }
      if (tokens.length > 32768) fail("LaTeX input exceeds 32,768 tokens.");
      tokens.push({ type: "endOfInput", at: source.length });
      let cursor = 0,
        depth = 0;
      const peek = () => tokens[cursor];
      const take = (type) => (peek().type === type ? tokens[cursor++] : null);
      const expect = (type) => {
        const token = take(type);
        if (!token) fail(`Expected “${type}”.`, peek().at);
        return token;
      };
      const scalar = (text) => ({ text });
      const isMatrix = (value) => !!value.rows;
      function combine(op, a, b, at) {
        if (!isMatrix(a) && !isMatrix(b))
          return scalar(`(${a.text} ${op} ${b.text})`);
        if (op === "*" && isMatrix(a) && isMatrix(b)) {
          if (a.rows[0].length !== b.rows.length)
            fail("Matrix multiplication dimensions do not match.", at);
          return {
            rows: a.rows.map((row) =>
              b.rows[0].map((_, col) =>
                scalar(
                  `(${row.map((value, k) => `(${value.text})*(${b.rows[k][col].text})`).join(" + ")})`,
                ),
              ),
            ),
          };
        }
        if (op === "*" && isMatrix(a) !== isMatrix(b)) {
          const matrix = isMatrix(a) ? a : b,
            factor = isMatrix(a) ? b : a;
          return {
            rows: matrix.rows.map((row) =>
              row.map((value) => combine("*", value, factor, at)),
            ),
          };
        }
        fail(
          "Only scalar expressions, matrix products, and scalar–matrix products are supported.",
          at,
        );
      }
      function expression(minimum = 0) {
        if (++depth > 48) fail("LaTeX nesting exceeds 48 levels.", peek().at);
        let a;
        if (take("+")) a = expression(40);
        else if (take("-"))
          a = combine("*", scalar("-1"), expression(40), peek().at);
        else a = primary();
        while (true) {
          const token = peek();
          const implicit = [
            "name",
            "number",
            "(",
            "{",
            "frac",
            "unaryFunction",
            "begin",
          ].includes(token.type);
          const op = implicit ? "*" : token.type;
          const precedence = { "+": 20, "-": 20, "*": 30, "/": 30, "^": 50 }[
            op
          ];
          if (precedence === undefined || precedence < minimum) break;
          if (!implicit) cursor++;
          const b = expression(op === "^" ? precedence : precedence + 1);
          a = combine(op, a, b, token.at);
        }
        depth--;
        return a;
      }
      function group(open, close) {
        expect(open);
        const result = expression();
        expect(close);
        return result;
      }
      function primary() {
        const token = peek();
        if (take("number")) return scalar(token.value);
        if (token.type === "(") return group("(", ")");
        if (token.type === "{") return group("{", "}");
        if (take("frac"))
          return combine("/", group("{", "}"), group("{", "}"), token.at);
        if (take("unaryFunction")) {
          const arg = expression(40);
          if (isMatrix(arg))
            fail("A function argument must be scalar.", token.at);
          return scalar(`${token.value}(${arg.text})`);
        }
        if (take("name")) {
          let name = token.value;
          if (take("_")) {
            let suffix;
            if (take("{")) {
              const next = tokens[cursor++];
              if (!["name", "number"].includes(next.type))
                fail("Use a simple subscript name or integer.", next.at);
              suffix = next.value;
              expect("}");
            } else {
              const next = tokens[cursor++];
              if (!["name", "number"].includes(next.type))
                fail("Use a simple subscript name or integer.", next.at);
              suffix = next.value;
            }
            if (!/^[A-Za-z0-9]+$/.test(suffix))
              fail("Unsupported subscript.", token.at);
            name += "_" + suffix;
          }
          if (take("(")) {
            const args = [];
            if (peek().type !== ")") {
              args.push(expression());
              while (take(",")) args.push(expression());
            }
            expect(")");
            if (args.some(isMatrix))
              fail("Function arguments must be scalar.", token.at);
            return scalar(`${name}(${args.map((arg) => arg.text).join(", ")})`);
          }
          return scalar(name);
        }
        if (take("begin")) {
          if (!["matrix", "pmatrix", "bmatrix"].includes(token.value))
            fail("Unexpected nested equation environment.", token.at);
          const rows = [],
            row = [];
          while (peek().type !== "end") {
            row.push(expression());
            if (row.some(isMatrix))
              fail("Nested matrices are not supported.", token.at);
            if (take("&")) continue;
            rows.push(row.splice(0));
            if (!take("row")) break;
            if (rows.length > 4)
              fail("Use matrices no larger than 4 × 4.", token.at);
          }
          if (row.length) rows.push(row);
          const end = expect("end");
          if (end.value !== token.value)
            fail("Matrix environments do not match.", end.at);
          if (
            !rows.length ||
            rows.length > 4 ||
            rows[0].length > 4 ||
            rows.some((row) => row.length !== rows[0].length)
          )
            fail(
              "Matrix rows must have equal lengths, at most four rows and columns.",
              token.at,
            );
          return { rows };
        }
        fail("Expected a scalar expression or matrix.", token.at);
      }
      const lines = [],
        mappings = [];
      let environment = null;
      if (
        peek().type === "begin" &&
        !["matrix", "pmatrix", "bmatrix"].includes(peek().value)
      )
        environment = tokens[cursor++].value;
      function emit(text, at) {
        if (lines.join("\n").length + text.length > 65536)
          fail("Expanded LaTeX exceeds the program size limit.", at);
        mappings.push({ generatedLine: lines.length + 1, sourceOffset: at });
        lines.push(text);
      }
      while (!["endOfInput", "end"].includes(peek().type)) {
        if (take("row")) continue;
        const at = peek().at;
        // Parameter declarations have a tuple on each side of membership.
        let scan = cursor,
          nesting = 0,
          membership = false;
        while (!["row", "endOfInput", "="].includes(tokens[scan]?.type)) {
          if (tokens[scan]?.type === "in") {
            membership = true;
            break;
          }
          if (++nesting > tokens.length || !tokens[++scan]) break;
        }
        const generated = [];
        if (membership) {
          expect("(");
          const a = expect("name").value;
          expect(",");
          const b = expect("name").value;
          expect(")");
          take("&");
          expect("in");
          expect("(");
          for (const name of [a, b]) {
            expect("[");
            const lo = expression();
            expect(",");
            const hi = expression();
            expect("]");
            if (isMatrix(lo) || isMatrix(hi))
              fail("Parameter bounds must be scalar.", at);
            generated.push(`parameter ${name} = [${lo.text}, ${hi.text}]`);
            if (name === a) expect(",");
          }
          expect(")");
        } else {
          const left = expression();
          take("&");
          expect("=");
          const right = expression();
          if (isMatrix(left)) {
            if (
              !isMatrix(right) ||
              left.rows.some((row) => row.length !== 1) ||
              right.rows.some((row) => row.length !== 1) ||
              left.rows.length !== right.rows.length
            )
              fail("A vector assignment needs matching column vectors.", at);
            left.rows.forEach((row, index) => {
              if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(row[0].text))
                fail("Vector outputs must be simple names.", at);
              generated.push(`${row[0].text} = ${right.rows[index][0].text}`);
            });
          } else {
            if (
              isMatrix(right) ||
              !/^[A-Za-z_][A-Za-z_0-9]*(?:\([A-Za-z_0-9,\s]*\))?$/.test(
                left.text,
              )
            )
              fail(
                "The left side must be a name, function signature, or column vector.",
                at,
              );
            generated.push(`${left.text} = ${right.text}`);
          }
        }
        while (peek().type === "tag") {
          const label = tokens[cursor++].value.replace(/[\r\n]+/g, " ");
          emit(`# ${label}`, at);
        }
        generated.forEach((line) => emit(line, at));
        if (!["row", "end", "endOfInput"].includes(peek().type))
          fail("Expected a LaTeX row separator after the equation.", peek().at);
        take("row");
      }
      if (environment) {
        const end = expect("end");
        if (end.value !== environment)
          fail("Equation environments do not match.", end.at);
      }
      expect("endOfInput");
      const result = lines.join("\n");
      try {
        programs.compile(result);
      } catch (error) {
        const mapping = mappings.find(
          (entry) => entry.generatedLine === error.line,
        );
        fail(`Converted program: ${error.message}`, mapping?.sourceOffset || 0);
      }
      return { source: result, mappings };
    }
    return { convert };
  }
  root.SurfaceLatex = { createImporter };
  if (typeof module !== "undefined" && module.exports)
    module.exports = root.SurfaceLatex;
})(typeof globalThis !== "undefined" ? globalThis : this);
