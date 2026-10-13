import { createApplicationClient } from "../supabase/server";
import { readDb, writeDb, canTransition, validateClaimAnswers, isClaimReviewable, ClaimWorkflowError } from "@smart-campus/lost-and-found";
import { ClaimSchema, HandoverModeSchema, type LostFoundItemStatus } from "@smart-campus/contracts";

type ItemRow = Record<string, any>;
type ImageRow = Record<string, any>;
type MatchRow = Record<string, any>;
type LoadedClaim = { claim: Record<string, any>; item?: ItemRow; lost?: ItemRow; match?: MatchRow; db?: ReturnType<typeof readDb> };
const activeClaimStatuses = ["pending", "questions_pending", "approved", "handover"];

const configured = () => Boolean(
  process.env.CAMPUSGRAM_DEMO_MODE !== "true" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder") &&
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes("placeholder"),
);

const mock = () =>
  process.env.CAMPUSGRAM_DEMO_MODE === "true" ||
  process.env.NODE_ENV === "test" ||
  (!configured() && process.env.AUTH_MODE === "mock");

function assertMode() {
  if (!configured() && !mock()) {
    throw new Error("Lost & Found persistence requires Supabase configuration (or AUTH_MODE=mock).");
  }
}

function publicItem(item: ItemRow, images: ImageRow[] = []) {
  return {
    id: item.id, type: item.type, category: item.category, subcategory: item.subcategory ?? null,
    title: item.title, public_description: item.public_description,
    location_id: item.location_id ?? null, location_description: item.location_description ?? null,
    event_date: item.event_date, status: item.status, is_sensitive: Boolean(item.is_sensitive),
    created_at: item.created_at, updated_at: item.updated_at ?? item.created_at,
    images: images.filter((image) => !image.is_sensitive).map(({ storage_path: _storage, ...safe }) => safe),
  };
}

async function supabase() {
  assertMode();
  return createApplicationClient();
}

function checked<T extends { error: any; data: any }>(result: T, operation: string): NonNullable<T["data"]> {
  if (result.error) throw new Error(`Lost & Found ${operation} failed: ${result.error.message}`);
  return result.data as NonNullable<T["data"]>;
}

function mockRows() {
  const db = readDb();
  db.lost_found_items ??= [];
  db.lost_found_item_images ??= [];
  db.lost_found_matches ??= [];
  db.lost_found_claims ??= [];
  db.lost_found_item_events ??= [];
  return db;
}

function getMockClaim(id: string): LoadedClaim | null {
  const db = mockRows();
  const claim = db.lost_found_claims.find((c: any) => c.id === id);
  const item = claim && db.lost_found_items.find((i: any) => i.id === claim.item_id);
  const match = claim && db.lost_found_matches.find((m: any) => m.id === claim.match_id);
  const lost = match && db.lost_found_items.find((i: any) => i.id === match.lost_item_id);
  return claim ? { claim, item: item && { ...item, lost_found_item_images: db.lost_found_item_images.filter((i: any) => i.item_id === item.id) }, lost, db, match } : null;
}

export async function getClaim(id: string): Promise<LoadedClaim | null> {
  if (mock()) return getMockClaim(id);
  const client = await supabase();
  const result = await client.from("lost_found_claims").select("*, item:lost_found_items!item_id(*, lost_found_item_images(*)), match:lost_found_matches(*, lost:lost_found_items!lost_item_id(*), found:lost_found_items!found_item_id(reporter_id))").eq("id", id).maybeSingle();
  const claim = checked(result, "claim read") as any;
  if (!claim) return null;
  claim.finder_id = claim.item?.reporter_id;
  return { claim, item: claim.item, lost: claim.match?.lost, match: claim.match };
}

export async function getActiveClaimForMatch(matchId: string) {
  if (mock()) return mockRows().lost_found_claims.find((c: any) => c.match_id === matchId && activeClaimStatuses.includes(c.status)) ?? null;
  const client = await supabase();
  const rows = checked(await client.from("lost_found_claims").select("id,item_id,match_id,claimant_id,status")
    .eq("match_id", matchId).in("status", activeClaimStatuses).order("created_at", { ascending: false }).limit(1), "active claim read") as ItemRow[];
  return rows[0] ?? null;
}

