/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['postgres', 'nodemailer'],
  experimental: { serverActions: { bodySizeLimit: '3mb' } }, // medical certificates up to 2 MB
};
export default nextConfig;
