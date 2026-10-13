import {
  CampusPost,
  CampusPostComment,
  CampusPostReactionType,
  CreateCampusPostRequest,
  VerifyCampusPostRequest,
} from "@smart-campus/contracts";
import { createApplicationClient, createServiceClient } from "../supabase/server";
import {
  UserAuthContext,
  resolveUserRoleCategory,
  canPublishCategory,
  canTargetAudience,
  canVerifyPost,
  isPostVisibleToUser,
} from "./campus-post-permissions";

// ==============================================================================
// In-Memory Seed / Mock State (for offline development and zero-config test mode)
// ==============================================================================

import { INITIAL_MOCK_POSTS, INITIAL_MOCK_COMMENTS } from "./campus-posts-seed-data";

// ==============================================================================
// In-Memory Seed / Mock State (for offline development and zero-config test mode)
// ==============================================================================

let IN_MEMORY_POSTS: CampusPost[] = [...INITIAL_MOCK_POSTS];
let IN_MEMORY_REACTIONS: Array<{
  postId: string;
  userId: string;
  reaction: CampusPostReactionType;
}> = [
  {
    postId: "88888888-8888-8888-8888-888888880001",
    userId: "33333333-3333-3333-3333-333333330001",
    reaction: "like",
  },
];

let IN_MEMORY_COMMENTS: CampusPostComment[] = [...INITIAL_MOCK_COMMENTS];

// ==============================================================================
// Cursor & Pagination Helpers
// ==============================================================================

export function encodeCursor(publishedAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ publishedAt, id })).toString("base64");
}

export function decodeCursor(
  cursor?: string
): { publishedAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, "base64").toString("utf-8");
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.publishedAt === "string" &&
      typeof parsed.id === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export interface FeedQueryOptions {
  category?: string;
  query?: string;
  cursor?: string;
  limit?: number;
}

export interface FeedPageResult {
  items: CampusPost[];
  nextCursor: string | null;
  hasMore: boolean;
  count: number;
}

/** The in-memory store is reserved for explicit mock mode, demo mode, or a genuinely absent Supabase setup. */
function isInMemoryStore(): boolean {
  if (process.env.CAMPUSGRAM_DEMO_MODE === "true") return true;
  if (process.env.NODE_ENV === "test") return true;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return !url || !key || url.includes("placeholder") || key.includes("placeholder");
}

function mapPost(d: any): CampusPost {
  return {
    id: d.id,
    authorProfileId: d.author_profile_id,
    authorName: d.author_name,
    authorRole: d.author_role,
    authorRoleCategory: d.author_role_category,
    authorDepartment: d.author_department,
    title: d.title,
    content: d.content,
    category: d.category,
    status: d.status,
    verificationStatus: d.verification_status,
    verificationInfo: d.verifier_name ? {
      verifiedByProfileId: d.verified_by_profile_id,
      verifierName: d.verifier_name,
      verifierRole: d.verifier_role,
      verifierDepartment: d.verifier_department,
      verifiedAt: d.verified_at,
      scope: d.verification_scope,
      note: d.verification_note,
    } : undefined,
    audience: {
      scope: d.audience_scope,
      departmentCode: d.audience_department_code,
      departmentId: d.audience_department_id,
      programCode: d.audience_program_code,
      programId: d.audience_program_id,
      academicYear: d.audience_academic_year,
      semester: d.audience_semester,
      section: d.audience_section,
      displayName: d.audience_display_name,
    },
    attachments: (d.campus_post_attachments || []).map((att: any) => ({
      id: att.id, storagePath: att.storage_path, originalFilename: att.original_filename,
      mimeType: att.mime_type, fileSize: Number(att.file_size),
    })),
    likesCount: Number(d.likes_count || 0), dislikesCount: Number(d.dislikes_count || 0),
    commentsCount: Number(d.comments_count || 0), publishedAt: d.published_at,
    createdAt: d.created_at, updatedAt: d.updated_at,
  };
}

function mapComment(d: any): CampusPostComment {
  return {
    id: d.id, postId: d.post_id, authorProfileId: d.author_profile_id,
    authorName: d.author_name, authorRole: d.author_role,
    authorRoleCategory: d.author_role_category, authorDepartment: d.author_department,
    content: d.content, status: d.status, createdAt: d.created_at, updatedAt: d.updated_at,
  };
}