/** Called only for an item reporter or an authorized operator; returns no identities/evidence. */
export async function getItemClaimSummaries(item: ItemRow, viewerId: string) {
  let claims: ItemRow[];
  if (mock()) {
    const db = mockRows();
    const matchIds = db.lost_found_matches.filter((m: any) => m.lost_item_id === item.id).map((m: any) => m.id);
    claims = db.lost_found_claims.filter((c: any) => item.type === "found" ? c.item_id === item.id : matchIds.includes(c.match_id));
  } else {
    const client = await supabase();
    let query = client.from("lost_found_claims").select("id,item_id,match_id,status,created_at,claimant_id");
    if (item.type === "found") query = query.eq("item_id", item.id);
    else {
      const matches = checked(await client.from("lost_found_matches").select("id").eq("lost_item_id", item.id), "claim discovery matches") as MatchRow[];
      if (!matches.length) return [];
      query = query.in("match_id", matches.map((m) => m.id));
    }
    if (item.type === "lost" && item.reporter_id === viewerId) query = query.eq("claimant_id", viewerId);
    claims = checked(await query.order("created_at", { ascending: false }), "item claim discovery") as ItemRow[];
  }
  if (item.type === "lost" && item.reporter_id === viewerId) claims = claims.filter((c) => c.claimant_id === viewerId);
  return claims.map(({ id, item_id, match_id, status, created_at }) => ({ id, item_id, match_id, status, created_at }));
}

function requireTransition(item: ItemRow | undefined, next: LostFoundItemStatus) {
  if (!item || !canTransition(item.status, next)) throw new ClaimWorkflowError(`Item cannot transition from '${item?.status ?? "missing"}' to '${next}'`, 409);
}

function linkedClaimItems(current: LoadedClaim): ItemRow[] {
  if (!current.item || (current.claim.match_id && (!current.match || !current.lost || current.match.found_item_id !== current.item.id))) {
    throw new ClaimWorkflowError("The linked claim items are unavailable or inconsistent", 409);
  }
  return current.lost ? [current.lost, current.item] : [current.item];
}

function mockItemTransition(db: any, item: ItemRow, next: LostFoundItemStatus, actorId: string, event: string, details: ItemRow, timestamp: string) {
  const row = db.lost_found_items.find((i: ItemRow) => i.id === item.id);
  row.status = next;
  row.updated_at = timestamp;
  db.lost_found_item_events.push({ id: crypto.randomUUID(), item_id: item.id, actor_id: actorId, event_type: event, details, created_at: timestamp });
}

async function persistedItemTransition(client: Awaited<ReturnType<typeof supabase>>, item: ItemRow, next: LostFoundItemStatus, actorId: string, event: string, details: ItemRow, timestamp: string) {
  const updated = checked(await client.from("lost_found_items").update({ status: next, updated_at: timestamp })
    .eq("id", item.id).eq("status", item.status).select("id,status").maybeSingle(), "claim item transition");
  if (!updated) throw new ClaimWorkflowError("A linked item changed or its update was not authorized", 409);
  checked(await client.from("lost_found_item_events").insert({ item_id: item.id, event_type: event, actor_id: actorId, details }), "claim item event");
}

function assertClaimCreation(match: MatchRow, claimantId: string) {
  if (match.lost.reporter_id !== claimantId || match.found.reporter_id === claimantId) throw new ClaimWorkflowError("Only the lost-item reporter can claim an item found by another person", 403);
  if (match.is_dismissed) throw new ClaimWorkflowError("Dismissed matches cannot be claimed", 409);
  if (match.lost.type !== "lost" || match.found.type !== "found") throw new ClaimWorkflowError("The match does not link a lost and found item", 409);
  if (match.lost.status !== "open" || match.found.status !== "open") throw new ClaimWorkflowError("Both matched items must be open before a claim can be created", 409);
  requireTransition(match.lost, "in_claim");
  requireTransition(match.found, "in_claim");
}

