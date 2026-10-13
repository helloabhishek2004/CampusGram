import {
  CampusDocument,
  CreateDocumentRequest,
  DocumentCategory,
  DocumentType,
  InstitutionalRole,
} from "@smart-campus/contracts";
import { createClient } from "../supabase/server";
import {
  MOCK_ACADEMIC_DOCUMENTS,
  MOCK_NON_ACADEMIC_DOCUMENTS,
} from "../services/documents-data";
import { canUploadDocumentType } from "./document-permissions";

export const DEFAULT_DOCUMENT_TYPES: DocumentType[] = [
  {
    id: "66666666-6666-6666-6666-666666660001",
    code: "DIGITAL_ID",
    name: "Institutional Digital ID",
    category: "academic",
    description: "Official university identity card with smart chip barcode.",
    allowedRoles: ["student", "faculty", "staff", "admin"],
    isUploadable: false,
    isGenerated: true,
    isActive: true,
  },
  {
    id: "66666666-6666-6666-6666-666666660002",
    code: "BONAFIDE_CERT",
    name: "Bonafide Certificate",
    category: "academic",
    description: "Official proof of current regular enrollment in degree program.",
    allowedRoles: ["student"],
    isUploadable: true,
    isGenerated: true,
    isActive: true,
  },
  {
    id: "66666666-6666-6666-6666-666666660003",
    code: "GRADE_CARD",
    name: "Semester Grade Card",
    category: "academic",
    description: "Authenticated statement of grades & credits earned.",
    allowedRoles: ["student"],
    isUploadable: false,
    isGenerated: true,
    isActive: true,
  },
  {
    id: "66666666-6666-6666-6666-666666660004",
    code: "ATTENDANCE_RECORD",
    name: "Attendance Record",
    category: "academic",
    description: "Certified bio-metric and class attendance summary.",
    allowedRoles: ["student"],
    isUploadable: false,
    isGenerated: true,
    isActive: true,
  },
  {
    id: "66666666-6666-6666-6666-666666660005",
    code: "COURSE_REG",
    name: "Course Registration Sheet",
    category: "academic",
    description: "Registered courses, electives, credit breakdown and lab sections.",
    allowedRoles: ["student"],
    isUploadable: true,
    isGenerated: true,
    isActive: true,
  },
  {
    id: "66666666-6666-6666-6666-666666660006",
    code: "ACADEMIC_TRANSCRIPT",
    name: "Academic Transcript",
    category: "academic",
    description: "Provisional academic transcript with complete course audit.",
    allowedRoles: ["student"],
    isUploadable: false,
    isGenerated: true,
    isActive: true,
  },
  {
    id: "66666666-6666-6666-6666-666666660009",
    code: "EVENT_PERMISSION",
    name: "Campus Event Permission",
    category: "non-academic",
    description: "Approved security clearance for Annual Tech Symposium & events.",
    allowedRoles: ["student", "faculty", "staff"],
    isUploadable: true,
    isGenerated: false,
    isActive: true,
  },
  {
    id: "66666666-6666-6666-6666-666666660010",
    code: "HOSTEL_PASS",
    name: "Hostel Gate & Room Pass",
    category: "non-academic",
    description: "Resident pass with biometric door authorization.",
    allowedRoles: ["student"],
    isUploadable: true,
    isGenerated: true,
    isActive: true,
  },
  {
    id: "66666666-6666-6666-6666-666666660011",
    code: "TRANSPORT_PASS",
    name: "Campus Transport Pass",
    category: "non-academic",
    description: "Valid pass for Metro Station shuttle departures.",
    allowedRoles: ["student", "faculty", "staff"],
    isUploadable: true,
    isGenerated: true,
    isActive: true,
  },
  {
    id: "66666666-6666-6666-6666-666666660012",
    code: "SOCIETY_MEMBERSHIP",
    name: "Technical Society Membership",
    category: "non-academic",
    description: "Official credential for registered student clubs and bodies.",
    allowedRoles: ["student"],
    isUploadable: true,
    isGenerated: false,
    isActive: true,
  },
  {
    id: "66666666-6666-6666-6666-666666660013",
    code: "SPORTS_CREDENTIAL",
    name: "Inter-College Sports Credential",
    category: "non-academic",
    description: "Recognized sports representation and medal certificate.",
    allowedRoles: ["student"],
    isUploadable: true,
    isGenerated: false,
    isActive: true,
  },
  {
    id: "66666666-6666-6666-6666-666666660014",
    code: "LAB_ACCESS",
    name: "Innovation Lab 24/7 Access",
    category: "non-academic",
    description: "Special security clearance for AI & Hardware Prototyping Labs.",
    allowedRoles: ["student", "faculty"],
    isUploadable: true,
    isGenerated: false,
    isActive: true,
  },
  {
    id: "66666666-6666-6666-6666-666666660015",
    code: "MEDICAL_LEAVE",
    name: "Medical Leave Certificate",
    category: "non-academic",
    description: "Official medical excuse and clinic certificate.",
    allowedRoles: ["student"],
    isUploadable: true,
    isGenerated: false,
    isActive: true,
  },
];

