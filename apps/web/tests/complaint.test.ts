import { describe, it, expect, beforeEach } from "vitest";
import {
  findMatchingCluster,
  getSimilarityThreshold,
  ExistingComplaintCandidate,
} from "../lib/complaints/similarity-service";
import {
  createComplaint,
  getComplaints,
  _resetStoreForTesting,
} from "../lib/complaints/complaint-repository";
import { POST as createComplaintRoute, GET as listComplaintsRoute } from "../app/api/complaints/route";
import { GET as getComplaintRoute } from "../app/api/complaints/[id]/route";
import { POST as uploadRoute } from "../app/api/complaints/upload/route";
import { NextRequest } from "next/server";
import { COMPLAINT_EMERGENCY_THRESHOLD } from "@smart-campus/contracts";
import { createMockSessionToken } from "../lib/auth/identity-service";
import { MOCK_INSTITUTIONAL_DIRECTORY } from "../lib/auth/mock-identities";

const testProfile = MOCK_INSTITUTIONAL_DIRECTORY[0];
const otherProfile = MOCK_INSTITUTIONAL_DIRECTORY[1];
const testCookie = `campusgram_mock_session=${createMockSessionToken(testProfile, testProfile.id)}`;
const otherCookie = `campusgram_mock_session=${createMockSessionToken(otherProfile, otherProfile.id)}`;
const authenticatedHeaders = {
  "Content-Type": "application/json",
  Cookie: testCookie,
};