export async function createClaim(input: { matchId: string; claimantId: string; claimText: string }) {
  const text = ClaimSchema.shape.claim_text.safeParse(input.claimText.trim());
  if (!text.success) throw new ClaimWorkflowError("Describe your ownership claim using at least five characters", 400);
  if (mock()) {
    const db = mockRows(); const match = db.lost_found_matches.find((m: any) => m.id === input.matchId);
    if (!match) return null;
    const lost = db.lost_found_items.find((i: any) => i.id === match.lost_item_id); const found = db.lost_found_items.find((i: any) => i.id === match.found_item_id);
    if (!lost || !found) return null;
    if (db.lost_found_claims.some((c: any) => c.match_id === input.matchId && activeClaimStatuses.includes(c.status))) throw new ClaimWorkflowError("A claim already exists for this match", 409);
    assertClaimCreation({ ...match, lost, found }, input.claimantId);
    const timestamp = new Date().toISOString();
    const claim = { id: crypto.randomUUID(), item_id: found.id, claimant_id: input.claimantId, finder_id: found.reporter_id, match_id: input.matchId, status: "pending", claim_text: text.data, verification_answers: [], handover_mode: "campus_security", created_at: timestamp, updated_at: timestamp };
    db.lost_found_claims.push(claim);
    for (const item of [lost, found]) mockItemTransition(db, item, "in_claim", input.claimantId, "claim_created", { claim_id: claim.id }, timestamp);
    writeDb(db); return claim;
  }
  const client = await supabase();
  const match = checked(await client.from("lost_found_matches").select("*, lost:lost_found_items!lost_item_id(*), found:lost_found_items!found_item_id(*)").eq("id", input.matchId).maybeSingle(), "match read") as any;
  if (!match?.lost || !match?.found) return null;
  assertClaimCreation(match, input.claimantId);
  const existing = checked(await client.from("lost_found_claims").select("id").eq("match_id", input.matchId).in("status", activeClaimStatuses).limit(1), "claim duplicate check") as any[];
  if (existing.length) throw new ClaimWorkflowError("A claim already exists for this match", 409);
  const claim = checked(await client.from("lost_found_claims").insert({ item_id: match.found.id, claimant_id: input.claimantId, match_id: input.matchId, status: "pending", claim_text: text.data, handover_mode: "campus_security" }).select().single(), "claim insert") as any;
  if (!claim) throw new ClaimWorkflowError("Claim creation did not persist a record", 409);
  for (const item of [match.lost, match.found]) {
    await persistedItemTransition(client, item, "in_claim", input.claimantId, "claim_created", { claim_id: claim.id }, new Date().toISOString());
  }
  return { ...claim, finder_id: match.found.reporter_id };
}

export async function saveClaimAnswers(id: string, claimantId: string, answers: unknown) {
  const current = mock() ? getMockClaim(id) : await getClaim(id);
  if (!current) return null;
  const claim = current.claim as any;
  if (claim.claimant_id !== claimantId) throw new ClaimWorkflowError("Only the claimant can submit verification answers", 403);
  if (!isClaimReviewable(claim.status) || current.item?.status !== "in_claim") {
    throw new ClaimWorkflowError("Verification answers can only be changed while the claim is awaiting review", 409);
  }
  const validation = validateClaimAnswers(answers);
  if (!validation.isValid) throw new ClaimWorkflowError(validation.errors.join(" "), 400);
  const updatedAt = new Date().toISOString();
  if ("db" in current) {
    claim.verification_answers = validation.data;
    claim.updated_at = updatedAt;
    writeDb(current.db);
    return claim;
  }
  const client = await supabase();
  const updated = checked(await client.from("lost_found_claims")
    .update({ verification_answers: validation.data, updated_at: updatedAt })
    .eq("id", id).eq("claimant_id", claimantId).eq("status", claim.status)
    .select().maybeSingle(), "verification answer update");
  if (!updated) throw new ClaimWorkflowError("Claim changed while answers were being saved", 409);
  return updated;
}

