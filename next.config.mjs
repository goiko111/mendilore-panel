/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"]
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cf.bstatic.com" },
      { protocol: "https", hostname: "q-xx.bstatic.com" }
    ]
  }
};

export default nextConfig;
