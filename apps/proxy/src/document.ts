import { resolveDisplayLocale, LOCALE_COOKIE } from "@pomona/contract";
import type { Env } from "./types";

export async function serveLocalizedDocument(request: Request, assets: NonNullable<Env["ASSETS"]>): Promise<Response> {
  const saved = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${LOCALE_COOKIE}=`))?.slice(LOCALE_COOKIE.length + 1);
  const locale = resolveDisplayLocale(saved, request.headers.get("Accept-Language"));
  const source = await assets.fetch(request);
  if (!source.ok || !source.headers.get("content-type")?.includes("text/html")) return source;
  const headers = new Headers(source.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.delete("etag");
  headers.delete("content-length");
  const response = new Response(source.body, { status: source.status, headers });
  return new HTMLRewriter().on("html", { element(element) {
    element.setAttribute("lang", locale);
    element.setAttribute("data-pomona-locale", locale);
  } }).transform(response);
}