export async function decideClaim(id: string, actorId: string, decision: "approved" | "rejected", notes?: string) {
  const current = mock() ? getMockClaim(id) : await getClaim(id);
  if (!current) return null;
  const c = current.claim as any;
  if (c.claimant_id === actorId) throw new ClaimWorkflowError("Claimants cannot decide their own claim", 403);
  if (!isClaimReviewable(c.status)) throw new ClaimWorkflowError(`Claim is already ${c.status}`, 409);
  if (decision === "approved") {
    const validation = validateClaimAnswers(c.verification_answers);
    if (!validation.isValid) throw new ClaimWorkflowError(validation.errors.join(" "), 409);
  }
  const items = linkedClaimItems(current); const next = decision === "approved" ? "handover" : "open";
  for (const item of items) {
    if (item.status !== "in_claim") throw new ClaimWorkflowError("Both claim items must be awaiting review", 409);
    requireTransition(item, next);
  }
  const timestamp = new Date().toISOString();
  const update = { status: decision, decision_notes: notes ?? null, decided_by: actorId, decided_at: timestamp, updated_at: timestamp };
  if ("db" in current) {
    Object.assign(c, update);
    for (const item of items) mockItemTransition(current.db, item, next, actorId, `claim_${decision}`, { claim_id: id, notes: notes ?? null }, timestamp);
    writeDb(current.db);
    return c;
  }
  const client = await supabase();
  let query = client.from("lost_found_claims").update(update).eq("id", id).eq("status", c.status);
  // Do not approve different evidence if answers change after the validation read.
  if (decision === "approved") query = query.eq("verification_answers", JSON.stringify(c.verification_answers));
  const claim = checked(await query.select().maybeSingle(), "claim decision update");
  if (!claim) throw new ClaimWorkflowError("Claim or verification answers changed while the decision was being recorded", 409);
  for (const item of items) await persistedItemTransition(client, item, next, actorId, `claim_${decision}`, { claim_id: id, notes: notes ?? null }, timestamp);
  return claim;
}

export async function handoverClaim(id: string, actorId: string, mode: string) {
  const current = mock() ? getMockClaim(id) : await getClaim(id);
  if (!current) return null;
  const claim = current.claim;
  if (claim.claimant_id !== actorId) throw new ClaimWorkflowError("Only the claimant can confirm handover", 403);
  if (claim.status !== "approved") throw new ClaimWorkflowError("Claim must be approved before handover and cannot be completed twice", 409);
  const validation = HandoverModeSchema.safeParse(mode);
  if (!validation.success) throw new ClaimWorkflowError("Select a valid handover mode", 400);
  const items = linkedClaimItems(current);
  for (const item of items) requireTransition(item, "resolved");
  const timestamp = new Date().toISOString();
  const update = { status: "handover", handover_mode: validation.data, updated_at: timestamp };
  if ("db" in current) {
    Object.assign(claim, update);
    for (const item of items) mockItemTransition(current.db, item, "resolved", actorId, "handover_completed", { claim_id: id, mode: validation.data }, timestamp);
    writeDb(current.db);
    return claim;
  }
  const client = await supabase();
  const updated = checked(await client.from("lost_found_claims").update(update).eq("id", id).eq("claimant_id", actorId)
    .eq("status", "approved").select().maybeSingle(), "handover update");
  if (!updated) throw new ClaimWorkflowError("Claim changed or handover was already recorded", 409);
  for (const item of items) await persistedItemTransition(client, item, "resolved", actorId, "handover_completed", { claim_id: id, mode: validation.data }, timestamp);
  return updated;
}

export async function updateItemStatus(id: string, actorId: string, next: string) {
  if (mock()) { const db = mockRows(); const i = db.lost_found_items.find((x: any) => x.id === id); if (!i) return null; if (!canTransition(i.status, next as any)) throw new Error(`Illegal state transition from '${i.status}' to '${next}'`); i.status = next; db.lost_found_item_events.push({ id: crypto.randomUUID(), item_id: id, event_type: "status_changed", actor_id: actorId, details: { nextStatus: next }, created_at: new Date().toISOString() }); writeDb(db); return i; }
  const client = await supabase(); const i = checked(await client.from("lost_found_items").select("id,status").eq("id", id).maybeSingle(), "item read") as any; if (!i) return null; if (!canTransition(i.status, next as any)) throw new Error(`Illegal state transition from '${i.status}' to '${next}'`); const updated = checked(await client.from("lost_found_items").update({ status: next, updated_at: new Date().toISOString() }).eq("id", id).eq("status", i.status).select("id,status").maybeSingle(), "item status update"); if (!updated) throw new Error("Item status changed concurrently"); checked(await client.from("lost_found_item_events").insert({ item_id: id, event_type: "status_changed", actor_id: actorId, details: { previousStatus: i.status, nextStatus: next } }), "status event insert"); return updated;
}

