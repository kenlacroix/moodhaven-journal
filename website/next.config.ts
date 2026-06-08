import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/founders",
        destination: "/about",
        permanent: true,
      },
      {
        source: "/blog/how-i-tried-to-break-my-own-encrypted-journal",
        destination: "/blog/stress-testing-the-privacy-in-your-journal",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