// ==============================================================================
// Service Operations
// ==============================================================================

/**
 * Retrieves the campus information feed for an authenticated user, enforcing visibility,
 * indexed category/search filtering, cursor-based pagination, and batch user reaction resolution.
 */
export async function getFeedPosts(
  userContext: UserAuthContext,
  options?: FeedQueryOptions
): Promise<FeedPageResult> {
  const limit = Math.min(Math.max(1, options?.limit ?? 20), 100);
  const cursorInfo = decodeCursor(options?.cursor);

  let posts: CampusPost[] = [];
  let isDbSuccess = false;

  if (!isInMemoryStore()) try {
    const supabase = await createApplicationClient();
    let query = supabase
      .from("campus_posts")
      .select("*, campus_post_attachments(*)")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .order("id", { ascending: false });

    if (options?.category && options.category !== "all") {
      query = query.eq("category", options.category);
    }

    if (options?.query && options.query.trim()) {
      const q = options.query.trim();
      query = query.or(
        `title.ilike.%${q}%,content.ilike.%${q}%,author_name.ilike.%${q}%`
      );
    }

    if (cursorInfo) {
      query = query.or(
        `published_at.lt.${cursorInfo.publishedAt},and(published_at.eq.${cursorInfo.publishedAt},id.lt.${cursorInfo.id})`
      );
    }

    // Limit + 1 to detect next page availability
    query = query.limit(limit + 1);

    const { data, error } = await query;

    if (error) throw new Error(`Unable to read campus feed: ${error.message}`);
    if (data) {
      isDbSuccess = true;
      posts = data.map((d: any) => ({
        id: d.id,
        authorProfileId: d.author_profile_id,
        authorName: d.author_name,
        authorRole: d.author_role,
        authorRoleCategory: d.author_role_category,
        authorDepartment: d.author_department,
        title: d.title,
        content: d.content,
        category: d.category,
        status: d.status,
        verificationStatus: d.verification_status,
        verificationInfo: d.verifier_name
          ? {
              verifiedByProfileId: d.verified_by_profile_id,
              verifierName: d.verifier_name,
              verifierRole: d.verifier_role,
              verifierDepartment: d.verifier_department,
              verifiedAt: d.verified_at,
              scope: d.verification_scope,
              note: d.verification_note,
            }
          : undefined,
        audience: {
          scope: d.audience_scope,
          departmentCode: d.audience_department_code,
          departmentId: d.audience_department_id,
          programCode: d.audience_program_code,
          academicYear: d.audience_academic_year,
          semester: d.audience_semester,
          section: d.audience_section,
          displayName: d.audience_display_name,
        },
        attachments: (d.campus_post_attachments || []).map((att: any) => ({
          id: att.id,
          storagePath: att.storage_path,
          originalFilename: att.original_filename,
          mimeType: att.mime_type,
          fileSize: Number(att.file_size),
        })),
        likesCount: d.likes_count,
        dislikesCount: d.dislikes_count,
        commentsCount: d.comments_count,
        publishedAt: d.published_at,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      }));
    }
  } catch (err) {
    throw err instanceof Error ? err : new Error("Unable to read campus feed.");
  }

  // If DB returned rows, process DB results
  if (isDbSuccess) {
    // Enforce server-side audience visibility
    const visiblePosts = posts.filter((p) => isPostVisibleToUser(p, userContext));
    const hasMore = visiblePosts.length > limit;
    const pageItems = hasMore ? visiblePosts.slice(0, limit) : visiblePosts;

    const nextCursor =
      hasMore && pageItems.length > 0
        ? encodeCursor(
            pageItems[pageItems.length - 1].publishedAt,
            pageItems[pageItems.length - 1].id
          )
        : null;

    // Batch resolve user reactions without N+1 queries
    const postIds = pageItems.map((p) => p.id);
    if (postIds.length > 0 && userContext.id) {
      try {
        const supabase = await createApplicationClient();
        const { data: userRxns } = await supabase
          .from("campus_post_reactions")
          .select("post_id, reaction_type")
          .in("post_id", postIds)
          .eq("user_profile_id", userContext.id);

        if (userRxns) {
          const rxnMap = new Map(
            userRxns.map((r: any) => [r.post_id, r.reaction_type as CampusPostReactionType])
          );
          pageItems.forEach((p) => {
            p.userReaction = rxnMap.get(p.id) || null;
          });
        }
      } catch (err) {
        throw err instanceof Error ? err : new Error("Unable to read post reactions.");
      }
    }

    return {
      items: pageItems,
      nextCursor,
      hasMore,
      count: visiblePosts.length,
    };
  }

  if (!isInMemoryStore()) throw new Error("Unable to read campus feed.");

  // In-Memory deterministic engine (explicit mock/unconfigured mode)
  let memoryPosts = [...IN_MEMORY_POSTS];

  // 1. Enforce audience visibility
  memoryPosts = memoryPosts.filter((p) => isPostVisibleToUser(p, userContext));

  // 2. Category filter
  if (options?.category && options.category !== "all") {
    memoryPosts = memoryPosts.filter((p) => p.category === options.category);
  }

  // 3. Search query filter
  if (options?.query && options.query.trim().length > 0) {
    const q = options.query.toLowerCase().trim();
    memoryPosts = memoryPosts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        p.authorName.toLowerCase().includes(q)
    );
  }

  // 4. Deterministic sort: publishedAt DESC, then id DESC
  memoryPosts.sort((a, b) => {
    const timeDiff =
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.id.localeCompare(a.id);
  });

  const totalMatchingCount = memoryPosts.length;

  // 5. Cursor filter
  if (cursorInfo) {
    const cursorTime = new Date(cursorInfo.publishedAt).getTime();
    memoryPosts = memoryPosts.filter((p) => {
      const pTime = new Date(p.publishedAt).getTime();
      if (pTime < cursorTime) return true;
      if (pTime === cursorTime) return p.id < cursorInfo.id;
      return false;
    });
  }

  // 6. Slice limit + 1
  const hasMore = memoryPosts.length > limit;
  const pageItems = hasMore ? memoryPosts.slice(0, limit) : memoryPosts;

  const nextCursor =
    hasMore && pageItems.length > 0
      ? encodeCursor(
          pageItems[pageItems.length - 1].publishedAt,
          pageItems[pageItems.length - 1].id
        )
      : null;

  // 7. Batch reaction lookup via Map (O(1) resolution, no N+1)
  const postIds = pageItems.map((p) => p.id);
  const rxnMap = new Map(
    IN_MEMORY_REACTIONS
      .filter((r) => r.userId === userContext.id && postIds.includes(r.postId))
      .map((r) => [r.postId, r.reaction])
  );

  const items = pageItems.map((p) => ({
    ...p,
    userReaction: rxnMap.get(p.id) || null,
  }));

  return {
    items,
    nextCursor,
    hasMore,
    count: totalMatchingCount,
  };
}