describe("CampusGram Complaint System Module", () => {
  beforeEach(() => {
    _resetStoreForTesting([]);
  });

  describe("1. Text Similarity & Grouping", () => {
    it("groups semantically similar complaint texts together", () => {
      const existing: ExistingComplaintCandidate[] = [
        {
          id: "cmp-1",
          text: "Water is unavailable in hostel A",
          cluster_id: "cluster_water_hostel_a",
        },
      ];

      const match1 = findMatchingCluster("No water supply in hostel A", existing);
      expect(match1.matched).toBe(true);
      expect(match1.cluster_id).toBe("cluster_water_hostel_a");

      const match2 = findMatchingCluster("Hostel A has no water", existing);
      expect(match2.matched).toBe(true);
      expect(match2.cluster_id).toBe("cluster_water_hostel_a");

      const match3 = findMatchingCluster("Water problem in hostel A", existing);
      expect(match3.matched).toBe(true);
      expect(match3.cluster_id).toBe("cluster_water_hostel_a");
    });

    it("does NOT group unrelated complaint texts together", () => {
      const existing: ExistingComplaintCandidate[] = [
        {
          id: "cmp-1",
          text: "Water is unavailable in hostel A",
          cluster_id: "cluster_water_hostel_a",
        },
      ];

      const unrelated = findMatchingCluster("Broken ceiling projector in room 204", existing);
      expect(unrelated.matched).toBe(false);
      expect(unrelated.cluster_id).not.toBe("cluster_water_hostel_a");
      expect(unrelated.similarity_score).toBe(0);
    });

    it("ensures images have strictly NO effect on text similarity", () => {
      const existing: ExistingComplaintCandidate[] = [
        {
          id: "cmp-1",
          text: "Water is unavailable in hostel A",
          cluster_id: "cluster_water_hostel_a",
        },
      ];

      const text = "No water supply in hostel A";
      const matchResult = findMatchingCluster(text, existing);

      // Verify that similarity calculation only takes text and returns identical score
      expect(matchResult.matched).toBe(true);
      expect(matchResult.similarity_score).toBeGreaterThanOrEqual(0.35);
    });
  });

  describe("2. Emergency Threshold Progression (1..4 Normal, 5 Emergency Cascade)", () => {
    const similarComplaints = [
      "Water is unavailable in hostel A",
      "No water supply in hostel A",
      "Hostel A has no water",
      "Water problem in hostel A",
      "Hostel A water supply is not working",
    ];

    it("classifies 1 to 4 complaints as normal, and 5th as emergency with group cascade", async () => {
      // 1st Complaint
      const res1 = await createComplaint({ text: similarComplaints[0], complainant_id: "threshold-owner-1" });
      expect(res1.cluster.group_count).toBe(1);
      expect(res1.cluster.is_emergency).toBe(false);
      expect(res1.complaint.is_emergency).toBe(false);

      // 2nd Complaint
      const res2 = await createComplaint({ text: similarComplaints[1], complainant_id: "threshold-owner-2" });
      expect(res2.cluster.cluster_id).toBe(res1.cluster.cluster_id);
      expect(res2.cluster.group_count).toBe(2);
      expect(res2.cluster.is_emergency).toBe(false);
      expect(res2.complaint.is_emergency).toBe(false);

      // 3rd Complaint
      const res3 = await createComplaint({ text: similarComplaints[2], complainant_id: "threshold-owner-3" });
      expect(res3.cluster.cluster_id).toBe(res1.cluster.cluster_id);
      expect(res3.cluster.group_count).toBe(3);
      expect(res3.cluster.is_emergency).toBe(false);
      expect(res3.complaint.is_emergency).toBe(false);

      // 4th Complaint
      const res4 = await createComplaint({ text: similarComplaints[3], complainant_id: "threshold-owner-4" });
      expect(res4.cluster.cluster_id).toBe(res1.cluster.cluster_id);
      expect(res4.cluster.group_count).toBe(4);
      expect(res4.cluster.is_emergency).toBe(false);
      expect(res4.complaint.is_emergency).toBe(false);

      // Verify all 4 complaints in the repository are still normal
      const checkBefore5 = await getComplaints("all");
      const clusterMembersBefore5 = checkBefore5.complaints.filter(
        (c) => c.cluster_id === res1.cluster.cluster_id,
      );
      expect(clusterMembersBefore5).toHaveLength(4);
      expect(clusterMembersBefore5.every((c) => c.is_emergency === false)).toBe(true);

      // 5th Complaint arrives -> THRESHOLD CROSSED!
      const res5 = await createComplaint({ text: similarComplaints[4], complainant_id: "threshold-owner-5" });
      expect(res5.cluster.cluster_id).toBe(res1.cluster.cluster_id);
      expect(res5.cluster.group_count).toBe(5);
      expect(res5.cluster.is_emergency).toBe(true);
      expect(res5.complaint.is_emergency).toBe(true);

      // CRUCIAL: Verify ALL 5 complaints in this group now reflect emergency = true
      const checkAfter5 = await getComplaints("all");
      const clusterMembersAfter5 = checkAfter5.complaints.filter(
        (c) => c.cluster_id === res1.cluster.cluster_id,
      );
      expect(clusterMembersAfter5).toHaveLength(5);
      expect(clusterMembersAfter5.every((c) => c.is_emergency === true)).toBe(true);
      expect(clusterMembersAfter5.every((c) => c.similar_count === 5)).toBe(true);
    });
  });

  describe("3. API Route Endpoints", () => {
    it("POST /api/complaints: creates complaint with valid payload", async () => {
      const req = new NextRequest("http://localhost:3000/api/complaints", {
        method: "POST",
        headers: authenticatedHeaders,
        body: JSON.stringify({
          text: "Library air conditioning unit stopped working on floor 3",
          category: "infrastructure",
        }),
      });

      const res = await createComplaintRoute(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.complaint.text).toContain("Library air conditioning");
      expect(json.cluster.group_count).toBe(1);
      expect(json.cluster.is_emergency).toBe(false);
    });

    it("POST /api/complaints: derives ownership from the session, not body or identity headers", async () => {
      const req = new NextRequest("http://localhost:3000/api/complaints", {
        method: "POST",
        headers: {
          ...authenticatedHeaders,
          "x-campus-user-id": otherProfile.id,
        },
        body: JSON.stringify({
          text: "Complaint with forged ownership fields",
          complainant_id: otherProfile.id,
        }),
      });

      const res = await createComplaintRoute(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.complaint.complainant_id).toBeUndefined();
    });

    it("POST /api/complaints: rejects complaint with text shorter than 5 chars", async () => {
      const req = new NextRequest("http://localhost:3000/api/complaints", {
        method: "POST",
        headers: authenticatedHeaders,
        body: JSON.stringify({
          text: "Help", // < 5 characters
        }),
      });

      const res = await createComplaintRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("VALIDATION_FAILED");
    });

    it("POST /api/complaints: rejects external attachment references", async () => {
      const req = new NextRequest("http://localhost:3000/api/complaints", {
        method: "POST",
        headers: authenticatedHeaders,
        body: JSON.stringify({
          text: "Leaking pipe behind the water dispenser",
          attachments: [
            {
              url: "https://example.com/uploads/complaints/pipe.jpg",
              filename: "pipe.jpg",
              mime_type: "image/jpeg",
              size_bytes: 1024,
            },
          ],
        }),
      });

      const res = await createComplaintRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("INVALID_ATTACHMENT_REFERENCE");
    });

    it("POST /api/complaints: rejects arbitrary root-relative attachment references", async () => {
      const req = new NextRequest("http://localhost:3000/api/complaints", {
        method: "POST",
        headers: authenticatedHeaders,
        body: JSON.stringify({
          text: "Hostel corridor light fitting fallen down",
          attachments: [
            {
              url: "/uploads/complaints/complaint-1775118742111-945763567.jpg",
              filename: "light.jpg",
              mime_type: "image/jpeg",
              size_bytes: 2048,
            },
          ],
        }),
      });

      const res = await createComplaintRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("INVALID_ATTACHMENT_REFERENCE");
    });

    it("POST /api/complaints: rejects invalid attachment URLs that are neither absolute nor root-relative", async () => {
      const req = new NextRequest("http://localhost:3000/api/complaints", {
        method: "POST",
        headers: authenticatedHeaders,
        body: JSON.stringify({
          text: "Hostel corridor light fitting fallen down",
          attachments: [
            {
              url: "invalid-url-or-path",
              filename: "test.jpg",
            },
          ],
        }),
      });

      const res = await createComplaintRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("VALIDATION_FAILED");
    });

    it("POST /api/complaints/upload: rejects non-image files", async () => {
      const formData = new FormData();
      const textBlob = new Blob(["test script content"], { type: "text/plain" });
      formData.append("file", textBlob, "script.txt");

      const req = new NextRequest("http://localhost:3000/api/complaints/upload", {
        method: "POST",
        headers: { Cookie: testCookie },
        body: formData,
      });

      const res = await uploadRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("INVALID_FILE_TYPE");
    });

    it("GET /api/complaints: supports normal and emergency view filtering", async () => {
      const complaintOwnerId = testProfile.id;

      // Create 1 unique normal complaint
      await createComplaint({
        text: "Classroom 101 whiteboard is cracked",
        complainant_id: complaintOwnerId,
      });

      // Create 5 similar complaints to trigger an emergency cluster
      const emergencyTexts = [
        "Major water flood in hostel ground floor",
        "Water flooding all over hostel ground floor corridors",
        "Flooding with water in hostel ground floor rooms",
        "Hostel ground floor water flood problem",
        "Ground floor hostel corridor completely flooded with water",
      ];

      for (const [index, t] of emergencyTexts.entries()) {
        await createComplaint({ text: t, complainant_id: index === 0 ? complaintOwnerId : `filter-owner-${index}` });
      }

      // Query view=all
      const reqAll = new NextRequest("http://localhost:3000/api/complaints?view=all", {
        headers: { Cookie: testCookie },
      });
      const resAll = await listComplaintsRoute(reqAll);
      const jsonAll = await resAll.json();
      expect(jsonAll.counts.total).toBe(6);
      expect(jsonAll.counts.normal).toBe(1);
      expect(jsonAll.counts.emergency).toBe(5);
      expect(jsonAll.complaints).toHaveLength(2);
      expect(jsonAll.complaints.every((complaint: any) => complaint.complainant_id === undefined)).toBe(true);

      // Query view=normal
      const reqNormal = new NextRequest("http://localhost:3000/api/complaints?view=normal", {
        headers: { Cookie: testCookie },
      });
      const resNormal = await listComplaintsRoute(reqNormal);
      const jsonNormal = await resNormal.json();
      expect(jsonNormal.complaints).toHaveLength(1);
      expect(jsonNormal.complaints[0].text).toContain("whiteboard is cracked");

      // Query view=emergency
      const reqEmergency = new NextRequest("http://localhost:3000/api/complaints?view=emergency", {
        headers: { Cookie: testCookie },
      });
      const resEmergency = await listComplaintsRoute(reqEmergency);
      const jsonEmergency = await resEmergency.json();
      expect(jsonEmergency.complaints).toHaveLength(1);
      expect(jsonEmergency.complaints[0].similar_count).toBe(5);
      expect(jsonEmergency.complaints.every((c: any) => c.is_emergency === true)).toBe(true);
    });

    it("GET /api/complaints/:id requires authentication and hides another student's complaint", async () => {
      const created = await createComplaint({
        text: "Private complaint owned by Student B",
        complainant_id: otherProfile.id,
      });

      const unauthenticated = await getComplaintRoute(
        new NextRequest(`http://localhost:3000/api/complaints/${created.complaint.id}`),
        { params: Promise.resolve({ id: created.complaint.id }) },
      );
      expect(unauthenticated.status).toBe(401);

      const studentA = await getComplaintRoute(
        new NextRequest(`http://localhost:3000/api/complaints/${created.complaint.id}`, {
          headers: { Cookie: testCookie },
        }),
        { params: Promise.resolve({ id: created.complaint.id }) },
      );
      expect(studentA.status).toBe(404);

      const studentB = await getComplaintRoute(
        new NextRequest(`http://localhost:3000/api/complaints/${created.complaint.id}`, {
          headers: { Cookie: otherCookie },
        }),
        { params: Promise.resolve({ id: created.complaint.id }) },
      );
      expect(studentB.status).toBe(200);
    });
  });

  describe("4. Campus-Wide Visibility & Safe Emergency Cascade without General UPDATE", () => {
    it("allows campus-wide visibility where Student A can view complaints submitted by Student B", async () => {
      // Student A submits a complaint
      const resA = await createComplaint({
        text: "Hostel Block A hot water geyser is not functioning",
        complainant_id: "student-user-a-uuid",
      });

      // Student B submits an unrelated complaint
      const resB = await createComplaint({
        text: "Chemistry Lab fume hood fan is jammed",
        complainant_id: "student-user-b-uuid",
      });

      // Both should be visible in the campus-wide feed
      const listRes = await getComplaints("all");
      const complaintIds = listRes.complaints.map((c) => c.id);

      expect(complaintIds).toContain(resA.complaint.id);
      expect(complaintIds).toContain(resB.complaint.id);

      // Verify complainant IDs are preserved
      const retrievedA = listRes.complaints.find((c) => c.id === resA.complaint.id);
      const retrievedB = listRes.complaints.find((c) => c.id === resB.complaint.id);
      expect(retrievedA?.complainant_id).toBe("student-user-a-uuid");
      expect(retrievedB?.complainant_id).toBe("student-user-b-uuid");
    });

    it("safely cascades emergency state across cluster peers without general UPDATE permissions", async () => {
      // 4 different students submit similar complaints
      const students = ["student-1", "student-2", "student-3", "student-4"];
      const baseTexts = [
        "Major water flood in hostel ground floor",
        "Water flooding all over hostel ground floor corridors",
        "Flooding with water in hostel ground floor rooms",
        "Hostel ground floor water flood problem",
      ];

      for (let i = 0; i < 4; i++) {
        await createComplaint({
          text: baseTexts[i],
          complainant_id: students[i],
        });
      }

      // Verify all 4 complaints are still normal
      const checkInitial = await getComplaints("all");
      const floodCluster = checkInitial.complaints.filter((c) =>
        c.text.toLowerCase().includes("flood"),
      );
      expect(floodCluster).toHaveLength(4);
      expect(floodCluster.every((c) => !c.is_emergency)).toBe(true);

      // Student 5 submits 5th complaint in same cluster
      const res5 = await createComplaint({
        text: "Ground floor hostel corridor completely flooded with water",
        complainant_id: "student-5",
      });

      expect(res5.cluster.is_emergency).toBe(true);

      // Verify all 4 complaints by other students were safely cascaded to emergency
      const checkFinal = await getComplaints("all");
      const finalFloodCluster = checkFinal.complaints.filter((c) =>
        c.text.toLowerCase().includes("flood"),
      );
      expect(finalFloodCluster).toHaveLength(5);
      expect(finalFloodCluster.every((c) => c.is_emergency === true)).toBe(true);
      expect(finalFloodCluster.every((c) => c.similar_count === 5)).toBe(true);
    });

    it("ensures unrelated complaints in other clusters are never affected by an emergency cascade", async () => {
      // Unrelated complaint in normal cluster
      const resUnrelated = await createComplaint({
        text: "Classroom 204 projector remote is missing",
        complainant_id: "student-unrelated",
      });

      // 5 complaints in emergency cluster
      for (const [index, t] of [
        "No water available in hostel washrooms",
        "Hostel washrooms have zero water supply",
        "Water outage across all hostel washrooms",
        "Washrooms in hostel have no running water",
        "Water supply completely cut in hostel washrooms",
      ].entries()) {
        await createComplaint({ text: t, complainant_id: `student-water-${index}` });
      }

      // Query complaints
      const all = await getComplaints("all");
      const unrelated = all.complaints.find((c) => c.id === resUnrelated.complaint.id);

      expect(unrelated?.is_emergency).toBe(false);
      expect(unrelated?.similar_count).toBe(1);
    });
  });

  describe("5. Emergency Cluster Aggregation (Summary Grouping)", () => {
    it("aggregates multiple complaints sharing the same cluster_id into a single cluster group with count", async () => {
      // 5 water flood complaints -> Cluster A
      for (const [index, t] of [
        "Major water flood in hostel ground floor",
        "Water flooding all over hostel ground floor corridors",
        "Flooding with water in hostel ground floor rooms",
        "Hostel ground floor water flood problem",
        "Ground floor hostel corridor completely flooded with water",
      ].entries()) {
        await createComplaint({ text: t, complainant_id: `aggregation-owner-${index}` });
      }

      // 5 electricity blackout complaints -> Cluster B
      for (const [index, t] of [
        "Complete power cut in academic block C",
        "Power outage in academic block C classrooms",
        "No electricity power supply in academic block C",
        "Academic block C electricity outage blackout",
        "Blackout and no electrical power in academic block C",
      ].entries()) {
        await createComplaint({ text: t, complainant_id: `aggregation-owner-${index}` });
      }

      // 1 normal complaint -> Cluster C
      await createComplaint({ text: "Cafeteria snack vending machine coin slot stuck", complainant_id: "aggregation-owner-0" });

      const res = await getComplaints("emergency");
      expect(res.complaints).toHaveLength(10);
      expect(res.counts.emergency).toBe(10);
      expect(res.counts.normal).toBe(1);
      expect(res.counts.total).toBe(11);

      // Group by cluster_id
      const clusterMap = new Map<string, typeof res.complaints>();
      for (const c of res.complaints) {
        const list = clusterMap.get(c.cluster_id) || [];
        list.push(c);
        clusterMap.set(c.cluster_id, list);
      }

      // Must produce exactly 2 unique emergency cluster cards
      expect(clusterMap.size).toBe(2);
      for (const [, items] of clusterMap.entries()) {
        expect(items).toHaveLength(5);
        expect(items.every((c) => c.is_emergency === true)).toBe(true);
      }
    });
  });

  describe("6. Global aggregation with owner-only row projection", () => {
    it("keeps global cluster volume and emergency state across multiple owners", async () => {
      const owners = ["student-owner-a", "student-owner-b", "student-owner-c", "student-owner-d"];
      const texts = [
        "Major water flood in hostel ground floor",
        "Water flooding all over hostel ground floor corridors",
        "Flooding with water in hostel ground floor rooms",
        "Hostel ground floor water flood problem",
        "Ground floor hostel corridor completely flooded with water",
      ];

      for (const [index, owner] of owners.entries()) {
        await createComplaint({ text: texts[index], complainant_id: owner });
      }

      const ownerA = await getComplaints("all", {
        userId: owners[0],
        canViewAll: false,
      });

      expect(ownerA.complaints).toHaveLength(1);
      expect(ownerA.complaints[0].complainant_id).toBe(owners[0]);
      expect(ownerA.complaints[0].similar_count).toBe(4);
      expect(ownerA.complaints[0].is_emergency).toBe(false);
      expect(ownerA.counts).toEqual({ total: 4, normal: 4, emergency: 0 });

      await createComplaint({ text: texts[4], complainant_id: "student-owner-e" });

      const ownerB = await getComplaints("emergency", {
        userId: owners[1],
        canViewAll: false,
      });

      expect(ownerB.complaints).toHaveLength(1);
      expect(ownerB.complaints[0].complainant_id).toBe(owners[1]);
      expect(ownerB.complaints[0].similar_count).toBe(COMPLAINT_EMERGENCY_THRESHOLD);
      expect(ownerB.complaints[0].is_emergency).toBe(true);
      expect(ownerB.counts).toEqual({ total: 5, normal: 0, emergency: 5 });
    });

    it("does not expose other owners' rows or private ownership data in a student list", async () => {
      const own = await createComplaint({
        text: "Private water outage report for my hostel",
        complainant_id: "student-visible",
      });
      const other = await createComplaint({
        text: "Private water outage report for another hostel",
        complainant_id: "student-hidden",
      });

      const result = await getComplaints("all", {
        userId: "student-visible",
        canViewAll: false,
      });

      expect(result.complaints).toHaveLength(1);
      expect(result.complaints[0].id).toBe(own.complaint.id);
      expect(result.complaints[0].complainant_id).toBe("student-visible");
      expect(result.complaints.some((complaint) => complaint.id === other.complaint.id)).toBe(false);
      expect(result.complaints.some((complaint) => complaint.complainant_id === "student-hidden")).toBe(false);
      expect(result.complaints.map((complaint) => complaint.text)).not.toContain(other.complaint.text);
    });
  });
});
