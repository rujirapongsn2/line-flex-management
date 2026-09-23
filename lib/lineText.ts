/**
 * LINE text messages do not render Markdown — strip common Markdown
 * so customers never see **bold** or # headings as raw characters.
 */
export function stripMarkdownForLine(raw: string): string {
  let s = String(raw || "");
  if (!s) return s;

  s = s.replace(/```[\w-]*\n?([\s\S]*?)```/g, (_m, inner: string) =>
    String(inner || "").trim()
  );
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, "$1");
  s = s.replace(/___(.+?)___/g, "$1");
  s = s.replace(/\*\*(.+?)\*\*/g, "$1");
  s = s.replace(/__(.+?)__/g, "$1");
  // single-asterisk / underscore emphasis (best-effort)
  s = s.replace(/(^|\s)\*([^\s*][^*]*?)\*(?=\s|$|[.,!?;:])/gm, "$1$2");
  s = s.replace(/(^|\s)_([^\s_][^_]*?)_(?=\s|$|[.,!?;:])/gm, "$1$2");
  s = s.replace(/^\s*[-*+]\s+/gm, "• ");
  s = s.replace(/^\s*(\d+)\.\s+/gm, "$1) ");
  s = s.replace(/\*{1,3}/g, "");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}
