import { NextResponse } from "next/server";
import fs from "node:fs";
import { query as dbQuery } from "@/lib/db";

// --- local RAG services (this Mac) ---
const EG2_URL = process.env.EG2_URL || "http://127.0.0.1:8081";
const EG2_MODEL = process.env.EG2_MODEL || "embeddinggemma-2";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const AGENT_LLM = process.env.AGENT_LLM || "qwen3:8b";

// --- cloud providers (works anywhere, needs an API key in .env.local) ---
//   ASK_PROVIDER=auto|local|openrouter|nvidia
//   OPENROUTER_API_KEY=sk-or-...  +  ASK_MODEL=<id from openrouter.ai/models>
//   NVIDIA_API_KEY=nvapi-...      +  ASK_MODEL=meta/llama-3.1-8b-instruct
const ASK_PROVIDER = (process.env.ASK_PROVIDER || "auto").toLowerCase();

const INDEX_PATH =
    process.env.RAG_INDEX_PATH ||
    "/Volumes/2TBSSD/anilexternal/Documents/rag-eg2/index.json";
const MENUS_PATH =
    process.env.RAG_MENUS_PATH ||
    "/Volumes/2TBSSD/anilexternal/Documents/rag-eg2/menus.json";
const QUERY_PREFIX = "task: search result | query: ";
const TOP_K = 3;

type MenuRecord = {
    id: string;
    title: string;
    neighborhood: string;
    cuisine: string;
    price_range: string;
    address: string;
    vec_img?: number[];
    vec_txt?: number[];
    vec_menu?: number[];
};

type Source = { id: string; title: string; neighborhood?: string | null; score: number };

let cache: { records: MenuRecord[]; menus: Record<string, any> } | null = null;

function loadStore() {
    if (cache) return cache;
    const records: MenuRecord[] = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")).records;
    let menus: Record<string, any> = {};
    try {
        menus = JSON.parse(fs.readFileSync(MENUS_PATH, "utf8"));
    } catch {
        menus = {};
    }
    cache = { records, menus };
    return cache;
}

function cos(a: number[], b: number[]): number {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot; // vectors are L2-normalized
}

function tableOf(menus: Record<string, any>, id: string): string {
    const e = menus[id];
    if (e && e.status === "ok" && e.table) return String(e.table);
    return "";
}

// The agent must not name its sources: strip top-hit restaurant names
// (incl. "at <name>" phrasing and markdown-bold variants) from the answer.
function stripSourceNames(text: string, names: string[]): string {
    let out = text;
    for (const name of names) {
        if (!name) continue;
        const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        out = out
            .replace(new RegExp(`\\s+(?:at|from|in|bei|im|von)\\s+(?:the\\s+)?${esc}`, "gi"), "")
            .replace(new RegExp(`\\*\\*${esc}\\*\\*`, "gi"), "")
            .replace(new RegExp(esc, "gi"), "");
    }
    return out
        .replace(/\*{2,}/g, "")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\s+([.,!?])/g, "$1")
        .trim();
}

// ---------------------------------------------------------------- local ---
async function embed(text: string): Promise<number[]> {
    const res = await fetch(`${EG2_URL}/v1/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: EG2_MODEL, input: QUERY_PREFIX + text }),
        signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`embedding server ${res.status}`);
    const data = await res.json();
    return data.data[0].embedding as number[];
}

async function askLocal(
    question: string,
    history: string
): Promise<{ answer: string; sources: Source[] }> {
    const { records, menus } = loadStore();
    const q = await embed(question); // throws when llama-server is down

    const scored = records.map((r) => {
        const menu = r.vec_menu && r.vec_menu.length ? r.vec_menu : r.vec_txt!;
        const txt = r.vec_txt!;
        const sMenu = cos(menu, q);
        const sTxt = cos(txt, q);
        const sImg = r.vec_img && r.vec_img.length ? cos(r.vec_img, q) : -1;
        const best = Math.max(sMenu, sTxt, sImg);
        return { r, best };
    });
    scored.sort((a, b) => b.best - a.best);
    const top = scored.slice(0, TOP_K);

    const context = top
        .map(({ r }, i) => {
            const table = tableOf(menus, r.id);
            return [
                `--- Menu ${i + 1}: ${r.title} (${r.neighborhood || ""}, ${r.cuisine || ""}, ${r.address || ""}) ---`,
                table || "(no table)",
            ].join("\n");
        })
        .join("\n\n");

    const prompt = [
        "You are an assistant that knows the menus of döner/kebab restaurants in Berlin.",
        "Answer the user's question USING ONLY the menu tables below.",
        "Rules:",
        "- Always answer in English, no matter the question's language.",
        "- Only state dishes and prices found in the tables, never invent any.",
        "- Never write the name of any restaurant, even if the question mentions one; refer only to dishes and prices.",
        "- If a price is not in the tables, say you couldn't find it.",
        "",
        history ? `Previous conversation:\n${history}\n` : "",
        `Menu tables:\n${context}`,
        "",
        `Question: ${question}`,
    ].join("\n");

    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: AGENT_LLM,
            stream: false,
            think: false,
            messages: [{ role: "user", content: prompt }],
            options: { temperature: 0.2, num_ctx: 8192, num_predict: 512 },
        }),
        signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}`);
    const data = await res.json();
    let answer = String(data.message?.content || "").trim() || "(empty answer)";
    answer = stripSourceNames(answer, top.map(({ r }) => r.title));
    return {
        answer,
        sources: top.map(({ r, best }) => ({
            id: r.id,
            title: r.title,
            neighborhood: r.neighborhood,
            score: Number(best.toFixed(4)),
        })),
    };
}

