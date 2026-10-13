import { NextResponse } from "next/server";
import fs from "node:fs";

const EG2_URL = process.env.EG2_URL || "http://127.0.0.1:8081";
const EG2_MODEL = process.env.EG2_MODEL || "embeddinggemma-2";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const AGENT_LLM = process.env.AGENT_LLM || "qwen3:8b";
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

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { history } = body;
        const question = String(body.message || body.question || "").trim();
        if (!question) {
            return NextResponse.json({ error: "empty question" }, { status: 400 });
        }

        const { records, menus } = loadStore();
        let q: number[];
        try {
            q = await embed(question);
        } catch {
            return NextResponse.json(
                { error: "Embedding servisine ulaşılamadı (llama-server :8081 çalışıyor mu?)" },
                { status: 503 }
            );
        }

        const scored = records.map((r) => {
            const menu = r.vec_menu && r.vec_menu.length ? r.vec_menu : r.vec_txt!;
            const txt = r.vec_txt!;
            const sMenu = cos(menu, q);
            const sTxt = cos(txt, q);
            const sImg = r.vec_img && r.vec_img.length ? cos(r.vec_img, q) : -1;
            const best = Math.max(sMenu, sTxt, sImg);
            return { r, best, sMenu };
        });
        scored.sort((a, b) => b.best - a.best);
        const top = scored.slice(0, TOP_K);

        const context = top
            .map(({ r }, i) => {
                const table = tableOf(menus, r.id);
                return [
                    `--- Menü ${i + 1}: ${r.title} (${r.neighborhood || ""}, ${r.cuisine || ""}, ${r.address || ""}) ---`,
                    table || "(tablo yok)",
                ].join("\n");
            })
            .join("\n\n");

        const past = Array.isArray(history)
            ? history.slice(-4).map((m: any) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`).join("\n")
            : "";

        const prompt = [
            "You are an assistant that knows the menus of döner/kebab restaurants in Berlin.",
            "Answer the user's question USING ONLY the menu tables below.",
            "Rules:",
            "- Always answer in English, no matter the question's language.",
            "- Only state dishes and prices found in the tables, never invent any.",
            "- Never write the name of any restaurant, even if the question mentions one; refer only to dishes and prices.",
            "- If a price is not in the tables, say you couldn't find it.",
            "",
            past ? `Previous conversation:\n${past}\n` : "",
            `Menu tables:\n${context}`,
            "",
            `Question: ${question}`,
        ].join("\n");

        let answer: string;
        try {
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
            answer = String(data.message?.content || "").trim() || "(boş cevap)";
            answer = stripSourceNames(answer, top.map(({ r }) => r.title));
        } catch {
            return NextResponse.json(
                { error: "Cevap modeline ulaşılamadı (Ollama :11434 çalışıyor mu?)" },
                { status: 503 }
            );
        }

        return NextResponse.json({
            answer,
            sources: top.map(({ r, best }) => ({
                id: r.id,
                title: r.title,
                neighborhood: r.neighborhood,
                score: Number(best.toFixed(4)),
            })),
        });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "hata" }, { status: 500 });
    }
}
