import { llmsFullTxt } from "@/lib/seo/llms";

/** /llms-full.txt: llms.txt plus every product with price, sizes and stock. Rebuilt hourly. */
export const revalidate = 3600;

export async function GET() {
  return new Response(await llmsFullTxt(), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
