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

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
}

function formatSSE(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

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

            controller.enqueue(encoder.encode(formatSSE({ content, done: false })))
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

        controller.enqueue(encoder.encode(formatSSE({ content: '', done: true })))
        controller.close()

        // Resolve content promise
        resolveContent(fullContent)

        // Call completion callback
        onComplete?.(fullContent, tokenTracker)
      } catch (error) {
        console.error('Streaming error:', error)
        controller.enqueue(encoder.encode(formatSSE({ error: 'Streaming failed', done: true })))
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

export function createSSEResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, { headers: SSE_HEADERS })
}

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
