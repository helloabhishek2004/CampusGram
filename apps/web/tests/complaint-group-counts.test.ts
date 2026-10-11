import { describe, expect, it } from "vitest";
import { complaintGroupCounts } from "../lib/complaints/group-counts";

describe("complaint group display counts", () => {
  it("shows global emergency volume without expanding an owner's one permitted row", () => {
    const permittedRows = [{ similar_count: 5 }];

    expect(complaintGroupCounts(permittedRows)).toEqual({ globalCount: 5, visibleCount: 1 });
    expect(permittedRows).toEqual([{ similar_count: 5 }]);
  });

  it("shows all five permitted rows for staff with the same global volume", () => {
    const permittedRows = Array.from({ length: 5 }, () => ({ similar_count: 5 }));

    expect(complaintGroupCounts(permittedRows)).toEqual({ globalCount: 5, visibleCount: 5 });
  });
});
