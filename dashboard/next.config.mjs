/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  ...(process.env.BUILD_STANDALONE === 'true' ? { output: 'standalone' } : {}),
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  experimental: {
    devtoolSegmentExplorer: false,
    proxyTimeout: 120000,
  },
  async rewrites() {
    const backendApiUrl = process.env.NEXT_BACKEND_API_URL ?? 'http://127.0.0.1:8000/api/v1/codynex';
    const backendOrigin = backendApiUrl.replace(/\/api\/v1\/codynex\/?$/, '');
    return [
      {
        source: '/api/v1/codynex/:path*',
        destination: `${backendApiUrl}/:path*`,
      },
      {
        source: '/preview/:path*',
        destination: `${backendOrigin}/preview/:path*`,
      },
      {
        source: '/live/:path*',
        destination: `${backendOrigin}/live/:path*`,
      },
    ];
  },
};

export default nextConfig;
