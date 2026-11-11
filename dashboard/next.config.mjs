/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.BUILD_STANDALONE === 'true' ? { output: 'standalone' } : {}),
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    const backendApiUrl = process.env.NEXT_BACKEND_API_URL ?? 'http://127.0.0.1:8000/api/v1/codynex';
    return [
      {
        source: '/api/v1/codynex/:path*',
        destination: `${backendApiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
