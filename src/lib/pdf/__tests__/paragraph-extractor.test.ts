/**
 * Unit tests for Paragraph Extraction Module.
 * Tests line grouping, paragraph detection, and text extraction utilities.
 */
import { describe, it, expect } from 'vitest'
import {
  _testing,
  extractFirstSentence,
  mergeParagraphText,
  ExtractedParagraph,
} from '../paragraph-extractor'

const { groupIntoLines, groupIntoParagraphs } = _testing

// Mock text item type
interface MockTextItem {
  str: string
  transform?: number[]
  width?: number
  height?: number
}

describe('Paragraph Extraction', () => {
  describe('groupIntoLines', () => {
    it('should return empty array for empty input', () => {
      expect(groupIntoLines([])).toEqual([])
    })

    it('should group items at same Y coordinate into one line', () => {
      const items: MockTextItem[] = [
        { str: 'Hello', transform: [1, 0, 0, 1, 100, 500] },
        { str: 'World', transform: [1, 0, 0, 1, 150, 500] },
      ]

      const lines = groupIntoLines(items)

      expect(lines.length).toBe(1)
      expect(lines[0].text).toContain('Hello')
      expect(lines[0].text).toContain('World')
    })

    it('should separate items at different Y coordinates into different lines', () => {
      const items: MockTextItem[] = [
        { str: 'Line 1', transform: [1, 0, 0, 1, 100, 500] },
        { str: 'Line 2', transform: [1, 0, 0, 1, 100, 480] },
      ]

      const lines = groupIntoLines(items)

      expect(lines.length).toBe(2)
      expect(lines[0].text).toBe('Line 1')
      expect(lines[1].text).toBe('Line 2')
    })

    it('should group items within proximity threshold (5px)', () => {
      const items: MockTextItem[] = [
        { str: 'Same', transform: [1, 0, 0, 1, 100, 500] },
        { str: 'Line', transform: [1, 0, 0, 1, 150, 503] }, // Within 5px
      ]

      const lines = groupIntoLines(items)

      expect(lines.length).toBe(1)
      expect(lines[0].text).toContain('Same')
      expect(lines[0].text).toContain('Line')
    })

    it('should sort lines from top to bottom (descending Y)', () => {
      const items: MockTextItem[] = [
        { str: 'Bottom', transform: [1, 0, 0, 1, 100, 100] },
        { str: 'Top', transform: [1, 0, 0, 1, 100, 500] },
        { str: 'Middle', transform: [1, 0, 0, 1, 100, 300] },
      ]

      const lines = groupIntoLines(items)

      expect(lines.length).toBe(3)
      expect(lines[0].text).toBe('Top')
      expect(lines[1].text).toBe('Middle')
      expect(lines[2].text).toBe('Bottom')
    })

    it('should handle items without transform', () => {
      const items: MockTextItem[] = [
        { str: 'NoTransform' },
        { str: 'WithTransform', transform: [1, 0, 0, 1, 100, 500] },
      ]

      const lines = groupIntoLines(items)

      // Items without transform default to y=0
      expect(lines.length).toBe(2)
    })
  })

  describe('groupIntoParagraphs', () => {
    it('should return empty array for empty input', () => {
      expect(groupIntoParagraphs([])).toEqual([])
    })

    it('should group closely spaced lines into one paragraph', () => {
      const lines = [
        { y: 500, text: 'First line of paragraph.', items: [] },
        { y: 488, text: 'Second line continues.', items: [] },
        { y: 476, text: 'Third line ends here.', items: [] },
      ]

      const paragraphs = groupIntoParagraphs(lines)

      expect(paragraphs.length).toBe(1)
      expect(paragraphs[0].text).toContain('First line')
      expect(paragraphs[0].text).toContain('Third line')
      expect(paragraphs[0].lineCount).toBe(3)
    })

    it('should split into separate paragraphs when gap > 15px', () => {
      const lines = [
        { y: 500, text: 'First paragraph.', items: [] },
        { y: 460, text: 'Second paragraph after gap.', items: [] }, // Gap of 40px
      ]

      const paragraphs = groupIntoParagraphs(lines)

      expect(paragraphs.length).toBe(2)
      expect(paragraphs[0].text).toBe('First paragraph.')
      expect(paragraphs[1].text).toBe('Second paragraph after gap.')
    })

    it('should calculate word count for each paragraph', () => {
      const lines = [
        { y: 500, text: 'One two three four five.', items: [] },
      ]

      const paragraphs = groupIntoParagraphs(lines)

      expect(paragraphs.length).toBe(1)
      expect(paragraphs[0].wordCount).toBe(5)
    })

    it('should set yStart and yEnd correctly', () => {
      const lines = [
        { y: 500, text: 'Start of paragraph.', items: [] },
        { y: 488, text: 'End of paragraph.', items: [] },
      ]

      const paragraphs = groupIntoParagraphs(lines)

      expect(paragraphs.length).toBe(1)
      expect(paragraphs[0].yStart).toBe(500)
      expect(paragraphs[0].yEnd).toBe(488)
    })

    it('should filter out empty paragraphs', () => {
      const lines = [
        { y: 500, text: '   ', items: [] }, // Empty after trim
        { y: 460, text: 'Actual content here.', items: [] },
      ]

      const paragraphs = groupIntoParagraphs(lines)

      expect(paragraphs.length).toBe(1)
      expect(paragraphs[0].text).toBe('Actual content here.')
    })

    it('should handle multiple paragraphs', () => {
      const lines = [
        { y: 700, text: 'Paragraph 1 line 1.', items: [] },
        { y: 688, text: 'Paragraph 1 line 2.', items: [] },
        { y: 640, text: 'Paragraph 2 line 1.', items: [] }, // Gap > 15
        { y: 628, text: 'Paragraph 2 line 2.', items: [] },
        { y: 580, text: 'Paragraph 3.', items: [] }, // Gap > 15
      ]

      const paragraphs = groupIntoParagraphs(lines)

      expect(paragraphs.length).toBe(3)
      expect(paragraphs[0].lineCount).toBe(2)
      expect(paragraphs[1].lineCount).toBe(2)
      expect(paragraphs[2].lineCount).toBe(1)
    })
  })

  describe('extractFirstSentence', () => {
    it('should extract first sentence ending with period', () => {
      const text = 'This is the first sentence. This is the second.'
      // Note: extractFirstSentence trims the result
      expect(extractFirstSentence(text)).toBe('This is the first sentence.')
    })

    it('should extract first sentence ending with question mark', () => {
      const text = 'What is a derivative? It measures change.'
      expect(extractFirstSentence(text)).toBe('What is a derivative?')
    })

    it('should extract first sentence ending with exclamation', () => {
      const text = 'Hello there! Welcome to the course.'
      expect(extractFirstSentence(text)).toBe('Hello there!')
    })

    it('should handle Chinese sentence endings', () => {
      const text = '这是导数的定义。这是第二句话。'
      expect(extractFirstSentence(text)).toBe('这是导数的定义。')
    })

    it('should cap at 100 characters', () => {
      const longText = 'A'.repeat(150)
      const result = extractFirstSentence(longText)
      expect(result.length).toBeLessThanOrEqual(100)
    })

    it('should truncate with ellipsis if > 80 characters', () => {
      const longSentence = 'A'.repeat(90) + '.'
      const result = extractFirstSentence(longSentence)
      expect(result).toMatch(/\.\.\.$/);
      expect(result.length).toBe(80)
    })

    it('should handle text without sentence endings', () => {
      const text = 'No sentence ending here'
      const result = extractFirstSentence(text)
      expect(result).toBe('No sentence ending here')
    })
  })

  describe('mergeParagraphText', () => {
    it('should merge empty array to empty string', () => {
      expect(mergeParagraphText([])).toBe('')
    })

    it('should return single paragraph text as-is', () => {
      const paragraphs: ExtractedParagraph[] = [
        {
          text: 'Single paragraph text.',
          wordCount: 3,
          yStart: 500,
          yEnd: 488,
          lineCount: 1,
        },
      ]

      expect(mergeParagraphText(paragraphs)).toBe('Single paragraph text.')
    })

    it('should join multiple paragraphs with double newlines', () => {
      const paragraphs: ExtractedParagraph[] = [
        {
          text: 'First paragraph.',
          wordCount: 2,
          yStart: 500,
          yEnd: 488,
          lineCount: 1,
        },
        {
          text: 'Second paragraph.',
          wordCount: 2,
          yStart: 440,
          yEnd: 428,
          lineCount: 1,
        },
      ]

      const result = mergeParagraphText(paragraphs)
      expect(result).toBe('First paragraph.\n\nSecond paragraph.')
    })

    it('should handle paragraphs with various word counts', () => {
      const paragraphs: ExtractedParagraph[] = [
        {
          text: 'Short.',
          wordCount: 1,
          yStart: 500,
          yEnd: 500,
          lineCount: 1,
        },
        {
          text: 'A much longer paragraph with many more words in it.',
          wordCount: 10,
          yStart: 450,
          yEnd: 430,
          lineCount: 2,
        },
      ]

      const result = mergeParagraphText(paragraphs)
      expect(result).toContain('Short.')
      expect(result).toContain('A much longer paragraph')
      expect(result.split('\n\n').length).toBe(2)
    })
  })
})
