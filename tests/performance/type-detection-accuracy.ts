/**
 * Type Detection Accuracy Validation Script
 *
 * Validates the PDF type detection algorithm against sample PDFs.
 * Target: >90% accuracy on classification.
 *
 * Run with:
 *   npx tsx tests/performance/type-detection-accuracy.ts
 *
 * Expected directory structure:
 *   tests/fixtures/pdf-samples/
 *     ppt/          - PPT-style PDFs (expected: 'ppt')
 *     textbook/     - Text-heavy PDFs (expected: 'text')
 */

import * as fs from 'fs'
import * as path from 'path'

// Type definitions to match the actual implementation
interface TypeDetectionResult {
  type: 'ppt' | 'text'
  score: number
  details: {
    imageAreaScore: number
    textDensityScore: number
    layoutScore: number
    metadataScore: number
  }
}

interface TestCase {
  filename: string
  filepath: string
  expectedType: 'ppt' | 'text'
  actualType?: 'ppt' | 'text'
  score?: number
  details?: TypeDetectionResult['details']
  passed?: boolean
}

interface AccuracyReport {
  totalTests: number
  passed: number
  failed: number
  accuracy: number
  pptAccuracy: number
  textAccuracy: number
  results: TestCase[]
  timestamp: string
}

// Configuration
const FIXTURES_DIR = path.join(process.cwd(), 'tests/fixtures/pdf-samples')
const REPORT_OUTPUT = path.join(process.cwd(), 'tests/performance/type-detection-report.json')
const PPT_THRESHOLD = 0.6 // Score threshold for PPT classification

/**
 * Mock implementation of PDF type detection for validation
 * In actual usage, this would import from @/lib/pdf/type-detector
 */
async function detectPdfType(buffer: Buffer): Promise<TypeDetectionResult> {
  // This is a placeholder - in actual implementation, import from the module
  // import { identifyPdfType } from '@/lib/pdf/type-detector'

  // For now, we'll provide a mock that simulates the expected behavior
  // Replace with actual import when running in the project context

  try {
    // Dynamic import to handle module resolution
    const typeDetector = await import('../../src/lib/pdf/type-detector')
    const result = await typeDetector.identifyPdfType(buffer)

    // Get detailed scores from breakdown if available
    const breakdown = result.breakdown || {
      imageAreaScore: 0,
      textDensityScore: 0,
      layoutScore: 0,
      metadataScore: 0,
      totalScore: result.type === 'ppt' ? 0.7 : 0.4,
      type: result.type,
    }

    return {
      type: result.type,
      score: breakdown.totalScore,
      details: {
        imageAreaScore: breakdown.imageAreaScore,
        textDensityScore: breakdown.textDensityScore,
        layoutScore: breakdown.layoutScore,
        metadataScore: breakdown.metadataScore,
      },
    }
  } catch (importError) {
    console.warn('Could not import type detector, using mock implementation')
    // Mock implementation for testing the script structure
    return mockDetectPdfType(buffer)
  }
}

/**
 * Mock PDF type detection for testing script structure
 */
function mockDetectPdfType(buffer: Buffer): TypeDetectionResult {
  // Simple heuristic based on file size (just for demo)
  const sizeMB = buffer.length / (1024 * 1024)

  // Typically PPT exports are smaller per page
  const baseScore = sizeMB < 1 ? 0.4 : 0.3

  // Random variation for testing
  const variation = (Math.random() - 0.5) * 0.4

  const score = Math.max(0, Math.min(1, baseScore + variation))

  return {
    type: score > PPT_THRESHOLD ? 'ppt' : 'text',
    score,
    details: {
      imageAreaScore: Math.random() * 0.5,
      textDensityScore: Math.random() * 0.3,
      layoutScore: Math.random() * 0.2,
      metadataScore: Math.random() * 0.1,
    },
  }
}

/**
 * Discover PDF files in a directory
 */
