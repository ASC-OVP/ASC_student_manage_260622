import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "*.app.github.dev",
    "*.preview.app.github.dev",
    "*.githubpreview.dev",
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
    "172.17.*.*",
    "172.18.*.*",
    "172.19.*.*",
    "172.20.*.*",
    "172.21.*.*",
    "172.22.*.*",
    "172.23.*.*",
    "172.24.*.*",
    "172.25.*.*",
    "172.26.*.*",
    "172.27.*.*",
    "172.28.*.*",
    "172.29.*.*",
    "172.30.*.*",
    "172.31.*.*",
  ],
  experimental: {
    serverActions: {
      // OMR uploads are scanned PDFs/images, so keep this above the app batch limit.
      bodySizeLimit: "200mb",
      allowedOrigins: [
        "*.app.github.dev",
        "*.preview.app.github.dev",
        "*.githubpreview.dev",
        "192.168.*.*",
        "10.*.*.*",
        "172.16.*.*",
        "172.17.*.*",
        "172.18.*.*",
        "172.19.*.*",
        "172.20.*.*",
        "172.21.*.*",
        "172.22.*.*",
        "172.23.*.*",
        "172.24.*.*",
        "172.25.*.*",
        "172.26.*.*",
        "172.27.*.*",
        "172.28.*.*",
        "172.29.*.*",
        "172.30.*.*",
        "172.31.*.*",
      ],
    },
  },
};

export default nextConfig;
