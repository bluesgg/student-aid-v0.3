// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,

  // Environment identification
  environment: process.env.NODE_ENV,

  // Performance Monitoring: Capture 10% of transactions for performance monitoring
  tracesSampleRate: 0.1,

  // Only enable in production
  enabled: process.env.NODE_ENV === 'production',

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Replay helps you understand what the user was doing before an error occurred
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,

  // Filter out sensitive data
  beforeSend(event) {
    // Remove sensitive data from breadcrumbs
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
        if (breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr') {
          // Remove sensitive headers
          if (breadcrumb.data?.headers) {
            delete breadcrumb.data.headers['authorization']
            delete breadcrumb.data.headers['cookie']
          }
        }
        return breadcrumb
      })
    }

    return event
  },
})
