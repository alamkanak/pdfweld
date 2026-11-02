import type { SiteConfig } from "./site-config.mjs";
export function generateSeo(
  site: SiteConfig,
  directory?: string,
): Promise<void>;
export function escapeHtml(value: unknown): string;
export function jsonScript(value: unknown): string;
export function pageHead(
  site: SiteConfig,
  page: null | {
    id: string;
    slug: string;
    title: string;
    summary: string;
    label: string;
  },
  defaults: { title: string; description: string },
): string;
