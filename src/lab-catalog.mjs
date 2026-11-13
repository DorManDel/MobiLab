// MobiLab discovery engine: framework-free, pure sorting/search helpers.
// Usage data stays local to this browser. No analytics or network request.
export const ACTIVITY_KEY = "mobilab.catalog.activity.v1";
export const PREFS_KEY = "mobilab.catalog.preferences.v1";

export function normalizeSearch(value) {
  return String(value ?? "").normalize("NFKD").toLocaleLowerCase().trim().replace(/\s+/g, " ");
}

export function loadActivity(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(ACTIVITY_KEY) || "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const safe = {};
    for (const [id, entry] of Object.entries(raw).slice(0, 200)) {
      if (!/^[a-z0-9-]{1,40}$/.test(id) || !entry || typeof entry !== "object") continue;
      const visits = Number(entry.visits);
      const lastOpened = Number(entry.lastOpened);
      safe[id] = {
        visits: Number.isFinite(visits) ? Math.max(0, Math.min(1000000, Math.floor(visits))) : 0,
        lastOpened: Number.isFinite(lastOpened) ? Math.max(0, lastOpened) : 0
      };
    }
    return safe;
  } catch {
    return {};
  }
}

export function recordVisit(storage, id, now = Date.now()) {
  const activity = loadActivity(storage);
  if (!/^[a-z0-9-]{1,40}$/.test(id)) return activity;
  const previous = activity[id] || { visits: 0, lastOpened: 0 };
  activity[id] = { visits: Math.min(1000000, previous.visits + 1), lastOpened: Number.isFinite(now) ? Math.max(0, now) : Date.now() };
  try { storage?.setItem(ACTIVITY_KEY, JSON.stringify(activity)); } catch { /* Private mode / blocked storage. */ }
  return activity;
}

export function loadPreferences(storage) {
  try {
    const value = JSON.parse(storage?.getItem(PREFS_KEY) || "{}");
    return {
      sort: ["recommended", "popular", "recently-opened", "recently-updated", "alphabetical"].includes(value?.sort) ? value.sort : "recommended",
      category: ["all", "hardware", "creative", "tools", "ideas"].includes(value?.category) ? value.category : "all"
    };
  } catch {
    return { sort: "recommended", category: "all" };
  }
}

export function savePreferences(storage, prefs) {
  try { storage?.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* Optional preference. */ }
}

function queryScore(entry, tokens) {
  if (!tokens.length) return 0;
  const title = normalizeSearch(entry.title);
  const keywords = normalizeSearch(entry.keywords);
  const body = normalizeSearch([entry.description, entry.category].join(" "));
  let points = 0;
  for (const token of tokens) {
    if (title.includes(token)) points += title.startsWith(token) ? 12 : 9;
    else if (keywords.includes(token)) points += 6;
    else if (body.includes(token)) points += 3;
    else return -1; // Every query word must match somewhere.
  }
  return points;
}

export function filterAndSort(entries, { query = "", sort = "recommended", category = "all", activity = {}, now = Date.now() } = {}) {
  const tokens = normalizeSearch(query).split(" ").filter(Boolean);
  const filtered = entries.map((entry, index) => ({
    ...entry,
    originalIndex: index,
    relevance: queryScore(entry, tokens),
    visits: activity[entry.id]?.visits || 0,
    lastOpened: activity[entry.id]?.lastOpened || 0,
    updatedAt: /^\d{4}-\d{2}-\d{2}$/.test(entry.updated || "") ? Date.parse(entry.updated + "T00:00:00Z") || 0 : 0
  })).filter(entry => (category === "all" || entry.category === category) && entry.relevance >= 0);

  const recentScore = (entry) => entry.lastOpened > 0
    ? Math.max(0, 12 - Math.max(0, now - entry.lastOpened) / 86400000 / 3) : 0;
  const recommendedScore = (entry) => Math.log2(entry.visits + 1) * 5 + recentScore(entry);
  filtered.sort((a, b) => {
    // Search relevance always comes first when there is a query.
    if (tokens.length && b.relevance !== a.relevance) return b.relevance - a.relevance;
    if (sort === "popular" && b.visits !== a.visits) return b.visits - a.visits;
    if (sort === "recently-opened" && b.lastOpened !== a.lastOpened) return b.lastOpened - a.lastOpened;
    if (sort === "recently-updated" && b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    if (sort === "alphabetical") {
      const alpha = a.title.localeCompare(b.title, "en");
      if (alpha) return alpha;
    }
    if (sort === "recommended") {
      const diff = recommendedScore(b) - recommendedScore(a);
      if (diff) return diff;
    }
    return a.originalIndex - b.originalIndex;
  });
  return filtered;
}
