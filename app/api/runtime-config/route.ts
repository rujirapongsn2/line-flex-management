import { NextRequest, NextResponse } from "next/server";
import {
  parseRuntimeBody,
  readRuntimeConfig,
  toRuntimeStatus,
  writeRuntimeConfig,
} from "@/lib/serverRuntimeConfig";
import { isAuthError, requireAuth } from "@/lib/requireAuth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const cfg = await readRuntimeConfig();
  return NextResponse.json({
    ok: true,
    config: {
      agent: cfg.agent,
      line: cfg.line,
      templates: cfg.templates,
    },
    ...toRuntimeStatus(cfg),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const partial = parseRuntimeBody(body);
  if (!partial.agent && !partial.line && !partial.templates) {
    return NextResponse.json(
      {
        ok: false,
        error: "Body must include agent, line, and/or templates",
      },
      { status: 400 }
    );
  }

  try {
    const saved = await writeRuntimeConfig(partial);
    return NextResponse.json({
      ok: true,
      config: {
        agent: saved.agent,
        line: saved.line,
        templates: saved.templates,
      },
      ...toRuntimeStatus(saved),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[runtime-config] write failed", msg);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 }
    );
  }
}
