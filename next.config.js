const { withSentryConfig } = require('@sentry/nextjs')
const createNextIntlPlugin = require('next-intl/plugin')

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // React strict mode for development
  reactStrictMode: true,

  // Skip ESLint during builds - lint should run as a separate CI step
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Experimental features
  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: '10mb',
    },
    // Don't bundle pdfjs-dist for server - it has browser-specific code
    // that fails when bundled by webpack
    serverComponentsExternalPackages: ['pdfjs-dist'],
  },

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
  },

  // Webpack configuration for PDF.js worker
  webpack: (config) => {
    config.resolve.alias.canvas = false
    config.resolve.alias.encoding = false
    return config
  },
}

// Sentry configuration options
const sentryWebpackPluginOptions = {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Only upload source maps in production
  silent: process.env.NODE_ENV !== 'production',

  // Upload source maps to Sentry
  widenClientFileUpload: true,

  // Hide source maps from generated client bundles
  hideSourceMaps: true,

  // Automatically tree-shake Sentry logger statements
  disableLogger: true,
}

// Export with Sentry if DSN is configured, otherwise export plain config
// Chain plugins: withNextIntl wraps the config first
const configWithIntl = withNextIntl(nextConfig)

module.exports = process.env.SENTRY_DSN
  ? withSentryConfig(configWithIntl, sentryWebpackPluginOptions)
  : configWithIntl