/**
 * Retrieves a single post by ID if visible to the user.
 */
export async function getPostById(
  postId: string,
  userContext: UserAuthContext
): Promise<CampusPost | null> {
  if (!isInMemoryStore()) {
    const supabase = await createApplicationClient();
    const { data, error } = await supabase
      .from("campus_posts").select("*, campus_post_attachments(*)").eq("id", postId).maybeSingle();
    if (error) throw new Error(`Unable to read campus post: ${error.message}`);
    if (!data) return null;
    const post = mapPost(data);
    if (!isPostVisibleToUser(post, userContext)) return null;
    const { data: reaction, error: reactionError } = await supabase
      .from("campus_post_reactions").select("reaction_type").eq("post_id", postId)
      .eq("user_profile_id", userContext.id).maybeSingle();
    if (reactionError) throw new Error(`Unable to read post reaction: ${reactionError.message}`);
    post.userReaction = reaction?.reaction_type || null;
    return post;
  }
  const post = IN_MEMORY_POSTS.find((p) => p.id === postId);
  if (!post) return null;

  if (!isPostVisibleToUser(post, userContext)) {
    return null;
  }

  const userRxn = IN_MEMORY_REACTIONS.find(
    (r) => r.postId === post.id && r.userId === userContext.id
  );

  return {
    ...post,
    userReaction: userRxn ? userRxn.reaction : null,
  };
}

/**
 * Creates and publishes a campus post with server authorization checks.
 */
