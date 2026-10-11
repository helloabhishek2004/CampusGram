// Development/test-only compatibility store. Production Lost & Found routes
// use the Supabase repository in apps/web/lib/lost-found/repository.ts and
// must never silently fall back here when Supabase is configured.
import fs from 'fs';
import path from 'path';

// Keep the local fallback database inside this checkout instead of relying on a
// developer-specific absolute path. Set LOST_FOUND_LOCAL_DB_PATH to override it
// when the web app and worker need to share a different location.
function findWorkspaceRoot(start: string): string {
    let current = path.resolve(start);
    while (true) {
        if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) return current;
        const parent = path.dirname(current);
        if (parent === current) return path.resolve(start);
        current = parent;
    }
}

const DB_PATH = path.resolve(
    process.env.LOST_FOUND_LOCAL_DB_PATH ||
        path.join(findWorkspaceRoot(process.cwd()), 'modules/lost-and-found/data/db.json'),
);

if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}
if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({
        lost_found_items: [],
        lost_found_matches: [],
        lost_found_claims: [],
        lost_found_contact_reveals: [],
        lost_found_item_events: [],
    }, null, 2));
}

export const readDb = () => {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
};

export const writeDb = (data: Record<string, unknown[]>) => {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};
