import { llmsTxt } from "@/lib/seo/llms";

/** /llms.txt: the shop for AI assistants (see lib/seo/llms.ts). Rebuilt hourly. */
export const revalidate = 3600;

export async function GET() {
  return new Response(await llmsTxt(), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
