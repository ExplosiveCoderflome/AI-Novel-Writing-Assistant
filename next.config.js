/*
 * @LastEditors: biz
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    transpilePackages: ['@ant-design/icons', '@ant-design/pro-components', '@ant-design/cssinjs'],
    images: {
        domains: ['api.openai.com', 'api.anthropic.com', 'api.cohere.ai'],
    },
    serverExternalPackages: ['undici', 'puppeteer-core', 'puppeteer'],
    webpack: (config, { isServer }) => {
        if (isServer) {
            config.externals = [...config.externals, 'puppeteer'];
        }
        config.resolve.alias = {
            ...config.resolve.alias,
            '@': './app',
        };
        return config;
    },
    headers: async() => {
        return [{
            source: '/:path*',
            headers: [{
                key: 'Content-Security-Policy',
                value: "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-eval' 'unsafe-inline';"
            }]
        }];
    },
    experimental: {
        appDir: true,
    },
};

module.exports = nextConfig;