// In-memory runtime documents store for dynamic uploads during the session
let IN_MEMORY_UPLOADED_DOCUMENTS: CampusDocument[] = [];

/**
 * Retrieves the catalog of active document types.
 */
export async function getDocumentTypes(): Promise<DocumentType[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("document_types")
      .select("*")
      .eq("is_active", true)
      .order("name");

    if (!error && data && data.length > 0) {
      return data.map((d: any) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        category: d.category as DocumentCategory,
        description: d.description || undefined,
        allowedRoles: d.allowed_roles || ["student"],
        isUploadable: d.is_uploadable,
        isGenerated: d.is_generated,
        isActive: d.is_active,
      }));
    }
  } catch (_err) {
    // Offline fallback
  }

  return DEFAULT_DOCUMENT_TYPES;
}

/**
 * Lists documents for a given user profile or institutional ID.
 */
export async function listUserDocuments(
  userId: string,
  options?: { category?: string; query?: string }
): Promise<CampusDocument[]> {
  if (process.env.CAMPUSGRAM_DEMO_MODE === "true") {
    let demoDocs = [
      ...IN_MEMORY_UPLOADED_DOCUMENTS.filter(
        (d) => !d.ownerProfileId || d.ownerProfileId === userId
      ),
      ...MOCK_ACADEMIC_DOCUMENTS,
      ...MOCK_NON_ACADEMIC_DOCUMENTS,
    ];
    if (options?.category && options.category !== "all") {
      demoDocs = demoDocs.filter((d) => d.category === options.category);
    }
    if (options?.query) {
      const q = options.query.toLowerCase();
      demoDocs = demoDocs.filter((d) => d.title.toLowerCase().includes(q) || d.description.toLowerCase().includes(q));
    }
    return demoDocs;
  }

  let docs: CampusDocument[] = [];

  try {
    const supabase = await createClient();
    const query = supabase
      .from("documents")
      .select("*, document_types(icon_name)")
      .or(`owner_profile_id.eq.${userId},owner_institutional_user_id.eq.${userId}`)
      .order("created_at", { ascending: false });

    const { data, error } = await query;

    if (!error && data && data.length > 0) {
      docs = data.map((d: any) => ({
        id: d.id,
        title: d.title,
        category: d.category as DocumentCategory,
        description: d.description,
        status: d.status,
        statusVariant: d.status_variant,
        issuedDate: d.issued_date,
        documentNumber: d.document_number,
        validThrough: d.valid_through || undefined,
        iconName: (d.document_types?.icon_name || "file-text") as any,
        details: {
          issuer: d.issuer,
          verifiedBy: d.verified_by,
          referenceCode: d.reference_code,
          remarks: d.remarks || undefined,
        },
        storagePath: d.storage_path,
        originalFilename: d.original_filename,
        mimeType: d.mime_type,
        fileSize: d.file_size ? Number(d.file_size) : undefined,
        currentVersion: d.current_version,
        verifiedAt: d.verified_at,
        ownerProfileId: d.owner_profile_id,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      }));
    }
  } catch (_err) {
    // Offline / Supabase connection error
  }

  // If no documents found in DB (e.g. offline dev or unseeded local instance), use mock documents + in-memory uploads
  if (docs.length === 0) {
    docs = [
      ...IN_MEMORY_UPLOADED_DOCUMENTS.filter(
        (d) => !d.ownerProfileId || d.ownerProfileId === userId
      ),
      ...MOCK_ACADEMIC_DOCUMENTS,
      ...MOCK_NON_ACADEMIC_DOCUMENTS,
    ];
  } else {
    // Append any dynamic in-memory uploads
    docs = [
      ...IN_MEMORY_UPLOADED_DOCUMENTS.filter(
        (d) => !d.ownerProfileId || d.ownerProfileId === userId
      ),
      ...docs,
    ];
  }

  // Filter by category if requested
  if (options?.category && options.category !== "all") {
    docs = docs.filter((d) => d.category === options.category);
  }

  // Filter by search query if requested
  if (options?.query && options.query.trim().length > 0) {
    const q = options.query.toLowerCase().trim();
    docs = docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.documentNumber.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q)
    );
  }

  return docs;
}

