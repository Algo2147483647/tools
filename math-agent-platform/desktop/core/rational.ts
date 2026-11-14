// Exact bounded arithmetic. JSON boundaries use strings, never floating point.
const MAX_BITS = 4096;
function gcd(a: bigint, b: bigint) { a = a < 0n ? -a : a; while (b) {
    [a, b] = [b, a % b];
} return a; }
class Rational {
    n: bigint;
    d: bigint;
    constructor(n: bigint | number | string, d: bigint | number | string = 1n) {
        n = BigInt(n);
        d = BigInt(d);
        if (!d)
            throw Error('Division by zero.');
        if (d < 0n) {
            n = -n;
            d = -d;
        }
        if (n.toString(2).length > MAX_BITS || d.toString(2).length > MAX_BITS)
            throw Error('Arithmetic complexity limit exceeded.');
        const g = gcd(n, d);
        this.n = n / g;
        this.d = d / g;
    }
    static from(text: Rational | string | number | bigint) {
        if (text instanceof Rational)
            return text;
        const value = String(text);
        if (value.length > 300)
            throw Error('Number is too long.');
        if (/^-?\d+\/\d+$/.test(value)) {
            const [n, d] = value.split('/');
            return new Rational(n, d);
        }
        if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))
            throw Error('Invalid exact number.');
        const [whole, decimal = ''] = value.split('.');
        return new Rational(BigInt((whole === '-' ? '-0' : whole || '0') + decimal), 10n ** BigInt(decimal.length));
    }
    add(b: Rational) { return new Rational(this.n * b.d + b.n * this.d, this.d * b.d); }
    sub(b: Rational) { return new Rational(this.n * b.d - b.n * this.d, this.d * b.d); }
    mul(b: Rational) { return new Rational(this.n * b.n, this.d * b.d); }
    div(b: Rational) { return new Rational(this.n * b.d, this.d * b.n); }
    neg() { return new Rational(-this.n, this.d); }
    eq(b: Rational) { return this.n === b.n && this.d === b.d; }
    get zero() { return this.n === 0n; }
    toString() { return this.d === 1n ? String(this.n) : `${this.n}/${this.d}`; }
}
export { Rational };
