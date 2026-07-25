import type { MetadataRoute } from "next";

const siteUrl = "https://lunasolgroup.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/work/psa", "/work/hopskipdrive", "/work/maid-of-the-mist", "/diagnostic", "/tools/backlog-recovery-calculator", "/tools/constraint-diagnostic", "/experience/amazon", "/approach"];

  return routes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}
