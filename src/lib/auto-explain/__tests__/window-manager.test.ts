/**
 * Unit tests for Sliding Window Manager.
 * Tests window calculation, jump detection, and request management.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  calculateWindow,
  isJump,
  getPagesToGenerate,
  getPagesToCancel,
  WindowManager,
} from '../window-manager'

describe('Window Manager', () => {
  describe('calculateWindow', () => {
    it('should calculate window with default range (-2/+5)', () => {
      const result = calculateWindow(10, 100)
      // Window: currentPage - 2 to currentPage + 5
      expect(result.start).toBe(8) // 10 - 2
      expect(result.end).toBe(15) // 10 + 5
    })

    it('should clamp start to page 1', () => {
      const result = calculateWindow(1, 100)
      expect(result.start).toBe(1)
      expect(result.end).toBe(6) // 1 + 5
    })

    it('should clamp end to totalPages', () => {
      const result = calculateWindow(99, 100)
      expect(result.start).toBe(97) // 99 - 2
      expect(result.end).toBe(100)
    })

    it('should handle first page correctly', () => {
      const result = calculateWindow(1, 50)
      expect(result.start).toBe(1)
      expect(result.end).toBe(6)
    })

    it('should handle last page correctly', () => {
      const result = calculateWindow(50, 50)
      expect(result.start).toBe(48)
      expect(result.end).toBe(50)
    })

    it('should handle small PDF (less than window size)', () => {
      const result = calculateWindow(3, 5)
      expect(result.start).toBe(1)
      expect(result.end).toBe(5)
    })

    it('should handle single page PDF', () => {
      const result = calculateWindow(1, 1)
      expect(result.start).toBe(1)
      expect(result.end).toBe(1)
    })
  })

  describe('isJump', () => {
    it('should return false for normal page navigation (1 page)', () => {
      expect(isJump(10, 11)).toBe(false)
    })

    it('should return false for small navigation (5 pages)', () => {
      expect(isJump(10, 15)).toBe(false)
    })

    it('should return false for exactly 10 pages', () => {
      expect(isJump(10, 20)).toBe(false)
    })

    it('should return true for 11+ page jump forward', () => {
      expect(isJump(10, 21)).toBe(true)
    })

    it('should return true for 11+ page jump backward', () => {
      expect(isJump(30, 18)).toBe(true)
    })

    it('should return false for same page', () => {
      expect(isJump(10, 10)).toBe(false)
    })

    it('should return true for large jump', () => {
      expect(isJump(10, 50)).toBe(true)
    })
  })

  describe('getPagesToGenerate', () => {
    it('should return pages in priority order: current, +1, -1, +2, +3, -2, +4, +5', () => {
      // Window 8-15, currentPage=10
      const pages = getPagesToGenerate(8, 15, [], [], 10)
      // Priority: 10, 11, 9, 12, 13, 8, 14, 15
      expect(pages).toEqual([10, 11, 9, 12, 13, 8, 14, 15])
    })

    it('should exclude completed pages while maintaining priority order', () => {
      // Window 8-15, completed=[8, 10, 12], currentPage=10
      const pages = getPagesToGenerate(8, 15, [8, 10, 12], [], 10)
      // Priority: skip 10 (completed), 11, 9, skip 12, 13, skip 8, 14, 15
      expect(pages).toEqual([11, 9, 13, 14, 15])
    })

    it('should exclude pages in progress while maintaining priority order', () => {
      // Window 8-15, inProgress=[10, 11], currentPage=10
      const pages = getPagesToGenerate(8, 15, [], [10, 11], 10)
      // Priority: skip 10, skip 11, 9, 12, 13, 8, 14, 15
      expect(pages).toEqual([9, 12, 13, 8, 14, 15])
    })

    it('should exclude both completed and in progress pages', () => {
      // Window 8-15, completed=[8, 10], inProgress=[9, 11], currentPage=10
      const pages = getPagesToGenerate(8, 15, [8, 10], [9, 11], 10)
      // Priority: skip 10, skip 11, skip 9, 12, 13, skip 8, 14, 15
      expect(pages).toEqual([12, 13, 14, 15])
    })

    it('should return empty array when all pages are done', () => {
      const pages = getPagesToGenerate(8, 10, [8, 9, 10], [], 9)
      expect(pages).toEqual([])
    })

    it('should handle single page window', () => {
      const pages = getPagesToGenerate(5, 5, [], [], 5)
      expect(pages).toEqual([5])
    })

    it('should only return pages within window bounds', () => {
      // Window 1-3, currentPage=1 (near start of document)
      const pages = getPagesToGenerate(1, 3, [], [], 1)
      // Priority offsets: 0(1), +1(2), -1(0-out), +2(3), +3(4-out), -2(-1-out), +4(5-out), +5(6-out)
      expect(pages).toEqual([1, 2, 3])
    })
  })

  describe('getPagesToCancel', () => {
    it('should return pages outside new window', () => {
      const inProgress = [5, 6, 7, 8, 9, 10]
      const canceled = getPagesToCancel(8, 15, inProgress)
      expect(canceled).toEqual([5, 6, 7])
    })

    it('should return empty array when all pages are in new window', () => {
      const inProgress = [9, 10, 11]
      const canceled = getPagesToCancel(8, 15, inProgress)
      expect(canceled).toEqual([])
    })

    it('should handle pages after window', () => {
      const inProgress = [10, 11, 20, 21]
      const canceled = getPagesToCancel(8, 15, inProgress)
      expect(canceled).toEqual([20, 21])
    })

    it('should handle pages both before and after window', () => {
      const inProgress = [5, 6, 10, 20, 21]
      const canceled = getPagesToCancel(8, 15, inProgress)
      expect(canceled).toEqual([5, 6, 20, 21])
    })

    it('should return empty array when no pages in progress', () => {
      const canceled = getPagesToCancel(8, 15, [])
      expect(canceled).toEqual([])
    })
  })

  describe('WindowManager class', () => {
    let manager: WindowManager

    beforeEach(() => {
      manager = new WindowManager('test-session-id')
    })

    describe('canStartRequest', () => {
      it('should return true when no active requests', () => {
        expect(manager.canStartRequest()).toBe(true)
      })

      it('should return true when under concurrency limit', () => {
        manager.startRequest(1)
        manager.startRequest(2)
        expect(manager.canStartRequest()).toBe(true)
      })

      it('should return false when at concurrency limit (3)', () => {
        manager.startRequest(1)
        manager.startRequest(2)
        manager.startRequest(3)
        expect(manager.canStartRequest()).toBe(false)
      })
    })

    describe('getActiveRequestCount', () => {
      it('should return 0 initially', () => {
        expect(manager.getActiveRequestCount()).toBe(0)
      })

      it('should return correct count after starting requests', () => {
        manager.startRequest(1)
        manager.startRequest(2)
        expect(manager.getActiveRequestCount()).toBe(2)
      })
    })

    describe('startRequest', () => {
      it('should return an AbortController', () => {
        const controller = manager.startRequest(1)
        expect(controller).toBeInstanceOf(AbortController)
      })

      it('should track the request', () => {
        manager.startRequest(5)
        expect(manager.getActiveRequestCount()).toBe(1)
        expect(manager.getActivePaes()).toContain(5)
      })
    })

    describe('completeRequest', () => {
      it('should remove request from tracking', () => {
        manager.startRequest(5)
        expect(manager.getActiveRequestCount()).toBe(1)

        manager.completeRequest(5)
        expect(manager.getActiveRequestCount()).toBe(0)
      })

      it('should handle completing non-existent request gracefully', () => {
        expect(() => manager.completeRequest(999)).not.toThrow()
      })
    })

    describe('cancelRequest', () => {
      it('should abort and remove request', () => {
        const controller = manager.startRequest(5)
        const abortSpy = vi.spyOn(controller, 'abort')

        const result = manager.cancelRequest(5)

        expect(result).toBe(true)
        expect(abortSpy).toHaveBeenCalled()
        expect(manager.getActiveRequestCount()).toBe(0)
      })

      it('should return false for non-existent request', () => {
        const result = manager.cancelRequest(999)
        expect(result).toBe(false)
      })
    })

    describe('cancelOutsideWindow', () => {
      it('should cancel requests outside window', () => {
        const c1 = manager.startRequest(5)
        const c2 = manager.startRequest(10)
        const c3 = manager.startRequest(20)

        const s1 = vi.spyOn(c1, 'abort')
        const s2 = vi.spyOn(c2, 'abort')
        const s3 = vi.spyOn(c3, 'abort')

        const canceled = manager.cancelOutsideWindow(8, 15)

        expect(canceled).toEqual(expect.arrayContaining([5, 20]))
        expect(canceled).not.toContain(10)
        expect(s1).toHaveBeenCalled()
        expect(s2).not.toHaveBeenCalled()
        expect(s3).toHaveBeenCalled()
      })

      it('should return empty array when all requests are in window', () => {
        manager.startRequest(9)
        manager.startRequest(10)
        manager.startRequest(11)

        const canceled = manager.cancelOutsideWindow(8, 15)
        expect(canceled).toEqual([])
      })
    })

    describe('cancelAll', () => {
      it('should cancel all active requests', () => {
        const c1 = manager.startRequest(5)
        const c2 = manager.startRequest(10)
        const c3 = manager.startRequest(15)

        const s1 = vi.spyOn(c1, 'abort')
        const s2 = vi.spyOn(c2, 'abort')
        const s3 = vi.spyOn(c3, 'abort')

        const canceled = manager.cancelAll()

        expect(canceled).toEqual(expect.arrayContaining([5, 10, 15]))
        expect(s1).toHaveBeenCalled()
        expect(s2).toHaveBeenCalled()
        expect(s3).toHaveBeenCalled()
        expect(manager.getActiveRequestCount()).toBe(0)
      })

      it('should return empty array when no active requests', () => {
        const canceled = manager.cancelAll()
        expect(canceled).toEqual([])
      })
    })

    describe('getActivePaes', () => {
      it('should return list of active page numbers', () => {
        manager.startRequest(5)
        manager.startRequest(10)
        manager.startRequest(15)

        const pages = manager.getActivePaes()
        expect(pages).toContain(5)
        expect(pages).toContain(10)
        expect(pages).toContain(15)
        expect(pages.length).toBe(3)
      })

      it('should return empty array when no active requests', () => {
        expect(manager.getActivePaes()).toEqual([])
      })
    })

    describe('waitForSlot', () => {
      it('should return true immediately when slot available', async () => {
        const result = await manager.waitForSlot(1000)
        expect(result).toBe(true)
      })

      it('should timeout and return false when no slot becomes available', async () => {
        manager.startRequest(1)
        manager.startRequest(2)
        manager.startRequest(3)

        const result = await manager.waitForSlot(200)
        expect(result).toBe(false)
      }, 1000)

      it('should return true when slot becomes available', async () => {
        manager.startRequest(1)
        manager.startRequest(2)
        manager.startRequest(3)

        // Complete one request after 100ms
        setTimeout(() => {
          manager.completeRequest(1)
        }, 100)

        const result = await manager.waitForSlot(500)
        expect(result).toBe(true)
      }, 1000)
    })
  })
})