export async function createCampusPost(
  userContext: UserAuthContext,
  request: CreateCampusPostRequest,
  attachments: Array<{
    storagePath: string;
    originalFilename: string;
    mimeType: string;
    fileSize: number;
  }> = []
): Promise<CampusPost> {
  const roleCategory = resolveUserRoleCategory(
    userContext.role,
    userContext.tags
  );

  // 1. Enforce category authorization (regular students cannot publish academic)
  if (!canPublishCategory(roleCategory, request.category)) {
    throw new Error(
      `Role '${roleCategory}' is restricted from publishing academic notices.`
    );
  }

  // 2. Enforce audience authorization
  if (
    !canTargetAudience(
      userContext,
      request.audienceScope,
      request.departmentCode
    )
  ) {
    throw new Error(
      `User is not authorized to target audience scope '${request.audienceScope}'.`
    );
  }

  const generatedId = `post-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  let audienceDisplayName = "Campus Wide";
  if (request.audienceScope === "students") audienceDisplayName = "All Students";
  if (request.audienceScope === "department")
    audienceDisplayName = `${request.departmentCode || userContext.departmentCode || "Department"} Department`;
  if (request.audienceScope === "class")
    audienceDisplayName = `Year ${request.academicYear || userContext.academicYear || 3} • Sem ${request.semester || userContext.semester || 6} (${request.section || userContext.section || "A"})`;

  const newPost: CampusPost = {
    id: generatedId,
    authorProfileId: userContext.id,
    authorName: userContext.fullName,
    authorRole:
      roleCategory === "student_coordinator"
        ? "Student Coordinator"
        : roleCategory === "department_coordinator"
          ? "Department Coordinator"
          : roleCategory === "faculty"
            ? "Faculty Member"
            : roleCategory === "admin"
              ? "Administrator"
              : "Student",
    authorRoleCategory: roleCategory,
    authorDepartment: userContext.departmentCode || undefined,
    title: request.title,
    content: request.content,
    category: request.category,
    status: "published",
    verificationStatus: "unverified",
    audience: {
      scope: request.audienceScope,
      departmentCode: request.departmentCode || userContext.departmentCode || undefined,
      departmentId: request.departmentId || userContext.departmentId || undefined,
      programCode: request.programCode || userContext.programCode || undefined,
      programId: request.programId || userContext.programId || undefined,
      academicYear: request.academicYear || userContext.academicYear || undefined,
      semester: request.semester || userContext.semester || undefined,
      section: request.section || userContext.section || undefined,
      displayName: audienceDisplayName,
    },
    attachments: attachments.map((att, idx) => ({
      id: `att-${Date.now()}-${idx}`,
      storagePath: att.storagePath,
      originalFilename: att.originalFilename,
      mimeType: att.mimeType,
      fileSize: att.fileSize,
    })),
    likesCount: 0,
    dislikesCount: 0,
    commentsCount: 0,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  if (!isInMemoryStore()) {
    const supabase = await createApplicationClient();
    const { data, error } = await supabase
      .from("campus_posts")
      .insert({
        author_profile_id: userContext.id,
        author_name: newPost.authorName,
        author_role: newPost.authorRole,
        author_role_category: newPost.authorRoleCategory,
        author_department: newPost.authorDepartment,
        title: newPost.title,
        content: newPost.content,
        category: newPost.category,
        status: newPost.status,
        verification_status: newPost.verificationStatus,
        audience_scope: newPost.audience.scope,
        audience_department_id: newPost.audience.departmentId,
        audience_department_code: newPost.audience.departmentCode,
        audience_program_id: newPost.audience.programId,
        audience_program_code: newPost.audience.programCode,
        audience_academic_year: newPost.audience.academicYear,
        audience_semester: newPost.audience.semester,
        audience_section: newPost.audience.section,
        audience_display_name: newPost.audience.displayName,
      })
      .select()
      .single();

    if (error || !data) throw new Error(`Unable to create campus post: ${error?.message || "No row returned"}`);
    newPost.id = data.id;
    newPost.createdAt = data.created_at || newPost.createdAt;
    newPost.updatedAt = data.updated_at || newPost.updatedAt;
    newPost.publishedAt = data.published_at || newPost.publishedAt;

    if (attachments.length > 0) {
      const { error: attachmentError } = await supabase.from("campus_post_attachments").insert(
          attachments.map((att) => ({
            post_id: data.id,
            storage_path: att.storagePath,
            original_filename: att.originalFilename,
            mime_type: att.mimeType,
            file_size: att.fileSize,
          }))
      );
      if (attachmentError) throw new Error(`Unable to save post attachments: ${attachmentError.message}`);
    }
    return newPost;
  }

  // Explicit mock/unconfigured mode only.
  IN_MEMORY_POSTS.unshift(newPost);
  return newPost;
}

/**
 * Verifies a post within authorized coordinator scope.
 */
export async function verifyCampusPost(
  postId: string,
  userContext: UserAuthContext,
  request: VerifyCampusPostRequest
): Promise<CampusPost> {
  if (!isInMemoryStore()) {
    const supabase = await createApplicationClient();
    const { data, error } = await supabase.from("campus_posts")
      .select("*").eq("id", postId).maybeSingle();
    if (error) throw new Error(`Unable to read campus post for verification: ${error.message}`);
    if (!data) throw new Error(`Post with ID '${postId}' not found.`);
    const dbPost = mapPost(data);
    if (!canVerifyPost(userContext, dbPost)) {
      throw new Error("Forbidden: You are not authorized to verify this post (self-verification is blocked, or post is outside your scope).");
    }
    const roleCategory = resolveUserRoleCategory(userContext.role, userContext.tags);
    const verifierRole = roleCategory === "department_coordinator" ? "Department Coordinator" :
      roleCategory === "student_coordinator" ? "Student Coordinator" :
      userContext.role === "admin" ? "Administrator" : "Faculty Verifier";
    const verifiedAt = new Date().toISOString();
    const scope = `${userContext.departmentCode || "Campus"} Authority`;
    const { error: updateError } = await supabase.from("campus_posts").update({
      verification_status: request.status, verified_by_profile_id: userContext.id,
      verifier_name: userContext.fullName, verifier_role: verifierRole,
      verifier_department: userContext.departmentCode, verified_at: verifiedAt,
      verification_scope: scope, verification_note: request.note,
    }).eq("id", postId);
    if (updateError) throw new Error(`Unable to verify campus post: ${updateError.message}`);
    const { error: auditError } = await supabase.from("campus_post_verifications").insert({
      post_id: postId, verified_by_profile_id: userContext.id, verifier_name: userContext.fullName,
      verifier_role: verifierRole, verifier_department: userContext.departmentCode,
      status: request.status, scope, note: request.note,
    });
    if (auditError) throw new Error(`Unable to record post verification: ${auditError.message}`);
    return { ...dbPost, verificationStatus: request.status, verificationInfo: {
      verifiedByProfileId: userContext.id, verifierName: userContext.fullName,
      verifierRole, verifierRoleCategory: roleCategory, verifierDepartment: userContext.departmentCode || undefined,
      verifiedAt, scope, note: request.note,
    }};
  }
  const post = IN_MEMORY_POSTS.find((p) => p.id === postId);
  if (!post) {
    throw new Error(`Post with ID '${postId}' not found.`);
  }

  if (!canVerifyPost(userContext, post)) {
    throw new Error(
      "Forbidden: You are not authorized to verify this post (self-verification is blocked, or post is outside your scope)."
    );
  }

  const roleCategory = resolveUserRoleCategory(
    userContext.role,
    userContext.tags
  );

  const verifierRole =
    roleCategory === "department_coordinator"
      ? "Department Coordinator"
      : roleCategory === "student_coordinator"
        ? "Student Coordinator"
        : userContext.role === "admin"
          ? "Administrator"
          : "Faculty Verifier";

  post.verificationStatus = request.status;
  post.verificationInfo = {
    verifiedByProfileId: userContext.id,
    verifierName: userContext.fullName,
    verifierRole,
    verifierRoleCategory: roleCategory,
    verifierDepartment: userContext.departmentCode || undefined,
    verifiedAt: new Date().toISOString(),
    scope: `${userContext.departmentCode || "Campus"} Authority`,
    note: request.note,
  };
  post.updatedAt = new Date().toISOString();

  return post;
}

/**
 * Toggles or updates a reaction (Like/Dislike) on a post.
 * Mutually exclusive, prevents duplicate counts.
 */
export async function reactToCampusPost(
  postId: string,
  userContext: UserAuthContext,
  reaction: CampusPostReactionType
): Promise<{ likesCount: number; dislikesCount: number; userReaction: CampusPostReactionType | null }> {
  if (!isInMemoryStore()) {
    const supabase = await createApplicationClient();
    const { data: postRow, error: postError } = await supabase.from("campus_posts")
      .select("id, likes_count, dislikes_count").eq("id", postId).maybeSingle();
    if (postError) throw new Error(`Unable to read campus post: ${postError.message}`);
    if (!postRow) throw new Error(`Post with ID '${postId}' not found.`);
    const { data: existing, error: existingError } = await supabase.from("campus_post_reactions")
      .select("reaction_type").eq("post_id", postId).eq("user_profile_id", userContext.id).maybeSingle();
    if (existingError) throw new Error(`Unable to read post reaction: ${existingError.message}`);
    const previous = existing?.reaction_type as CampusPostReactionType | undefined;
    const next = previous === reaction ? null : reaction;
    if (next === null) {
      const { error } = await supabase.from("campus_post_reactions").delete()
        .eq("post_id", postId).eq("user_profile_id", userContext.id);
      if (error) throw new Error(`Unable to remove post reaction: ${error.message}`);
    } else {
      const { error } = await supabase.from("campus_post_reactions").upsert({
        post_id: postId, user_profile_id: userContext.id, reaction_type: next,
      }, { onConflict: "post_id,user_profile_id" });
      if (error) throw new Error(`Unable to save post reaction: ${error.message}`);
    }
    const counterClient = createServiceClient();
    if (previous && previous !== next) {
      const { error } = await counterClient.rpc(previous === "like" ? "increment_post_likes" : "increment_post_dislikes", { target_post_id: postId, delta: -1 });
      if (error) throw new Error(`Unable to update post reaction count: ${error.message}`);
    }
    if (next && previous !== next) {
      const { error } = await counterClient.rpc(next === "like" ? "increment_post_likes" : "increment_post_dislikes", { target_post_id: postId, delta: 1 });
      if (error) throw new Error(`Unable to update post reaction count: ${error.message}`);
    }
    const { data: updated, error: updatedError } = await supabase.from("campus_posts")
      .select("likes_count, dislikes_count").eq("id", postId).single();
    if (updatedError || !updated) throw new Error(`Unable to read updated reaction counts: ${updatedError?.message || "No row returned"}`);
    return { likesCount: Number(updated.likes_count), dislikesCount: Number(updated.dislikes_count), userReaction: next };
  }
  const post = IN_MEMORY_POSTS.find((p) => p.id === postId);
  if (!post) {
    throw new Error(`Post with ID '${postId}' not found.`);
  }

  const existingIndex = IN_MEMORY_REACTIONS.findIndex(
    (r) => r.postId === postId && r.userId === userContext.id
  );

  let nextReaction: CampusPostReactionType | null = reaction;

  if (existingIndex >= 0) {
    const prevReaction = IN_MEMORY_REACTIONS[existingIndex].reaction;
    if (prevReaction === reaction) {
      // Toggle OFF
      IN_MEMORY_REACTIONS.splice(existingIndex, 1);
      nextReaction = null;
      if (reaction === "like") post.likesCount = Math.max(0, post.likesCount - 1);
      if (reaction === "dislike") post.dislikesCount = Math.max(0, post.dislikesCount - 1);
    } else {
      // Switch reaction
      IN_MEMORY_REACTIONS[existingIndex].reaction = reaction;
      if (reaction === "like") {
        post.likesCount += 1;
        post.dislikesCount = Math.max(0, post.dislikesCount - 1);
      } else {
        post.dislikesCount += 1;
        post.likesCount = Math.max(0, post.likesCount - 1);
      }
    }
  } else {
    // Add new reaction
    IN_MEMORY_REACTIONS.push({ postId, userId: userContext.id, reaction });
    if (reaction === "like") post.likesCount += 1;
    if (reaction === "dislike") post.dislikesCount += 1;
  }

  return {
    likesCount: post.likesCount,
    dislikesCount: post.dislikesCount,
    userReaction: nextReaction,
  };
}

/**
 * Retrieves comments for a post if visible to the user.
 */
export async function getCampusPostComments(
  postId: string,
  userContext: UserAuthContext
): Promise<CampusPostComment[]> {
  if (!isInMemoryStore()) {
    const post = await getPostById(postId, userContext);
    if (!post) throw new Error("Post not found or inaccessible.");
    const supabase = await createApplicationClient();
    const { data, error } = await supabase.from("campus_post_comments").select("*")
      .eq("post_id", postId).eq("status", "active").order("created_at", { ascending: true });
    if (error) throw new Error(`Unable to read post comments: ${error.message}`);
    return (data || []).map(mapComment);
  }
  const post = IN_MEMORY_POSTS.find((p) => p.id === postId);
  if (!post || !isPostVisibleToUser(post, userContext)) {
    throw new Error("Post not found or inaccessible.");
  }

  return IN_MEMORY_COMMENTS.filter(
    (c) => c.postId === postId && c.status === "active"
  );
}

/**
 * Adds a comment to a post.
 */
export async function addCampusPostComment(
  postId: string,
  userContext: UserAuthContext,
  content: string
): Promise<CampusPostComment> {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Comment cannot be empty.");
  }
  if (trimmed.length > 1000) {
    throw new Error("Comment cannot exceed 1000 characters.");
  }

  const post = isInMemoryStore() ? IN_MEMORY_POSTS.find((p) => p.id === postId) : await getPostById(postId, userContext);
  if (!post || !isPostVisibleToUser(post, userContext)) throw new Error("Post not found or inaccessible.");

  const roleCategory = resolveUserRoleCategory(
    userContext.role,
    userContext.tags
  );

  const comment: CampusPostComment = {
    id: `comm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    postId,
    authorProfileId: userContext.id,
    authorName: userContext.fullName,
    authorRole: userContext.role,
    authorRoleCategory: roleCategory,
    authorDepartment: userContext.departmentCode || undefined,
    content: trimmed,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!isInMemoryStore()) {
    const supabase = await createApplicationClient();
    const { data, error } = await supabase.from("campus_post_comments").insert({
      post_id: postId, author_profile_id: userContext.id, author_name: userContext.fullName,
      author_role: userContext.role, author_role_category: roleCategory,
      author_department: userContext.departmentCode, content: trimmed, status: "active",
    }).select().single();
    if (error || !data) throw new Error(`Unable to create post comment: ${error?.message || "No row returned"}`);
    const { error: countError } = await createServiceClient().rpc("increment_post_comments", { target_post_id: postId, delta: 1 });
    if (countError) throw new Error(`Unable to update comment count: ${countError.message}`);
    return mapComment(data);
  }
  IN_MEMORY_COMMENTS.push(comment);
  post.commentsCount += 1;

  return comment;
}