/**
 * Retrieves a single document by its ID.
 */
export async function getDocumentById(documentId: string): Promise<CampusDocument | null> {
  // Check in-memory uploads first
  const inMemory = IN_MEMORY_UPLOADED_DOCUMENTS.find((d) => d.id === documentId);
  if (inMemory) return inMemory;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("documents")
      .select("*, document_types(icon_name)")
      .eq("id", documentId)
      .single();

    if (!error && data) {
      return {
        id: data.id,
        title: data.title,
        category: data.category as DocumentCategory,
        description: data.description,
        status: data.status,
        statusVariant: data.status_variant,
        issuedDate: data.issued_date,
        documentNumber: data.document_number,
        validThrough: data.valid_through || undefined,
        iconName: (data.document_types?.icon_name || "file-text") as any,
        details: {
          issuer: data.issuer,
          verifiedBy: data.verified_by,
          referenceCode: data.reference_code,
          remarks: data.remarks || undefined,
        },
        storagePath: data.storage_path,
        originalFilename: data.original_filename,
        mimeType: data.mime_type,
        fileSize: data.file_size ? Number(data.file_size) : undefined,
        currentVersion: data.current_version,
        verifiedAt: data.verified_at,
        ownerProfileId: data.owner_profile_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }
  } catch (_err) {
    // Offline lookup
  }

  // Fallback to static mock documents
  const allMocks = [...MOCK_ACADEMIC_DOCUMENTS, ...MOCK_NON_ACADEMIC_DOCUMENTS];
  return allMocks.find((d) => d.id === documentId) || null;
}

/**
 * Creates and registers a new document.
 */
