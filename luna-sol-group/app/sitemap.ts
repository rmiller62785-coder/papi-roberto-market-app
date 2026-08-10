import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://luna-sol-group.rmiller62785.chatgpt.site";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/work", "/work/psa", "/work/hopskipdrive", "/work/maid-of-the-mist", "/capabilities", "/about", "/diagnostic", "/tools", "/tools/executive-operations-studio", "/tools/implementation-workbench", "/tools/backlog-recovery-calculator", "/tools/constraint-diagnostic", "/insights", "/insights/backlog-recovery-planning", "/insights/cost-of-delay-operating-queues", "/insights/validate-constraints-before-staffing", "/experience/amazon", "/approach"];

  return routes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}