export async function dismissMatch(id: string, actorId: string) {
  if (mock()) { const db = mockRows(); const m = db.lost_found_matches.find((x: any) => x.id === id); if (!m) return null; m.is_dismissed = true; m.dismissed_at = new Date().toISOString(); m.dismissed_by = actorId; writeDb(db); return m; }
  const client = await supabase(); return checked(await client.from("lost_found_matches").update({ is_dismissed: true, dismissed_by: actorId }).eq("id", id).eq("is_dismissed", false).select().maybeSingle(), "match dismissal");
}

export async function revealContact(id: string, actorId: string) {
  const current = await getClaim(id); if (!current) return null; const c = current.claim as any; const party = c.claimant_id === actorId ? (c.finder_id ?? (current.match as any)?.found_item_id) : c.claimant_id;
  if (mock()) { const db = mockRows(); db.lost_found_contact_reveals.push({ id: crypto.randomUUID(), claim_id: id, revealed_to: actorId, revealed_party_id: party, reason: "Handover facilitation", expires_at: c.contact_window_expires_at ?? new Date(Date.now() + 86400000).toISOString(), created_at: new Date().toISOString() }); writeDb(db); return true; }
  const client = await supabase(); checked(await client.from("lost_found_contact_reveals").insert({ claim_id: id, revealed_to: actorId, revealed_party_id: party, reason: "Handover facilitation", expires_at: new Date(Date.now() + 86400000).toISOString() }), "contact reveal"); return true;
}

export async function listLogs() {
  if (mock()) { const db = mockRows(); return [...(db.lost_found_contact_reveals ?? []).map((r: any) => ({ id: r.id, type: "contact_reveal", created_at: r.created_at, action: `Contact Info Revealed: ${r.reason}`, actor_id: `Authorized By: ${r.revealed_to}` })), ...(db.lost_found_item_events ?? []).map((e: any) => ({ id: e.id, type: "item_event", created_at: e.created_at, action: `Item ${e.event_type.toUpperCase()}`, actor_id: `Actor: ${e.actor_id}` }))].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)); }
  const client = await supabase(); const [events, reveals, claims] = await Promise.all([client.from("lost_found_item_events").select("*"), client.from("lost_found_contact_reveals").select("*"), client.from("lost_found_claims").select("id,match_id,claimant_id,created_at")]); const rows = [...checked(events, "event logs"), ...checked(reveals, "reveal logs"), ...checked(claims, "claim logs")].map((r: any) => ({ id: r.id, type: r.event_type ? "item_event" : r.claim_id ? "contact_reveal" : "claim", created_at: r.created_at, action: r.event_type ? `Item ${r.event_type.toUpperCase()}` : r.claim_id ? `Contact Info Revealed: ${r.reason}` : `Claim filed for match ${r.match_id}`, actor_id: r.actor_id ?? r.revealed_to ?? r.claimant_id })); return rows.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
}

export async function listItems(filters: {
  type?: string | null; category?: string | null; status?: string | null; q?: string | null;
  page?: number; limit?: number; reporterId?: string;
}) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  if (mock()) {
    const db = mockRows();
    let rows = [...db.lost_found_items];
    if (filters.reporterId) rows = rows.filter((r: ItemRow) => r.reporter_id === filters.reporterId);
    rows = filters.status && filters.status !== "all" ? rows.filter((r: ItemRow) => r.status === filters.status) :
      !filters.status ? rows.filter((r: ItemRow) => r.status === "open" || r.status === "processing") : rows;
    if (filters.type) rows = rows.filter((r: ItemRow) => r.type === filters.type);
    if (filters.category) rows = rows.filter((r: ItemRow) => r.category === filters.category);
    if (filters.q) { const q = filters.q.toLowerCase(); rows = rows.filter((r: ItemRow) => `${r.title} ${r.public_description} ${r.location_description ?? ""}`.toLowerCase().includes(q)); }
    rows.sort((a: ItemRow, b: ItemRow) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const total = rows.length;
    rows = rows.slice((page - 1) * limit, page * limit);
    return { items: rows.map((r: ItemRow) => publicItem(r, db.lost_found_item_images.filter((i: ImageRow) => i.item_id === r.id))), total, page, limit };
  }
  const client = await supabase();
  let query = client.from("lost_found_items").select("*, lost_found_item_images(*)", { count: "exact" }).order("created_at", { ascending: false });
  if (filters.reporterId) query = query.eq("reporter_id", filters.reporterId);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  else if (!filters.status) query = query.in("status", ["open", "processing"]);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.q) query = query.or(`title.ilike.%${filters.q}%,public_description.ilike.%${filters.q}%,location_description.ilike.%${filters.q}%`);
  const result = await query.range((page - 1) * limit, page * limit - 1);
  const rows = checked(result, "item list");
  return { items: rows.map((r: ItemRow) => publicItem(r, r.lost_found_item_images ?? [])), total: result.count ?? rows.length, page, limit };
}

