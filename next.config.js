/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{
      source: "/shortcuts/slothly-health-sync.shortcut",
      headers: [
        { key: "Content-Type", value: "application/octet-stream" },
        { key: "Content-Disposition", value: 'attachment; filename="slothly-health-sync.shortcut"' },
      ],
    }, {
      source: "/shortcuts/slothly-health-read-check.shortcut",
      headers: [
        { key: "Content-Type", value: "application/octet-stream" },
        { key: "Content-Disposition", value: 'attachment; filename="slothly-health-read-check.shortcut"' },
      ],
    }];
  },
};

module.exports = nextConfig;
