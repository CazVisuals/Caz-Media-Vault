import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Constant’s Hub",
    short_name: "Constant’s Hub",
    description: "Private household cinema",
    start_url: "/tv",
    display: "standalone",
    background_color: "#05070b",
    theme_color: "#05070b",
    orientation: "any",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }],
  };
}
