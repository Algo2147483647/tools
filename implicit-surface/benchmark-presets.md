# Ray benchmark additions

Source: the local Ray project, `experiment/geometric_object/geometry-benchmark-matrix/`.
The requested `geometric/_object` spelling was resolved to the existing
`geometric_object` directory. No source files in Ray were changed. This tool does
not load Ray files at runtime; the converted equations are bundled offline.

The library adds 24 entries. Existing sphere, torus, ellipsoid, saddle, paraboloid,
hyperboloid, L4 ball, L1 ball/octahedron, gyroid, and double-gyroid-like shell
presets already cover the corresponding shape classes. Repeated placeholder
spheres and material/placement variants are not duplicated.

## Added entries

| Source cell | Preset                          | Conversion                                                                            |
| ----------- | ------------------------------- | ------------------------------------------------------------------------------------- |
| r3-c6       | Cube; regular tetrahedron       | Maximum of face half-spaces; canonical orientation and size                           |
| r3-c4       | Regular dodecahedron            | Twelve exact golden-ratio face half-spaces                                            |
| r3-c5       | Regular icosahedron             | Twenty exact face half-spaces                                                         |
| r3-c1       | Triangular prism                | Equilateral triangular section, finite extrusion, two caps                            |
| r3-c7       | Stellated dodecahedron          | Union of the source mesh's core and twelve pentagonal pyramids                        |
| r6-c2       | Finite cone; finite cylinder    | Canonical finite solids including end caps                                            |
| r6-c7       | Catenoid                        | `x² + y² = 0.55² cosh²(z/0.55)`                                                       |
| r3-c3       | Astroidal surface               | `abs(x)^(2/3) + abs(y)^(2/3) + abs(z)^(2/3) = 1`                                      |
| r1-c1       | Barth sextic                    | Polynomial coefficients from `geo-r01.json`                                           |
| r1-c2       | Togliatti quintic               | Polynomial coefficients from `geo-r01.json`                                           |
| r1-c3       | Clebsch cubic                   | Polynomial coefficients from `geo-r01.json`                                           |
| r1-c5       | Chmutov octic                   | Polynomial coefficients from `geo-r01.json`                                           |
| r1-c7       | Kummer-type quartic             | The benchmark's particular cubic-symmetric quartic                                    |
| r2-c1       | Ding-Dong surface               | Polynomial coefficients from `geo-r02.json`                                           |
| r2-c4       | Roman surface                   | Polynomial coefficients from `geo-r02.json`                                           |
| r2-c5       | Tanglecube                      | Polynomial coefficients from `geo-r02.json`                                           |
| r2-c6       | Dupin cyclide                   | Actual local polynomial from `geo-r02.json`, rather than the schematic README formula |
| r4-c1       | Whitney umbrella                | Includes the source's local z offset                                                  |
| r4-c4       | Parabolic revolution            | `x² + y² = z⁴`                                                                        |
| r4-c6       | Dervish quintic                 | Its distinct polynomial from `geo-r04.json`                                           |
| r5-c2       | Spherical harmonics Y₃⁰ and Y₃² | Real, normalized radial surfaces `r = abs(Y)`; Y₃² uses the sine basis                |

Polynomial coefficients are copied numerically without material, translation,
rotation, or scale transforms. Domains are chosen for exploration and are
editable. Basic solids use convenient canonical dimensions rather than matrix-cell
dimensions. The stellated mesh's local vertices are uniformly divided by `0.085`;
its half-space coefficients are rounded to ten decimal places. Its preset is the
solid envelope of the benchmark's twelve pyramids, not an assertion about all
self-intersecting face conventions of the small stellated dodecahedron.

The regular dodecahedron is generated analytically; a contradictory description
of a "cube-like" shape in the source README is not used as its definition. The
Kummer-type entry preserves the benchmark polynomial without claiming a
particular count or arrangement of singularities.

The harmonic implicit forms follow the real normalization used by
`engine/controller/factory/parametric_spherical_harmonic.go`:

```text
(x²+y²+z²)^4 = 7/(16π) (5z³ − 3z(x²+y²+z²))²
(x²+y²+z²)^4 = 105/(4π) x²y²z²
```

## Objects not imported as new standard surfaces

- The finite disk and filled triangle in r6-c1 are planar patches, rather than
  closed 3D solids or unrestricted implicit surfaces.
- The trefoil in r5-c4 is a thickened parametric curve; importing it faithfully
  needs a curve/tube representation beyond this equation-based surface sampler.
- The r5-c6 Szilassi object is a vertex/edge skeleton made from spheres and
  cylinders, not a supplied set of polyhedron faces.
- The anisotropic spindle, artist-adjusted metaballs, and high-frequency ridged
  torus are custom benchmark constructions, not additional standard primitives.
- Scene groups, materials, relative placement, and repeated placeholder spheres
  are not imported.

All presets use the same finite-grid marching tetrahedra algorithm. Sharp tips,
singular curves, isolated real branches, and small features may be missed or
rounded by sampling. Use a finer custom grid or a smaller step/domain as needed;
the display is not a symbolic or topological certification of these surfaces.
