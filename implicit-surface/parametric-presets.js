(function (root) {
  "use strict";
  const flower = `parameter r = [0, 1]
parameter theta = [4*pi, 24*pi]

# Petal edge and fine detail
edge(theta) = 1 - 0.5*(1 - mod(3.6*theta, 2*pi)/pi)^4 + disturb(theta)
disturb(theta) = sin(15*theta)/150

# Profile and inclination
f_2(r) = 2*(r^2 - r)^2
alpha(theta) = pi/2 * exp(-theta/(8*pi))
h(r, theta) = f_2(r)*sin(alpha(theta))

R = r*sin(alpha(theta)) + h(r, theta)*cos(alpha(theta))
H = r*cos(alpha(theta)) - h(r, theta)*sin(alpha(theta))

X = edge(theta)*R*cos(theta)
Y = edge(theta)*R*sin(theta)
Z = edge(theta)*H`;
  const flowerLatex = String.raw`\begin{align*}
(r, \theta) &\in ([0, 1], [4\pi, 24\pi]) \tag{Parameter domain}\\
edge(\theta) &= 1-\frac{1}{2}\left(1-\frac{\mod(3.6\theta, 2\pi)}{\pi}\right)^4 + disturb(\theta) \tag{Petal edge}\\
disturb(\theta) &= \frac{\sin(15\theta)}{150} \tag{Edge detail}\\
f_2(r) &= 2(r^2-r)^2 \tag{Petal profile}\\
\alpha(\theta) &= \frac{\pi}{2}e^{-\frac{\theta}{8\pi}} \tag{Inclination}\\
h(r,\theta) &= f_2(r)\sin(\alpha(\theta)) \tag{Profile decay}\\
\left(\begin{matrix}R\\H\end{matrix}\right) &= \left(\begin{matrix}\sin\alpha(\theta) & \cos\alpha(\theta)\\\cos\alpha(\theta) & -\sin\alpha(\theta)\end{matrix}\right)\left(\begin{matrix}r\\h(r,\theta)\end{matrix}\right) \tag{Coordinate transform}\\
\left(\begin{matrix}X\\Y\\Z\end{matrix}\right) &= \left(\begin{matrix}edge(\theta)R\cos\theta\\edge(\theta)R\sin\theta\\edge(\theta)H\end{matrix}\right) \tag{Cartesian coordinates}
\end{align*}`;
  const presets = [
    {
      id: "parametric-flower",
      name: "Parametric flower",
      type: "Layered petals with a detailed edge",
      program: flower,
      counts: [64, 2048],
    },
    {
      id: "parametric-plane",
      name: "Parametric plane",
      type: "A flat patch with zero Z extent",
      program:
        "parameter u = [-2, 2]\nparameter v = [-2, 2]\nX = u\nY = v\nZ = 0",
      counts: [32, 32],
    },
    {
      id: "parametric-sphere",
      name: "Parametric sphere",
      type: "Periodic longitude and collapsed poles",
      program:
        "parameter u = [0, 2*pi]\nparameter v = [0, pi]\nX = 2*sin(v)*cos(u)\nY = 2*sin(v)*sin(u)\nZ = 2*cos(v)",
      counts: [128, 64],
      boundaries: ["periodic", "open"],
    },
    {
      id: "parametric-torus",
      name: "Parametric torus",
      type: "Two periodic parameter directions",
      program:
        "parameter u = [0, 2*pi]\nparameter v = [0, 2*pi]\nX = (2 + 0.6*cos(v))*cos(u)\nY = (2 + 0.6*cos(v))*sin(u)\nZ = 0.6*sin(v)",
      counts: [128, 64],
      boundaries: ["periodic", "periodic"],
    },
    {
      id: "parametric-helicoid",
      name: "Helicoid",
      type: "An open spiral surface",
      program:
        "parameter r = [-2, 2]\nparameter theta = [-2*pi, 2*pi]\nX = r*cos(theta)\nY = r*sin(theta)\nZ = theta/3",
      counts: [64, 192],
    },
    {
      id: "parametric-catenoid",
      name: "Catenoid",
      type: "A curved profile revolved around Z",
      program:
        "parameter u = [0, 2*pi]\nparameter v = [-1.5, 1.5]\nX = cosh(v)*cos(u)\nY = cosh(v)*sin(u)\nZ = v",
      counts: [128, 64],
      boundaries: ["periodic", "open"],
    },
  ].map((preset) => ({
    ...preset,
    kind: "parametric-surface",
    group: "Parametric",
    expression: preset.program,
  }));
  root.SurfaceParametricPresets = { presets, flower, flowerLatex };
  if (typeof module !== "undefined" && module.exports)
    module.exports = root.SurfaceParametricPresets;
})(typeof globalThis !== "undefined" ? globalThis : this);
