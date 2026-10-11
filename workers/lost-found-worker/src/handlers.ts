import { BaseJob, ProcessItemPayload, ExplainMatchPayload, SendNotificationPayload } from "./jobs";
import { logger } from "./logger";
import { LostFoundAIServiceClient, calculateMatchScore, readDb, writeDb } from "@smart-campus/lost-and-found";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { LostFoundItem } from "@smart-campus/contracts";

// The compatibility store persists rows separately from the API's images array.
type LocalItemRow = Omit<LostFoundItem, "images"> & {
  text_embedding?: number[];
  primary_image_embedding?: number[];
};

const aiClient = new LostFoundAIServiceClient();

function vectorArray(value: unknown): number[] | undefined {
  if (Array.isArray(value)) {
    const values = value.map(Number);
    return values.every(Number.isFinite) ? values : undefined;
  }
  if (typeof value !== "string") return undefined;
  const raw = value.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (!raw) return [];
  const values = raw.split(",").map((entry) => Number(entry.trim()));
  return values.every(Number.isFinite) ? values : undefined;
}

function supabaseWorker() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function handleProcessItem(job: BaseJob<ProcessItemPayload>): Promise<void> {
  const { itemId, title, description, imageUrls, type } = job.payload;
  logger.info(`Processing item ${itemId}: "${title}"`);

  const aiResult = await aiClient.analyzeItem({ itemId, title, description, imageUrls });

  logger.info(`Embeddings generated for item ${itemId} (isMock: ${aiResult.isMock})`);

  const remote = supabaseWorker();
  // Persistence backend is selected by database configuration, not by the
  // authentication provider. Dummy OTP still uses hosted Supabase data.
  if (remote) {
    const textEmbedding = vectorArray(aiResult.textEmbedding);
    const imageEmbedding = vectorArray(aiResult.imageEmbedding);
    const { data: item, error: itemError } = await remote.from("lost_found_items").select("*").eq("id", itemId).single();
    if (itemError || !item) throw new Error(`Unable to read item ${itemId}: ${itemError?.message || "not found"}`);
    const { error: updateError } = await remote.from("lost_found_items").update({ text_embedding: textEmbedding, primary_image_embedding: imageEmbedding, status: "open", updated_at: new Date().toISOString() }).eq("id", itemId);
    if (updateError) throw new Error(`Unable to update item ${itemId}: ${updateError.message}`);
    const { error: eventError } = await remote.from("lost_found_item_events").insert({ item_id: itemId, event_type: "processed_by_ai", actor_id: null, details: { worker: true } });
    if (eventError) throw new Error(`Unable to write processing event: ${eventError.message}`);
    const { data: candidates, error: candidateError } = await remote.from("lost_found_items").select("*").eq("type", type === "lost" ? "found" : "lost").eq("status", "open").not("text_embedding", "is", null);
    if (candidateError) throw new Error(`Unable to read match candidates: ${candidateError.message}`);
    for (const candidate of candidates || []) {
      const cosine = (a: number[] | undefined, b: number[] | undefined) => {
        if (!a?.length || !b?.length || a.length !== b.length) return 0;
        let dot = 0; let normA = 0; let normB = 0;
        for (let i = 0; i < a.length; i += 1) {
          const left = Number.isFinite(a[i]) ? a[i] : 0;
          const right = Number.isFinite(b[i]) ? b[i] : 0;
          dot += left * right; normA += left * left; normB += right * right;
        }
        return normA && normB ? Math.max(0, Math.min(1, dot / (Math.sqrt(normA) * Math.sqrt(normB)))) : 0;
      };
      const textSim = cosine(textEmbedding, vectorArray(candidate.text_embedding));
      const imageSim = cosine(imageEmbedding, vectorArray(candidate.primary_image_embedding));
      const itemTime = Date.parse(item.event_date);
      const candidateTime = Date.parse(candidate.event_date);
      const days = Number.isFinite(itemTime) && Number.isFinite(candidateTime)
        ? Math.abs(itemTime - candidateTime) / 86_400_000 : Infinity;
      const location = item.location_id && candidate.location_id && item.location_id === candidate.location_id ? 1 : 0;
      const time = days <= 1 ? 1 : days <= 7 ? 0.6 : days <= 30 ? 0.2 : 0;
      const score = calculateMatchScore({ image: imageSim, text: textSim, category: candidate.category === item.category ? 1 : 0.2, location, time });
      if (score.overallScore <= 0.4) continue;
      const lost_item_id = type === "lost" ? itemId : candidate.id;
      const found_item_id = type === "found" ? itemId : candidate.id;
      const { error: matchError } = await remote.from("lost_found_matches").upsert({ lost_item_id, found_item_id, overall_score: score.overallScore, match_band: score.band, score_breakdown: score.breakdown }, { onConflict: "lost_item_id,found_item_id" });
      if (matchError) throw new Error(`Unable to write match: ${matchError.message}`);
      const { error: matchEventError } = await remote.from("lost_found_item_events").insert({ item_id: itemId, event_type: "match_found", actor_id: null, details: { lost_item_id, found_item_id } });
      if (matchEventError) throw new Error(`Unable to write match event: ${matchEventError.message}`);
    }
    return;
  }

  if (!remote && process.env.AUTH_MODE !== "mock") {
    throw new Error("Lost & Found worker requires Supabase configuration (or AUTH_MODE=mock).");
  }

  const db = readDb();
  const items: LocalItemRow[] = db.lost_found_items;
  const item = items.find((i) => i.id === itemId);
  
  if (item) {
      item.text_embedding = aiResult.textEmbedding;
      item.primary_image_embedding = aiResult.imageEmbedding;
      item.status = 'open';
      
      // Log the processing event
      db.lost_found_item_events.push({
          id: randomUUID(),
          item_id: itemId,
          event_type: "processed_by_ai",
          actor_id: "system-worker",
          created_at: new Date().toISOString()
      });
      logger.info(`Updated item ${itemId} with embeddings and marked as open.`);
  }

  // Find candidates (simple mock cosine distance calculation for local DB)
  const targetType = type === 'lost' ? 'found' : 'lost';
  const candidates = items.filter((i) => i.type === targetType && i.status === 'open' && i.text_embedding);

  const cosine = (a: number[] | undefined, b: number[] | undefined) => {
      if (!a?.length || !b?.length || a.length !== b.length) return 0;
      let dot = 0; let normA = 0; let normB = 0;
      for (let i = 0; i < a.length; i += 1) {
          const left = Number.isFinite(a[i]) ? a[i] : 0;
          const right = Number.isFinite(b[i]) ? b[i] : 0;
          dot += left * right; normA += left * left; normB += right * right;
      }
      return normA && normB ? Math.max(0, Math.min(1, dot / (Math.sqrt(normA) * Math.sqrt(normB)))) : 0;
  };

  for (const candidate of candidates) {
      const textSim = cosine(aiResult.textEmbedding, candidate.text_embedding);
      const imageSim = cosine(aiResult.imageEmbedding, candidate.primary_image_embedding);
      const itemTime = item ? Date.parse(item.event_date) : NaN;
      const candidateTime = Date.parse(candidate.event_date);
      const days = Number.isFinite(itemTime) && Number.isFinite(candidateTime)
          ? Math.abs(itemTime - candidateTime) / 86_400_000 : Infinity;
      const location = item?.location_id && candidate.location_id && item.location_id === candidate.location_id ? 1 : 0;
      const time = days <= 1 ? 1 : days <= 7 ? 0.6 : days <= 30 ? 0.2 : 0;

      const score = calculateMatchScore({
          image: imageSim,
          text: textSim,
          category: candidate.category === item?.category ? 1.0 : 0.2,
          location,
          time,
      });

      if (score.overallScore > 0.4) {
          const lost_id = type === 'lost' ? itemId : candidate.id;
          const found_id = type === 'found' ? itemId : candidate.id;
          
          db.lost_found_matches.push({
              id: randomUUID(),
              lost_item_id: lost_id,
              found_item_id: found_id,
              overall_score: score.overallScore,
              match_band: score.band,
              score_breakdown: score.breakdown,
              created_at: new Date().toISOString()
          });
          
          db.lost_found_item_events.push({
              id: randomUUID(),
              item_id: itemId,
              event_type: "match_found",
              actor_id: "system-worker",
              created_at: new Date().toISOString()
          });
          
          logger.info(`Created match between ${lost_id} and ${found_id} with score ${score.overallScore}`);
      }
  }

  writeDb(db);
}

export async function handleExplainMatch(_job: BaseJob<ExplainMatchPayload>): Promise<void> {}
export async function handleSendNotification(_job: BaseJob<SendNotificationPayload>): Promise<void> {}
export async function handleExpireItems(): Promise<void> {}
export async function handleCloseContactWindows(): Promise<void> {}