// ---------------------------------------------------------------- cloud ---
function cloudConfig(provider: "openrouter" | "nvidia") {
    if (provider === "openrouter") {
        const key = process.env.OPENROUTER_API_KEY || "";
        if (!key) throw new Error("OPENROUTER_API_KEY yok (.env.local'a ekleyin)");
        return {
            base: "https://openrouter.ai/api/v1",
            key,
            model: process.env.ASK_MODEL || "deepseek/deepseek-chat-v3-0324:free",
            extraHeaders: {
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "Explores Berlin Ask AI",
            } as Record<string, string>,
        };
    }
    const key = process.env.NVIDIA_API_KEY || "";
    if (!key) throw new Error("NVIDIA_API_KEY yok (.env.local'a ekleyin)");
    return {
        base: "https://integrate.api.nvidia.com/v1",
        key,
        model: process.env.ASK_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b",
        extraHeaders: {} as Record<string, string>,
    };
}

function parseCloudReply(text: string, knownSlugs: Set<string>): { answer: string; slugs: string[] } {
    // Expected tail line:  SOURCES: ["slug-a", "slug-b"]
    let slugs: string[] = [];
    const m = text.match(/SOURCES:\s*\[([^\]]*)\]/i);
    if (m) {
        slugs = m[1]
            .split(",")
            .map((s) => s.trim().replace(/^["']|["']$/g, ""))
            .filter((s) => knownSlugs.has(s))
            .slice(0, TOP_K);
    }
    const answer = text
        .replace(/SOURCES:\s*\[[^\]]*\]/i, "")
        .replace(/```json[\s\S]*?```/g, "")
        .replace(/```[\s\S]*?```/g, "")
        .trim();
    return { answer, slugs };
}

async function askCloud(
    question: string,
    history: string,
    provider: "openrouter" | "nvidia"
): Promise<{ answer: string; sources: Source[] }> {
    const cfg = cloudConfig(provider);
    // Menus come straight from Postgres: single source of truth, no local files needed.
    const rows = (
        await dbQuery(
            `SELECT slug, name, neighborhood, menu_md FROM places
             WHERE menu_md IS NOT NULL AND menu_md <> '' ORDER BY name`
        )
    ).rows as { slug: string; name: string; neighborhood: string; menu_md: string }[];
    if (!rows.length) throw new Error("veritabanında menü yok");

    const known = new Set(rows.map((r) => r.slug));
    const context = rows.map((r) => `### slug: ${r.slug} | ${r.name}\n${r.menu_md}`).join("\n\n");

    const prompt = [
        "You are an assistant that knows the menus of döner/kebab restaurants in Berlin.",
        "Answer the user's question USING ONLY the menu tables below.",
        "Rules:",
        "- Always answer in English, no matter the question's language.",
        "- Only state dishes and prices found in the tables, never invent any.",
        "- Never write the name of any restaurant, even if the question mentions one; refer only to dishes and prices.",
        "- If a price is not in the tables, say you couldn't find it.",
        '- At the very end, on its own line, write: SOURCES: ["slug-1", "slug-2"] with up to 3 menu slugs you used, most relevant first.',
        "",
        history ? `Previous conversation:\n${history}\n` : "",
        `Menu tables:\n${context}`,
        "",
        `Question: ${question}`,
    ].join("\n");

    const res = await fetch(`${cfg.base}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.key}`,
            ...cfg.extraHeaders,
        },
        body: JSON.stringify({
            model: cfg.model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
            max_tokens: 1024,
        }),
        signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`${provider} ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = String(data.choices?.[0]?.message?.content || "").trim();
    if (!text) throw new Error(`${provider}: boş cevap`);
    const { answer, slugs } = parseCloudReply(text, known);
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    const sources: Source[] = slugs.map((slug, i) => ({
        id: slug,
        title: bySlug.get(slug)!.name,
        neighborhood: bySlug.get(slug)!.neighborhood,
        score: Number((0.9 - i * 0.1).toFixed(2)),
    }));
    return { answer: answer || "(empty answer)", sources };
}

// ---------------------------------------------------------------- handler ---
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const question = String(body.message || body.question || "").trim();
        if (!question) {
            return NextResponse.json({ error: "empty question" }, { status: 400 });
        }
        const history: string = Array.isArray(body.history)
            ? body.history
                  .slice(-4)
                  .map((m: any) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
                  .join("\n")
            : "";

        const provider = ASK_PROVIDER;
        try {
            if (provider === "local") return NextResponse.json(await askLocal(question, history));
            if (provider === "openrouter" || provider === "nvidia") {
                return NextResponse.json(await askCloud(question, history, provider));
            }
            // auto: local first, cloud fallback
            try {
                return NextResponse.json(await askLocal(question, history));
            } catch (e: any) {
                if (process.env.OPENROUTER_API_KEY) {
                    return NextResponse.json(await askCloud(question, history, "openrouter"));
                }
                if (process.env.NVIDIA_API_KEY) {
                    return NextResponse.json(await askCloud(question, history, "nvidia"));
                }
                throw e;
            }
        } catch (e: any) {
            const msg = String(e?.message || "hata");
            const status = /yok|ulaşılamadı|Failed to fetch|fetch failed|ECONNREFUSED/i.test(msg) ? 503 : 500;
            return NextResponse.json({ error: msg }, { status });
        }
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "hata" }, { status: 500 });
    }
}
