import React from 'react'
import { motion } from 'motion/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { spring } from '../lib/motion'

interface PaginationProps {
  currentPage: number
  totalItems: number
  pageSize?: number
  onPageChange: (page: number) => void
  itemName?: string
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalItems,
  pageSize = 12,
  onPageChange,
  itemName = 'mục',
}) => {
  const totalPages = Math.ceil(totalItems / pageSize)

  if (totalPages <= 1) {
    return (
      <div className="flex items-center justify-between px-2 py-3 text-xs text-slate-400 border-t border-slate-800/80">
        <span className="font-mono text-[11px]">
          Hiển thị toàn bộ {totalItems} {itemName}
        </span>
      </div>
    )
  }

  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  // Generate page numbers to display
  const getPages = () => {
    const pages: (number | string)[] = []
    const maxVisible = 5
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (currentPage > 3) pages.push('...')
      const start = Math.max(2, currentPage - 1)
      const end = Math.min(totalPages - 1, currentPage + 1)
      for (let i = start; i <= end; i++) pages.push(i)
      if (currentPage < totalPages - 2) pages.push('...')
      pages.push(totalPages)
    }
    return pages
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-xs text-slate-400 border-t border-slate-800/80 bg-slate-950/40 rounded-b-xl">
      <div className="font-mono text-[11px] text-slate-400">
        Đang hiển thị <span className="text-slate-200 font-bold">{startItem} - {endItem}</span> trên tổng số{' '}
        <span className="text-indigo-400 font-bold">{totalItems}</span> {itemName} (12 mục/trang)
      </div>

      <div className="flex items-center space-x-1">
        <motion.button
          whileTap={{ scale: 0.95 }}
          transition={spring.press}
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-40 disabled:hover:bg-slate-900 cursor-pointer transition-colors"
          title="Trang trước"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </motion.button>

        {getPages().map((p, idx) => {
          if (p === '...') {
            return (
              <span key={`dots-${idx}`} className="px-2 text-slate-600 font-mono text-xs">
                ...
              </span>
            )
          }
          const pageNum = p as number
          const isActive = pageNum === currentPage
          return (
            <motion.button
              key={pageNum}
              whileTap={{ scale: 0.95 }}
              transition={spring.press}
              onClick={() => onPageChange(pageNum)}
              className={`min-w-[28px] h-7 px-2 rounded-lg font-mono text-xs transition-colors cursor-pointer ${
                isActive
                  ? 'bg-indigo-600 text-white font-bold shadow-sm shadow-indigo-600/30'
                  : 'bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300'
              }`}
            >
              {pageNum}
            </motion.button>
          )
        })}

        <motion.button
          whileTap={{ scale: 0.95 }}
          transition={spring.press}
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-40 disabled:hover:bg-slate-900 cursor-pointer transition-colors"
          title="Trang tiếp theo"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </motion.button>
      </div>
    </div>
  )
}