export async function createDocument(
  userContext: { id: string; role: InstitutionalRole; fullName: string },
  request: CreateDocumentRequest,
  fileInfo?: {
    storagePath: string;
    originalFilename: string;
    mimeType: string;
    fileSize: number;
  }
): Promise<CampusDocument> {
  const docTypes = await getDocumentTypes();
  const matchedType = docTypes.find(
    (t) => t.code.toUpperCase() === request.documentTypeCode.toUpperCase()
  );

  if (!matchedType) {
    throw new Error(`Unknown document type: '${request.documentTypeCode}'`);
  }

  if (!canUploadDocumentType(userContext.role, matchedType)) {
    throw new Error(
      `Role '${userContext.role}' is not authorized to upload document type '${matchedType.name}'.`
    );
  }

  const generatedId = `doc-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const docNumber = `${matchedType.code.slice(0, 4)}-${new Date().getFullYear()}-${Math.floor(
    1000 + Math.random() * 9000
  )}`;
  const now = new Date();
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const issuedDate = request.issuedDate || `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
  const referenceCode = `CAMPUS-REG-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const newDoc: CampusDocument = {
    id: generatedId,
    title: request.title,
    category: request.category,
    description: request.description || matchedType.description || "Uploaded institutional document",
    status: userContext.role === "student" ? "Pending Verification" : "Verified",
    statusVariant: userContext.role === "student" ? "warning" : "success",
    issuedDate,
    documentNumber: docNumber,
    validThrough: request.validThrough,
    iconName: matchedType.category === "academic" ? "file-text" : "shield-check",
    details: {
      issuer: userContext.role === "student" ? "Student Upload Portal" : userContext.fullName,
      verifiedBy:
        userContext.role === "student"
          ? "Pending Staff Review"
          : "Smart Campus Registrar Cell",
      referenceCode,
      remarks: request.remarks || "Uploaded via CampusGram Document Management",
    },
    storagePath: fileInfo?.storagePath || null,
    originalFilename: fileInfo?.originalFilename || request.originalFilename || null,
    mimeType: fileInfo?.mimeType || request.mimeType || null,
    fileSize: fileInfo?.fileSize || request.fileSize || null,
    currentVersion: 1,
    ownerProfileId: userContext.id,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  // In demo mode or if Supabase is offline, save to in-memory store
  if (process.env.CAMPUSGRAM_DEMO_MODE === "true") {
    IN_MEMORY_UPLOADED_DOCUMENTS.unshift(newDoc);
    return newDoc;
  }

  // Try persisting to Supabase if available
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("documents")
      .insert({
        owner_profile_id: userContext.id,
        owner_institutional_user_id: userContext.id,
        document_type_id: matchedType.id,
        title: newDoc.title,
        category: newDoc.category,
        description: newDoc.description,
        document_number: newDoc.documentNumber,
        status: newDoc.status,
        status_variant: newDoc.statusVariant,
        storage_path: newDoc.storagePath,
        original_filename: newDoc.originalFilename,
        mime_type: newDoc.mimeType,
        file_size: newDoc.fileSize,
        issuer: newDoc.details.issuer,
        verified_by: newDoc.details.verifiedBy,
        reference_code: newDoc.details.referenceCode,
        issued_date: newDoc.issuedDate,
        valid_through: newDoc.validThrough,
        remarks: newDoc.details.remarks,
        current_version: 1,
      })
      .select()
      .single();

    if (!error && data) {
      newDoc.id = data.id;

      // Also create version and audit event
      if (fileInfo?.storagePath) {
        await supabase.from("document_versions").insert({
          document_id: data.id,
          version_number: 1,
          storage_path: fileInfo.storagePath,
          original_filename: fileInfo.originalFilename,
          mime_type: fileInfo.mimeType,
          file_size: fileInfo.fileSize,
          uploaded_by: userContext.id,
          change_summary: "Initial upload",
        });
      }

      await supabase.from("document_events").insert({
        document_id: data.id,
        actor_profile_id: userContext.id,
        event_type: "uploaded",
        event_metadata: {
          originalFilename: fileInfo?.originalFilename,
          fileSize: fileInfo?.fileSize,
        },
      });

      return newDoc;
    }
  } catch (_err) {
    // Offline mode; save in-memory
  }

  // Keep in memory for the active session
  IN_MEMORY_UPLOADED_DOCUMENTS.unshift(newDoc);
  return newDoc;
}

/**
 * Logs an audit event for document interactions (download, view, verify).
 */
export async function logDocumentEvent(
  documentId: string,
  actorId: string,
  eventType: "viewed" | "downloaded" | "verified" | "rejected",
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("document_events").insert({
      document_id: documentId,
      actor_profile_id: actorId,
      event_type: eventType,
      event_metadata: metadata || {},
    });
  } catch (_err) {
    // Silently proceed if audit store is offline
  }
}
