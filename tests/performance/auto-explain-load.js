/**
 * k6 Load Test: Auto-Explain Window Mode
 *
 * Tests the performance of the sliding window auto-explain feature
 * under concurrent user load.
 *
 * Run with:
 *   k6 run tests/performance/auto-explain-load.js
 *
 * With options:
 *   k6 run --vus 10 --duration 60s tests/performance/auto-explain-load.js
 *   k6 run --env BASE_URL=http://localhost:3000 tests/performance/auto-explain-load.js
 */

import http from 'k6/http'
import { check, sleep, group } from 'k6'
import { Counter, Rate, Trend } from 'k6/metrics'

// Custom metrics
const sessionCreated = new Counter('sessions_created')
const sessionFailed = new Counter('sessions_failed')
const sessionSuccess = new Rate('session_success_rate')
const sessionLatency = new Trend('session_latency_ms')
const statusPollLatency = new Trend('status_poll_latency_ms')
const stickerGenerationTime = new Trend('sticker_generation_time_ms')

// Test configuration
export const options = {
  // Stages for ramp-up and ramp-down
  stages: [
    { duration: '30s', target: 5 },   // Ramp up to 5 users
    { duration: '1m', target: 10 },   // Hold at 10 users
    { duration: '30s', target: 10 },  // Sustained load
    { duration: '30s', target: 0 },   // Ramp down
  ],

  // Thresholds for pass/fail criteria
  thresholds: {
    'http_req_duration': ['p(95)<5000'],   // 95% of requests under 5s
    'session_success_rate': ['rate>0.90'], // 90% success rate
    'session_latency_ms': ['p(95)<3000'],  // Session creation under 3s
    'status_poll_latency_ms': ['p(95)<500'], // Status polling under 500ms
    'http_req_failed': ['rate<0.1'],       // Less than 10% errors
  },

  // Tags for results organization
  tags: {
    test_type: 'load_test',
    feature: 'auto_explain_window',
  },
}

// Environment configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '' // Set via environment
const TEST_COURSE_ID = __ENV.TEST_COURSE_ID || 'test-course-id'
const TEST_FILE_ID = __ENV.TEST_FILE_ID || 'test-file-id'