function discoverPdfs(directory: string, expectedType: 'ppt' | 'text'): TestCase[] {
  const testCases: TestCase[] = []

  if (!fs.existsSync(directory)) {
    console.warn(`Directory not found: ${directory}`)
    return testCases
  }

  const files = fs.readdirSync(directory)

  for (const file of files) {
    if (file.toLowerCase().endsWith('.pdf')) {
      testCases.push({
        filename: file,
        filepath: path.join(directory, file),
        expectedType,
      })
    }
  }

  return testCases
}

/**
 * Run type detection on a single PDF
 */
async function runTest(testCase: TestCase): Promise<TestCase> {
  try {
    const buffer = fs.readFileSync(testCase.filepath)
    const result = await detectPdfType(buffer)

    return {
      ...testCase,
      actualType: result.type,
      score: result.score,
      details: result.details,
      passed: result.type === testCase.expectedType,
    }
  } catch (error) {
    console.error(`Error testing ${testCase.filename}:`, error)
    return {
      ...testCase,
      passed: false,
    }
  }
}

/**
 * Calculate accuracy metrics
 */
function calculateAccuracy(results: TestCase[]): {
  total: number
  passed: number
  accuracy: number
  pptAccuracy: number
  textAccuracy: number
} {
  const total = results.length
  const passed = results.filter((r) => r.passed).length

  const pptResults = results.filter((r) => r.expectedType === 'ppt')
  const pptPassed = pptResults.filter((r) => r.passed).length
  const pptAccuracy = pptResults.length > 0 ? (pptPassed / pptResults.length) * 100 : 0

  const textResults = results.filter((r) => r.expectedType === 'text')
  const textPassed = textResults.filter((r) => r.passed).length
  const textAccuracy = textResults.length > 0 ? (textPassed / textResults.length) * 100 : 0

  return {
    total,
    passed,
    accuracy: (passed / total) * 100,
    pptAccuracy,
    textAccuracy,
  }
}

/**
 * Generate accuracy report
 */
