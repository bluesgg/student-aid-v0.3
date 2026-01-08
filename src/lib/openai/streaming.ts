/**
 * Server-Sent Events (SSE) streaming utilities for OpenAI responses.
 */

import { Stream } from 'openai/streaming'
import { ChatCompletionChunk } from 'openai/resources/chat/completions'

export interface StreamingResult {
  stream: ReadableStream<Uint8Array>
  contentPromise: Promise<string>
  tokenTracker: TokenTracker
}

export interface TokenTracker {
  inputTokens: number
  outputTokens: number
  firstTokenReceived: boolean
}

/**
 * Create a ReadableStream from an OpenAI streaming response.
 * Also tracks token counts and whether first token was received.
 */
export function createStreamingResponse(
  openaiStream: Stream<ChatCompletionChunk>,
  onComplete?: (content: string, tokens: TokenTracker) => void
): StreamingResult {
  const tokenTracker: TokenTracker = {
    inputTokens: 0,
    outputTokens: 0,
    firstTokenReceived: false,
  }

  let fullContent = ''
  let resolveContent: (content: string) => void
  const contentPromise = new Promise<string>((resolve) => {
    resolveContent = resolve
  })

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of openaiStream) {
          // Extract content from chunk
          const content = chunk.choices[0]?.delta?.content || ''

          if (content) {
            if (!tokenTracker.firstTokenReceived) {
              tokenTracker.firstTokenReceived = true
            }

            fullContent += content

            // Estimate output tokens (rough approximation)
            tokenTracker.outputTokens += Math.ceil(content.length / 4)

            // Send SSE formatted data
            const sseData = `data: ${JSON.stringify({ content, done: false })}\n\n`
            controller.enqueue(encoder.encode(sseData))
          }

          // Check for finish reason
          if (chunk.choices[0]?.finish_reason) {
            // Get usage if available (some models provide it)
            if (chunk.usage) {
              tokenTracker.inputTokens = chunk.usage.prompt_tokens
              tokenTracker.outputTokens = chunk.usage.completion_tokens
            }
          }
        }

        // Send completion signal
        const doneData = `data: ${JSON.stringify({ content: '', done: true })}\n\n`
        controller.enqueue(encoder.encode(doneData))
        controller.close()

        // Resolve content promise
        resolveContent(fullContent)

        // Call completion callback
        onComplete?.(fullContent, tokenTracker)
      } catch (error) {
        console.error('Streaming error:', error)
        const errorData = `data: ${JSON.stringify({ error: 'Streaming failed', done: true })}\n\n`
        controller.enqueue(encoder.encode(errorData))
        controller.close()
        resolveContent(fullContent)
      }
    },
  })

  return {
    stream,
    contentPromise,
    tokenTracker,
  }
}

/**
 * Create a streaming HTTP response with proper headers.
 */
export function createSSEResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

/**
 * Parse SSE events from a fetch response (client-side use).
 */
export async function* parseSSEStream(
  response: Response
): AsyncGenerator<{ content: string; done: boolean; error?: string }> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Response body is not readable')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })

      // Parse SSE events from buffer
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            yield data
            if (data.done) {
              return
            }
          } catch {
            // Ignore invalid JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
