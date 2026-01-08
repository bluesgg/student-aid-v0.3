declare module 'react-window' {
  import { ComponentType, CSSProperties, ReactNode, Ref } from 'react'

  export interface ListChildComponentProps<T = unknown> {
    data: T
    index: number
    isScrolling?: boolean
    style: CSSProperties
  }

  export interface ListOnScrollProps {
    scrollDirection: 'forward' | 'backward'
    scrollOffset: number
    scrollUpdateWasRequested: boolean
  }

  export interface VariableSizeListProps<T = unknown> {
    children: ComponentType<ListChildComponentProps<T>>
    className?: string
    direction?: 'ltr' | 'rtl'
    height: number
    initialScrollOffset?: number
    innerRef?: Ref<HTMLDivElement>
    innerElementType?: string | ComponentType<{ style: CSSProperties; children: ReactNode }>
    itemCount: number
    itemData?: T
    itemKey?: (index: number, data: T) => string | number
    itemSize: (index: number) => number
    layout?: 'horizontal' | 'vertical'
    onItemsRendered?: (props: {
      overscanStartIndex: number
      overscanStopIndex: number
      visibleStartIndex: number
      visibleStopIndex: number
    }) => void
    onScroll?: (props: ListOnScrollProps) => void
    outerRef?: Ref<HTMLDivElement>
    outerElementType?: string | ComponentType<{ style: CSSProperties; children: ReactNode }>
    overscanCount?: number
    style?: CSSProperties
    useIsScrolling?: boolean
    width: number | string
  }

  export class VariableSizeList<T = unknown> extends React.Component<VariableSizeListProps<T>> {
    scrollTo(scrollOffset: number): void
    scrollToItem(index: number, align?: 'auto' | 'smart' | 'center' | 'end' | 'start'): void
    resetAfterIndex(index: number, shouldForceUpdate?: boolean): void
  }

  export interface FixedSizeListProps<T = unknown> {
    children: ComponentType<ListChildComponentProps<T>>
    className?: string
    direction?: 'ltr' | 'rtl'
    height: number
    initialScrollOffset?: number
    innerRef?: Ref<HTMLDivElement>
    innerElementType?: string | ComponentType<{ style: CSSProperties; children: ReactNode }>
    itemCount: number
    itemData?: T
    itemKey?: (index: number, data: T) => string | number
    itemSize: number
    layout?: 'horizontal' | 'vertical'
    onItemsRendered?: (props: {
      overscanStartIndex: number
      overscanStopIndex: number
      visibleStartIndex: number
      visibleStopIndex: number
    }) => void
    onScroll?: (props: ListOnScrollProps) => void
    outerRef?: Ref<HTMLDivElement>
    outerElementType?: string | ComponentType<{ style: CSSProperties; children: ReactNode }>
    overscanCount?: number
    style?: CSSProperties
    useIsScrolling?: boolean
    width: number | string
  }

  export class FixedSizeList<T = unknown> extends React.Component<FixedSizeListProps<T>> {
    scrollTo(scrollOffset: number): void
    scrollToItem(index: number, align?: 'auto' | 'smart' | 'center' | 'end' | 'start'): void
  }
}