function generateReport(results: TestCase[]): AccuracyReport {
  const metrics = calculateAccuracy(results)

  return {
    totalTests: metrics.total,
    passed: metrics.passed,
    failed: metrics.total - metrics.passed,
    accuracy: metrics.accuracy,
    pptAccuracy: metrics.pptAccuracy,
    textAccuracy: metrics.textAccuracy,
    results,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Print report to console
 */
function printReport(report: AccuracyReport): void {
  console.log('\n========================================')
  console.log('PDF Type Detection Accuracy Report')
  console.log('========================================\n')

  console.log(`Total Tests: ${report.totalTests}`)
  console.log(`Passed: ${report.passed}`)
  console.log(`Failed: ${report.failed}`)
  console.log(`\nOverall Accuracy: ${report.accuracy.toFixed(2)}%`)
  console.log(`PPT Detection Accuracy: ${report.pptAccuracy.toFixed(2)}%`)
  console.log(`Text Detection Accuracy: ${report.textAccuracy.toFixed(2)}%`)

  // Target check
  const targetMet = report.accuracy >= 90
  console.log(`\nTarget (>90%): ${targetMet ? 'PASSED' : 'FAILED'}`)

  // Failed cases
  const failedCases = report.results.filter((r) => !r.passed)
  if (failedCases.length > 0) {
    console.log('\n--- Failed Cases ---')
    for (const testCase of failedCases) {
      console.log(`\n  File: ${testCase.filename}`)
      console.log(`  Expected: ${testCase.expectedType}`)
      console.log(`  Actual: ${testCase.actualType}`)
      console.log(`  Score: ${testCase.score?.toFixed(3)}`)
      if (testCase.details) {
        console.log('  Details:')
        console.log(`    Image Area: ${testCase.details.imageAreaScore.toFixed(3)}`)
        console.log(`    Text Density: ${testCase.details.textDensityScore.toFixed(3)}`)
        console.log(`    Layout: ${testCase.details.layoutScore.toFixed(3)}`)
        console.log(`    Metadata: ${testCase.details.metadataScore.toFixed(3)}`)
      }
    }
  }

  console.log('\n========================================\n')
}

/**
 * Suggest weight adjustments based on results
 */
function suggestWeightAdjustments(report: AccuracyReport): void {
  if (report.accuracy >= 90) {
    console.log('No weight adjustments needed - target accuracy met.')
    return
  }

  console.log('\n--- Weight Adjustment Suggestions ---\n')

  const failedPpt = report.results.filter((r) => r.expectedType === 'ppt' && !r.passed)
  const failedText = report.results.filter((r) => r.expectedType === 'text' && !r.passed)

  if (failedPpt.length > failedText.length) {
    console.log('More PPT PDFs misclassified as text.')
    console.log('Suggestions:')
    console.log('  - Increase image area weight (current: 0.4)')
    console.log('  - Lower PPT threshold (current: 0.6)')
    console.log('  - Add metadata patterns for presentation software')
  } else if (failedText.length > failedPpt.length) {
    console.log('More text PDFs misclassified as PPT.')
    console.log('Suggestions:')
    console.log('  - Increase text density weight (current: 0.3)')
    console.log('  - Raise PPT threshold (current: 0.6)')
    console.log('  - Add word count per page check')
  }

  // Analyze score distribution
  const avgScoreFailedPpt = failedPpt.reduce((sum, r) => sum + (r.score || 0), 0) / (failedPpt.length || 1)
  const avgScoreFailedText = failedText.reduce((sum, r) => sum + (r.score || 0), 0) / (failedText.length || 1)

  if (avgScoreFailedPpt > 0) {
    console.log(`\nFailed PPT average score: ${avgScoreFailedPpt.toFixed(3)}`)
    if (avgScoreFailedPpt < 0.5) {
      console.log('  → PPT scores are too low. Check image detection algorithm.')
    }
  }

  if (avgScoreFailedText > 0) {
    console.log(`Failed text average score: ${avgScoreFailedText.toFixed(3)}`)
    if (avgScoreFailedText > 0.5) {
      console.log('  → Text scores are too high. Check text density calculation.')
    }
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('Starting PDF Type Detection Accuracy Validation...\n')

  // Discover test PDFs
  const pptDir = path.join(FIXTURES_DIR, 'ppt')
  const textDir = path.join(FIXTURES_DIR, 'textbook')

  const pptTests = discoverPdfs(pptDir, 'ppt')
  const textTests = discoverPdfs(textDir, 'text')

  const allTests = [...pptTests, ...textTests]

  if (allTests.length === 0) {
    console.error('No test PDFs found!')
    console.log('\nExpected directory structure:')
    console.log('  tests/fixtures/pdf-samples/')
    console.log('    ppt/          - PPT-style PDFs')
    console.log('    textbook/     - Text-heavy PDFs')
    console.log('\nPlease add sample PDFs to run validation.')

    // Create sample directories for convenience
    fs.mkdirSync(pptDir, { recursive: true })
    fs.mkdirSync(textDir, { recursive: true })
    console.log('\nCreated sample directories. Add PDFs and re-run.')
    return
  }

  console.log(`Found ${pptTests.length} PPT samples and ${textTests.length} text samples.`)
  console.log('Running type detection...\n')

  // Run tests
  const results: TestCase[] = []

  for (const testCase of allTests) {
    console.log(`Testing: ${testCase.filename}...`)
    const result = await runTest(testCase)
    results.push(result)
    console.log(`  → ${result.passed ? 'PASS' : 'FAIL'} (${result.actualType}, score: ${result.score?.toFixed(3)})`)
  }

  // Generate report
  const report = generateReport(results)

  // Print report
  printReport(report)

  // Save report to file
  fs.writeFileSync(REPORT_OUTPUT, JSON.stringify(report, null, 2))
  console.log(`Report saved to: ${REPORT_OUTPUT}`)

  // Suggest improvements if needed
  suggestWeightAdjustments(report)

  // Exit with error code if target not met
  if (report.accuracy < 90) {
    console.error('\nValidation FAILED: Accuracy below 90% target.')
    process.exit(1)
  }
}

// Run if called directly
main().catch((error) => {
  console.error('Validation failed with error:', error)
  process.exit(1)
})

export {
  detectPdfType,
  discoverPdfs,
  runTest,
  calculateAccuracy,
  generateReport,
  type TypeDetectionResult,
  type TestCase,
  type AccuracyReport,
}
