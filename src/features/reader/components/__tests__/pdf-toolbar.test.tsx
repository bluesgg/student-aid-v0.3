/**
 * @vitest-environment jsdom
 *
 * Component tests for PdfToolbar.
 * Tests navigation, zoom, reader mode, and selection mode controls.
 * Note: Auto-explain button has been moved to StickerPanel.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PdfToolbar } from '../pdf-toolbar'

describe('PdfToolbar', () => {
  const defaultProps = {
    currentPage: 1,
    totalPages: 100,
    scale: 1,
    zoomMode: 'fit-width' as const,
    onPageChange: vi.fn(),
    onScaleChange: vi.fn(),
    onZoomModeChange: vi.fn(),
    onPreviousPage: vi.fn(),
    onNextPage: vi.fn(),
    canGoPrevious: false,
    canGoNext: true,
  }

  describe('Navigation Controls', () => {
    it('should call onPreviousPage when previous button is clicked', () => {
      const onPreviousPage = vi.fn()

      render(
        <PdfToolbar
          {...defaultProps}
          onPreviousPage={onPreviousPage}
          canGoPrevious={true}
        />
      )

      const button = screen.getByTitle('Previous page')
      fireEvent.click(button)

      expect(onPreviousPage).toHaveBeenCalledTimes(1)
    })

    it('should disable previous button when canGoPrevious is false', () => {
      render(
        <PdfToolbar
          {...defaultProps}
          canGoPrevious={false}
        />
      )

      const button = screen.getByTitle('Previous page')
      expect(button).toHaveProperty('disabled', true)
    })

    it('should call onNextPage when next button is clicked', () => {
      const onNextPage = vi.fn()

      render(
        <PdfToolbar
          {...defaultProps}
          onNextPage={onNextPage}
          canGoNext={true}
        />
      )

      const button = screen.getByTitle('Next page')
      fireEvent.click(button)

      expect(onNextPage).toHaveBeenCalledTimes(1)
    })

    it('should disable next button when canGoNext is false', () => {
      render(
        <PdfToolbar
          {...defaultProps}
          canGoNext={false}
        />
      )

      const button = screen.getByTitle('Next page')
      expect(button).toHaveProperty('disabled', true)
    })
  })

  describe('Page Input', () => {
    it('should display current page in input', () => {
      render(
        <PdfToolbar
          {...defaultProps}
          currentPage={25}
          totalPages={100}
        />
      )

      const input = screen.getByRole('textbox')
      expect(input).toHaveProperty('value', '25')
    })

    it('should display total pages', () => {
      render(
        <PdfToolbar
          {...defaultProps}
          totalPages={150}
        />
      )

      expect(screen.getByText('/ 150')).toBeDefined()
    })

    it('should have a form for page input', () => {
      render(<PdfToolbar {...defaultProps} />)
      const input = screen.getByRole('textbox')
      expect(input.closest('form')).not.toBeNull()
    })

    
  })

  describe('Zoom Controls', () => {
    it('should call onScaleChange when zoom in button is clicked', () => {
      const onScaleChange = vi.fn()
      const onZoomModeChange = vi.fn()

      render(
        <PdfToolbar
          {...defaultProps}
          scale={1}
          onScaleChange={onScaleChange}
          onZoomModeChange={onZoomModeChange}
        />
      )

      const button = screen.getByTitle('Zoom in')
      fireEvent.click(button)

      expect(onZoomModeChange).toHaveBeenCalledWith('custom')
      expect(onScaleChange).toHaveBeenCalledWith(1.25)
    })

    it('should call onScaleChange when zoom out button is clicked', () => {
      const onScaleChange = vi.fn()
      const onZoomModeChange = vi.fn()

      render(
        <PdfToolbar
          {...defaultProps}
          scale={1}
          onScaleChange={onScaleChange}
          onZoomModeChange={onZoomModeChange}
        />
      )

      const button = screen.getByTitle('Zoom out')
      fireEvent.click(button)

      expect(onZoomModeChange).toHaveBeenCalledWith('custom')
      expect(onScaleChange).toHaveBeenCalledWith(0.75)
    })

    it('should disable zoom out button at minimum scale', () => {
      render(
        <PdfToolbar
          {...defaultProps}
          scale={0.25}
        />
      )

      const button = screen.getByTitle('Zoom out')
      expect(button).toHaveProperty('disabled', true)
    })

    it('should disable zoom in button at maximum scale', () => {
      render(
        <PdfToolbar
          {...defaultProps}
          scale={3}
        />
      )

      const button = screen.getByTitle('Zoom in')
      expect(button).toHaveProperty('disabled', true)
    })
  })

  describe('Reader Mode Toggle', () => {
    it('should render reader mode toggle when onReaderModeChange is provided', () => {
      render(
        <PdfToolbar
          {...defaultProps}
          onReaderModeChange={vi.fn()}
          readerMode="page"
        />
      )

      const radioGroup = screen.getByRole('radiogroup', { name: 'Reading mode' })
      expect(radioGroup).toBeDefined()
    })

    it('should call onReaderModeChange when scroll mode is selected', () => {
      const onReaderModeChange = vi.fn()

      render(
        <PdfToolbar
          {...defaultProps}
          onReaderModeChange={onReaderModeChange}
          readerMode="page"
        />
      )

      const scrollButton = screen.getByTitle('Continuous scroll view')
      fireEvent.click(scrollButton)

      expect(onReaderModeChange).toHaveBeenCalledWith('scroll')
    })

    it('should call onReaderModeChange when page mode is selected', () => {
      const onReaderModeChange = vi.fn()

      render(
        <PdfToolbar
          {...defaultProps}
          onReaderModeChange={onReaderModeChange}
          readerMode="scroll"
        />
      )

      const pageButton = screen.getByTitle('Single page view')
      fireEvent.click(pageButton)

      expect(onReaderModeChange).toHaveBeenCalledWith('page')
    })
  })

  describe('Selection Mode Toggle', () => {
    it('should render selection mode button when onSelectionModeChange is provided', () => {
      render(
        <PdfToolbar
          {...defaultProps}
          onSelectionModeChange={vi.fn()}
        />
      )

      const button = screen.getByTitle('Select image regions to explain')
      expect(button).toBeDefined()
    })

    it('should toggle selection mode when clicked', () => {
      const onSelectionModeChange = vi.fn()

      render(
        <PdfToolbar
          {...defaultProps}
          onSelectionModeChange={onSelectionModeChange}
          selectionMode={false}
        />
      )

      const button = screen.getByTitle('Select image regions to explain')
      fireEvent.click(button)

      expect(onSelectionModeChange).toHaveBeenCalledWith(true)
    })

    it('should disable selection mode button when not available', () => {
      render(
        <PdfToolbar
          {...defaultProps}
          onSelectionModeChange={vi.fn()}
          selectionModeAvailable={false}
        />
      )

      const button = screen.getByTitle('Not available for scanned PDFs')
      expect(button).toHaveProperty('disabled', true)
    })
  })
})
