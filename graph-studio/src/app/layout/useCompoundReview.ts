import { useMemo, useRef, useState } from "react";
import type { LayoutFeedback } from "../../layout/compound/feedback";
import { type LayoutIntent, type LayoutProblem, type LayoutSolveResult } from "../../layout/compound/layout-plan";
import { applyLayoutSnapshot } from "../../layout/compound/layout-stage";
import type { StageData } from "../../layout/shared/types";

export interface LayoutReview {
  key: string;
  intent: LayoutIntent;
  problem: LayoutProblem;
  stage: StageData;
  result: LayoutSolveResult;
  status: "ready" | "applied" | "dismissed";
}
export function useCompoundReview(key: string, ready: boolean) {
  const [review, setReview] = useState<LayoutReview | null>(null);
  const [selected, setSelected] = useState(0);
  const [showCandidate, setShowCandidate] = useState(false);
  const feedbackRef = useRef<LayoutFeedback | null>(null);
  const reviewRef = useRef(review);
  reviewRef.current = review;

  const stale = !!review && review.status === "ready" && (review.key !== key || !ready);
  const candidate = review?.result.candidates[selected];
  const previewStage = useMemo(
    () =>
      review && candidate && showCandidate && !stale && review.status === "ready"
        ? applyLayoutSnapshot(review.stage, candidate.snapshot)
        : null,
    [review, candidate, showCandidate, stale],
  );

  return {
    review,
    setReview,
    selected,
    setSelected,
    showCandidate,
    setShowCandidate,
    feedbackRef,
    reviewRef,
    stale,
    candidate,
    previewStage,
  };
}
