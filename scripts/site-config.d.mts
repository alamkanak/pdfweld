export function githubRepository(
  value: unknown,
): { owner: string; name: string } | null;
export type SiteConfig = {
  url: string | null;
  base: string;
  cname: string | null;
  verification?: string;
};
export function siteConfig(options?: {
  env?: Record<string, string | undefined>;
  remote?: string;
  cname?: string;
}): SiteConfig;
