/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // separate build dir lets the fork e2e server run beside the Aevum dev server
  distDir: process.env.NEXT_DIST_DIR || ".next",
  webpack: (config, { webpack }) => {
    // Optional peer deps of wagmi/walletconnect/coinbase SDKs that Autorail never loads.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^(@x402\/|@react-native-async-storage\/async-storage$)/ }));
    return config;
  },
};
export default nextConfig;