// Helper to get auth headers
function getHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  }
  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`
  }
  return headers
}

// Main test scenario
export default function () {
  group('Auto-Explain Window Flow', () => {
    const headers = getHeaders()
    const randomPage = Math.floor(Math.random() * 50) + 1 // Random page 1-50

    // Step 1: Create auto-explain session
    group('Create Session', () => {
      const startTime = Date.now()

      const createResponse = http.post(
        `${BASE_URL}/api/ai/explain-page`,
        JSON.stringify({
          courseId: TEST_COURSE_ID,
          fileId: TEST_FILE_ID,
          page: randomPage,
          pdfType: 'Lecture',
          locale: 'en',
          mode: 'window',
        }),
        { headers, tags: { name: 'create_session' } }
      )

      const latency = Date.now() - startTime
      sessionLatency.add(latency)

      const success = check(createResponse, {
        'session created (202)': (r) => r.status === 202,
        'has session id': (r) => {
          try {
            const body = JSON.parse(r.body)
            return body.sessionId !== undefined
          } catch {
            return false
          }
        },
        'has window range': (r) => {
          try {
            const body = JSON.parse(r.body)
            return body.windowRange && body.windowRange.start && body.windowRange.end
          } catch {
            return false
          }
        },
      })

      if (success) {
        sessionCreated.add(1)
        sessionSuccess.add(1)

        // Parse session ID for subsequent requests
        const body = JSON.parse(createResponse.body)
        const sessionId = body.sessionId

        // Step 2: Poll for progress (simulate user waiting)
        group('Poll Session Status', () => {
          let completed = false
          let pollCount = 0
          const maxPolls = 30 // Max 30 polls (60 seconds at 2s interval)

          while (!completed && pollCount < maxPolls) {
            const pollStart = Date.now()

            const statusResponse = http.get(
              `${BASE_URL}/api/ai/explain-page/session/${sessionId}`,
              { headers, tags: { name: 'poll_status' } }
            )

            const pollLatency = Date.now() - pollStart
            statusPollLatency.add(pollLatency)

            check(statusResponse, {
              'status poll successful': (r) => r.status === 200,
            })

            if (statusResponse.status === 200) {
              try {
                const statusBody = JSON.parse(statusResponse.body)
                const state = statusBody.data?.state

                if (state === 'completed' || state === 'canceled') {
                  completed = true
                  const totalTime = Date.now() - startTime
                  stickerGenerationTime.add(totalTime)
                }
              } catch {
                // Ignore parse errors
              }
            }

            pollCount++
            if (!completed) {
              sleep(2) // Poll every 2 seconds
            }
          }
        })

        // Step 3: Simulate window update (scroll)
        group('Update Window', () => {
          const newPage = randomPage + 2 // Scroll forward 2 pages

          const updateResponse = http.patch(
            `${BASE_URL}/api/ai/explain-page/session/${sessionId}`,
            JSON.stringify({
              currentPage: newPage,
              action: 'extend',
            }),
            { headers, tags: { name: 'update_window' } }
          )

          check(updateResponse, {
            'window update successful': (r) => r.status === 200,
          })
        })

        // Step 4: Cleanup - cancel session
        group('Cancel Session', () => {
          const cancelResponse = http.del(
            `${BASE_URL}/api/ai/explain-page/session/${sessionId}`,
            null,
            { headers, tags: { name: 'cancel_session' } }
          )

          check(cancelResponse, {
            'session canceled': (r) => r.status === 200,
          })
        })
      } else {
        sessionFailed.add(1)
        sessionSuccess.add(0)

        // Log error for debugging
        console.error(`Session creation failed: ${createResponse.status} - ${createResponse.body}`)
      }
    })
  })

  // Pause between iterations
  sleep(Math.random() * 3 + 2) // 2-5 second random delay
}

// Setup function - runs once at start
export function setup() {
  console.log(`Starting load test against ${BASE_URL}`)
  console.log(`Test Course ID: ${TEST_COURSE_ID}`)
  console.log(`Test File ID: ${TEST_FILE_ID}`)

  // Verify API is accessible
  const healthCheck = http.get(`${BASE_URL}/api/health`, { timeout: '10s' })
  if (healthCheck.status !== 200) {
    console.warn('API health check failed, tests may not work correctly')
  }

  return {
    startTime: new Date().toISOString(),
  }
}

// Teardown function - runs once at end
export function teardown(data) {
  console.log(`Load test completed`)
  console.log(`Started at: ${data.startTime}`)
  console.log(`Ended at: ${new Date().toISOString()}`)
}

// Separate scenario for version management load test
export function versionManagementScenario() {
  const headers = getHeaders()
  const testStickerId = __ENV.TEST_STICKER_ID || 'test-sticker-id'

  group('Sticker Version Management', () => {
    // Test refresh endpoint
    group('Refresh Sticker', () => {
      const refreshResponse = http.post(
        `${BASE_URL}/api/ai/explain-page/sticker/${testStickerId}/refresh`,
        null,
        { headers, tags: { name: 'refresh_sticker' } }
      )

      check(refreshResponse, {
        'refresh initiated': (r) => r.status === 200 || r.status === 429, // 429 = debounce
      })
    })

    sleep(5) // Wait for debounce period

    // Test version switch
    group('Switch Version', () => {
      const switchResponse = http.patch(
        `${BASE_URL}/api/ai/explain-page/sticker/${testStickerId}/version`,
        JSON.stringify({ version: 1 }),
        { headers, tags: { name: 'switch_version' } }
      )

      check(switchResponse, {
        'version switched': (r) => r.status === 200,
      })
    })
  })
}

// Concurrent session rejection test
export function concurrentSessionTest() {
  const headers = getHeaders()

  group('Concurrent Session Test', () => {
    // Try to create two sessions for the same file
    const session1 = http.post(
      `${BASE_URL}/api/ai/explain-page`,
      JSON.stringify({
        courseId: TEST_COURSE_ID,
        fileId: TEST_FILE_ID,
        page: 1,
        pdfType: 'Lecture',
        locale: 'en',
        mode: 'window',
      }),
      { headers }
    )

    // Immediately try second session
    const session2 = http.post(
      `${BASE_URL}/api/ai/explain-page`,
      JSON.stringify({
        courseId: TEST_COURSE_ID,
        fileId: TEST_FILE_ID,
        page: 10,
        pdfType: 'Lecture',
        locale: 'en',
        mode: 'window',
      }),
      { headers }
    )

    check(session1, {
      'first session created': (r) => r.status === 202,
    })

    check(session2, {
      'second session rejected with 409': (r) => r.status === 409,
    })

    // Cleanup first session
    if (session1.status === 202) {
      const body = JSON.parse(session1.body)
      http.del(`${BASE_URL}/api/ai/explain-page/session/${body.sessionId}`, null, { headers })
    }
  })
}

// Rate limit test
export function rateLimitTest() {
  const headers = getHeaders()

  group('Rate Limit Test', () => {
    const testStickerId = __ENV.TEST_STICKER_ID || 'test-sticker-id'

    // Rapid refresh requests
    for (let i = 0; i < 5; i++) {
      const response = http.post(
        `${BASE_URL}/api/ai/explain-page/sticker/${testStickerId}/refresh`,
        null,
        { headers }
      )

      if (i === 0) {
        check(response, {
          'first refresh succeeds': (r) => r.status === 200,
        })
      } else {
        check(response, {
          'subsequent refreshes debounced': (r) => r.status === 429,
        })
      }

      sleep(0.5) // 500ms between requests
    }
  })
}
