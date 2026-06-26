import type { NextConfig } from "next";

const baseAllowedOrigins = [
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
];

const codespaceName = process.env.CODESPACE_NAME;
const codespaceAllowedOrigins = codespaceName
  ? [
      `${codespaceName}-3000.app.github.dev`,
      `${codespaceName}-3000.preview.app.github.dev`,
      `${codespaceName}-3000.app.github.dev:443`,
      `${codespaceName}-3000.app.github.dev:3000`,
    ]
  : [];

const allowedOrigins = Array.from(new Set([...baseAllowedOrigins, ...codespaceAllowedOrigins]));

const nextConfig: NextConfig = {
  allowedDevOrigins: allowedOrigins,
  experimental: {
    serverActions: {
      // OMR uploads are scanned PDFs/images, so keep this above the app batch limit.
      bodySizeLimit: "200mb",
      allowedOrigins,
    },
  },
};

export default nextConfig;
