import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental (ISR) cache is configured: every page is rendered on demand
// or prerendered at build time. Add an R2 incremental cache here if ISR /
// revalidate is introduced later.
export default defineCloudflareConfig({});
