"""Shared numerical policy. Requested accuracy is never an achieved error bound."""
from dataclasses import dataclass, asdict
import math
from .common import ToolError


@dataclass(frozen=True)
class PrecisionPolicy:
    mode: str = 'standard'
    absoluteTolerance: float = 1e-8
    relativeTolerance: float = 1e-8
    workingDigits: int = 15
    maxDigits: int = 15
    maxIterations: int = 200
    certificationRequired: bool = False

    @classmethod
    def from_arguments(cls, args, default=1e-8):
        if 'precision' in args and 'tolerance' in args:
            raise ToolError('INVALID_ARGUMENT', 'Use precision or legacy tolerance, not both.')
        tol = args.get('tolerance', default)
        values = dict(absoluteTolerance=tol, relativeTolerance=tol)
        values.update(args.get('precision', {}))
        policy = cls(**values)
        if policy.maxDigits < policy.workingDigits:
            raise ToolError('INVALID_ARGUMENT', 'maxDigits must be at least workingDigits.')
        if policy.mode != 'standard' or policy.certificationRequired or policy.workingDigits > 15:
            raise ToolError('UNSUPPORTED_PRECISION', 'This backend supports binary64 only; high precision and certification are unavailable.')
        return policy

    def threshold(self, scale):
        return self.absoluteTolerance + self.relativeTolerance * abs(float(scale))

    def check(self, name, observed, scale, evidence='numerical_residual'):
        threshold = self.threshold(scale)
        finite = math.isfinite(float(observed)) and math.isfinite(threshold)
        return dict(name=name, passed=bool(finite and observed <= threshold),
                    status=('passed' if observed <= threshold else 'failed') if finite else 'unknown',
                    observed=float(observed) if math.isfinite(float(observed)) else None,
                    threshold=threshold if math.isfinite(threshold) else None,
                    scale=float(scale) if math.isfinite(float(scale)) else None,
                    normalizedResidual=float(observed/scale) if finite and scale else float(observed) if finite else None,
                    evidence=evidence)

    def diagnostics(self):
        return dict(requested=asdict(self), arithmetic='binary64', achievedDigits=None,
                    errorBoundKind='none', certified=False)


def check_status(checks):
    if any(c['status'] == 'failed' for c in checks): return 'failed'
    if any(c['status'] == 'unknown' for c in checks): return 'unknown'
    return 'passed' if checks else 'not_checked'
