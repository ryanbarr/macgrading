import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker runtime image; bundles
  // workspace deps (@macgrading/shared) so the image needs no node_modules.
  output: "standalone",
};

export default nextConfig;
