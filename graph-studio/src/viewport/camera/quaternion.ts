/** Unit quaternion, scalar last. Camera orientation never passes through Euler angles. */
export type Quaternion = [number, number, number, number];
export const IDENTITY_ORIENTATION: Quaternion = [0, 0, 0, 1];

export function normalizeOrientation(q: readonly number[]): Quaternion {
  const length = Math.hypot(...q);
  if (q.length !== 4 || !q.every(Number.isFinite) || length < 1e-12)
    throw new Error("Orientation must contain four finite numbers with a nonzero norm.");
  return q.map((v) => v / length) as Quaternion;
}

export function composeOrientation(a: Quaternion, b: Quaternion): Quaternion {
  const [x, y, z, w] = a,
    [u, v, t, s] = b;
  return normalizeOrientation([
    w * u + x * s + y * t - z * v,
    w * v - x * t + y * s + z * u,
    w * t + x * v - y * u + z * s,
    w * s - x * u - y * v - z * t,
  ]);
}

export function axisRotation(axis: readonly number[], degrees: number): Quaternion {
  const length = Math.hypot(...axis);
  if (axis.length !== 3 || !axis.every(Number.isFinite) || !Number.isFinite(degrees) || length < 1e-12)
    throw new Error("Rotation requires a finite angle and a nonzero three-dimensional axis.");
  const half = (degrees * Math.PI) / 360,
    scale = Math.sin(half) / length;
  return [axis[0] * scale, axis[1] * scale, axis[2] * scale, Math.cos(half)];
}

export function rotatePoint([x, y, z]: readonly number[], [qx, qy, qz, qw]: Quaternion): [number, number, number] {
  const tx = 2 * (qy * z - qz * y),
    ty = 2 * (qz * x - qx * z),
    tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + qy * tz - qz * ty, y + qw * ty + qz * tx - qx * tz, z + qw * tz + qx * ty - qy * tx];
}

/** Virtual trackball: the outer hyperbolic sheet keeps edge drags continuous. */
export function trackballRotation(from: [number, number], to: [number, number]): Quaternion {
  const point = ([x, y]: [number, number]) => {
    const d = x * x + y * y;
    const z = d <= 0.5 ? Math.sqrt(1 - d) : 0.5 / Math.sqrt(d);
    const norm = Math.hypot(x, y, z);
    return [x / norm, y / norm, z / norm];
  };
  const [x, y, z] = point(from),
    [u, v, w] = point(to);
  return normalizeOrientation([y * w - z * v, z * u - x * w, x * v - y * u, 1 + x * u + y * v + z * w]);
}
