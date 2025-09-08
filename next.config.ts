import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import WebpackObfuscator from 'webpack-obfuscator';

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      config.plugins.push(
        new WebpackObfuscator({
          compact: true,
          controlFlowFlattening: false,
          deadCodeInjection: false,
          debugProtection:true,
          debugProtectionInterval: 4000,
          disableConsoleOutput: false,
          identifierNamesGenerator: 'hexadecimal',
          log: true, // Window.close error when enabled
          numbersToExpressions: true,
          renameGlobals: false,
          selfDefending: true,
          simplify: true,
          splitStrings: false, // plotly.js error when enabled
          stringArray: true,
          stringArrayCallsTransform: false,
          stringArrayEncoding: [],
          stringArrayIndexShift: true,
          stringArrayRotate: true,
          stringArrayShuffle: true,
          stringArrayWrappersCount: 1,
          stringArrayWrappersChainedCalls: true,
          stringArrayWrappersParametersMaxCount: 2,
          stringArrayWrappersType: 'function',
          stringArrayThreshold: 0.75,
          unicodeEscapeSequence: false
        },
          [
            // "node_modules/**",
            // ".next/**",
            // "public/**"
          ])
      );
    }

    return config;
  },
  turbopack: {
    root: __dirname,
  },
};

const withNextIntl = createNextIntlPlugin(
  './app/utils/i18n/request.ts'
);

// export default nextConfig;
export default withNextIntl(nextConfig);
