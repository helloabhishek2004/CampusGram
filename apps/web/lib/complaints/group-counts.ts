import type { ComplaintRecord } from "@smart-campus/contracts";

/** Global volume is server-provided; permitted rows only determine inspection size. */
export function complaintGroupCounts(items: readonly Pick<ComplaintRecord, "similar_count">[]) {
  return {
    globalCount: items.reduce((count, item) => Math.max(count, item.similar_count), 0),
    visibleCount: items.length,
  };
}
