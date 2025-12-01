import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useStore } from '@tanstack/react-store'
import { exportStore, addToExportList } from '@/stores/export'
import type { ExportItem } from '@/queries/palettes'

interface ExportButtonProps {
  exportItem: ExportItem
  isActive?: boolean
}

export function ExportButton({ exportItem, isActive = false }: ExportButtonProps) {
  const exportList = useStore(exportStore, (state) => state.exportList)
  const isInList = exportList.some((item) => item.id === exportItem.id)

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    addToExportList(exportItem)
  }

  if (isInList) {
    return null
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={1000}>
        <TooltipTrigger asChild>
          <button
            style={{ backgroundColor: "var(--background)" }}
            className={cn(
              'disable-animation-on-theme-change inline-flex items-center justify-center rounded-md',
              'w-8 h-8 p-0 border border-solid',
              'text-muted-foreground hover:text-foreground',
              'transition-colors duration-200 cursor-pointer',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
              'backdrop-blur-sm',
              !isActive ? 'opacity-0 group-hover:opacity-100' : 'opacity-100',
              'border-input hover:border-muted-foreground/30 hover:bg-background/60'
            )}
            suppressHydrationWarning
            aria-label="Add to export list"
            onClick={handleClick}
            onTouchEnd={(e) => {
              e.stopPropagation()
              handleClick(e as unknown as React.MouseEvent)
            }}
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" sideOffset={6}>
          <span>Add to export</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