export async function getItem(id: string) {
  if (mock()) { const db = mockRows(); const item = db.lost_found_items.find((r: ItemRow) => r.id === id); return item ? { row: item, public: publicItem(item, db.lost_found_item_images.filter((i: ImageRow) => i.item_id === id)) } : null; }
  const client = await supabase();
  const result = await client.from("lost_found_items").select("*, lost_found_item_images(*)").eq("id", id).maybeSingle();
  const row = checked(result, "item read");
  return row ? { row, public: publicItem(row, row.lost_found_item_images ?? []) } : null;
}

export async function createItem(input: { reporter_id: string; type: "lost" | "found"; category: string; subcategory?: string; title: string; public_description: string; private_description?: string; identifying_marks?: string; location_id?: string; location_description?: string; event_date: string; is_sensitive: boolean; images?: ImageRow[] }) {
  const { images = [], ...item } = input;
  const id = crypto.randomUUID();
  if (mock()) {
    const db = mockRows(); const row = { ...item, id, status: "processing", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    db.lost_found_items.push(row);
    db.lost_found_item_images.push(...images.map((image, index) => ({ ...image, id: image.id ?? crypto.randomUUID(), item_id: id, storage_path: image.storage_path ?? image.public_url, is_primary: image.is_primary ?? index === 0, is_sensitive: image.is_sensitive ?? false, created_at: new Date().toISOString() })));
    db.lost_found_item_events.push({ id: crypto.randomUUID(), item_id: id, event_type: "created", actor_id: input.reporter_id, details: {}, created_at: new Date().toISOString() }); writeDb(db);
    return { row, public: publicItem(row, db.lost_found_item_images.filter((i: ImageRow) => i.item_id === id)) };
  }
  const client = await supabase();
  const row = checked(await client.from("lost_found_items").insert({ ...item, id, status: "processing" }).select().single(), "item insert");
  // Image storage remains owned by the existing caller/storage integration; this
  // persistence layer records supplied URLs and does not upload or transform them.
  if (images.length) checked(await client.from("lost_found_item_images").insert(images.map((image, index) => ({ ...image, item_id: id, storage_path: image.storage_path ?? image.public_url, is_primary: image.is_primary ?? index === 0, is_sensitive: image.is_sensitive ?? false }))), "image insert");
  checked(await client.from("lost_found_item_events").insert({ item_id: id, event_type: "created", actor_id: input.reporter_id, details: {} }), "event insert");
  return { row, public: publicItem(row, images) };
}

export async function getMatchesForItem(id: string) {
  if (mock()) { const db = mockRows(); return db.lost_found_matches.filter((m: MatchRow) => m.lost_item_id === id || m.found_item_id === id).map((m: MatchRow) => ({ ...m, lost: db.lost_found_items.find((i: ItemRow) => i.id === m.lost_item_id), found: db.lost_found_items.find((i: ItemRow) => i.id === m.found_item_id) })); }
  const client = await supabase();
  const result = await client.from("lost_found_matches").select("*, lost:lost_found_items!lost_item_id(*, lost_found_item_images(*)), found:lost_found_items!found_item_id(*, lost_found_item_images(*))").or(`lost_item_id.eq.${id},found_item_id.eq.${id}`);
  return checked(result, "match list");
}

export async function getMatch(id: string) {
  if (mock()) { const db = mockRows(); const m = db.lost_found_matches.find((r: MatchRow) => r.id === id); return m ? { ...m, lost: db.lost_found_items.find((i: ItemRow) => i.id === m.lost_item_id), found: db.lost_found_items.find((i: ItemRow) => i.id === m.found_item_id) } : null; }
  const client = await supabase();
  return checked(await client.from("lost_found_matches").select("*, lost:lost_found_items!lost_item_id(*, lost_found_item_images(*)), found:lost_found_items!found_item_id(*, lost_found_item_images(*))").eq("id", id).maybeSingle(), "match read");
}

export { publicItem };