/**
 * Deletes a comment. Only the comment author or an admin can delete a comment.
 */
export async function deleteCampusPostComment(
  commentId: string,
  userContext: UserAuthContext
): Promise<boolean> {
  if (!isInMemoryStore()) {
    const supabase = await createApplicationClient();
    const { data: comment, error: readError } = await supabase.from("campus_post_comments")
      .select("*").eq("id", commentId).maybeSingle();
    if (readError) throw new Error(`Unable to read comment: ${readError.message}`);
    if (!comment) throw new Error("Comment not found.");
    if (comment.author_profile_id !== userContext.id && userContext.role !== "admin") {
      throw new Error("Forbidden: You can only delete your own comments.");
    }
    const { error } = await supabase.from("campus_post_comments").update({
      status: "removed", updated_at: new Date().toISOString(),
    }).eq("id", commentId);
    if (error) throw new Error(`Unable to delete comment: ${error.message}`);
    const { error: countError } = await createServiceClient().rpc("increment_post_comments", { target_post_id: comment.post_id, delta: -1 });
    if (countError) throw new Error(`Unable to update comment count: ${countError.message}`);
    return true;
  }
  const comment = IN_MEMORY_COMMENTS.find((c) => c.id === commentId);
  if (!comment) {
    throw new Error("Comment not found.");
  }

  if (comment.authorProfileId !== userContext.id && userContext.role !== "admin") {
    throw new Error("Forbidden: You can only delete your own comments.");
  }

  comment.status = "removed";
  const post = IN_MEMORY_POSTS.find((p) => p.id === comment.postId);
  if (post) {
    post.commentsCount = Math.max(0, post.commentsCount - 1);
  }

  return true;
}
