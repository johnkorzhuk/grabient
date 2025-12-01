import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { SizeType } from '@/stores/export'

const DEFAULT_WIDTH = 800
const DEFAULT_HEIGHT = 400
const MIN_WIDTH = 100
const MAX_WIDTH = 10000
const MIN_HEIGHT = 100
const MAX_HEIGHT = 10000

interface SizeControlsProps {
  size: SizeType
  onSizeChange?: (newSize: SizeType) => void
  className?: string
}

export function SizeControls({
  size,
  onSizeChange,
  className,
}: SizeControlsProps) {
  const [localWidth, setLocalWidth] = useState('')
  const [localHeight, setLocalHeight] = useState('')
  const [userChangedWidth, setUserChangedWidth] = useState(false)
  const [userChangedHeight, setUserChangedHeight] = useState(false)

  useEffect(() => {
    if (size === 'auto') {
      setLocalWidth(DEFAULT_WIDTH.toString())
      setLocalHeight(DEFAULT_HEIGHT.toString())
    } else {
      setLocalWidth(size[0].toString())
      setLocalHeight(size[1].toString())
    }
  }, [size])

  const clamp = (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(max, value))
  }

  const validateAndUpdateSize = (width: number, height: number) => {
    const clampedWidth = clamp(width, MIN_WIDTH, MAX_WIDTH)
    const clampedHeight = clamp(height, MIN_HEIGHT, MAX_HEIGHT)
    onSizeChange?.([clampedWidth, clampedHeight])
  }

  const handleWidthBlur = () => {
    const numValue = Number.parseFloat(localWidth)

    if (isNaN(numValue)) {
      setLocalWidth(DEFAULT_WIDTH.toString())
      if (userChangedWidth) {
        const heightValue = Number.parseFloat(localHeight)
        if (!isNaN(heightValue)) {
          validateAndUpdateSize(DEFAULT_WIDTH, heightValue)
        }
      }
    } else if (userChangedWidth) {
      const heightValue = Number.parseFloat(localHeight)
      if (!isNaN(heightValue)) {
        validateAndUpdateSize(numValue, heightValue)
      }
    }

    setUserChangedWidth(false)
  }

  const handleHeightBlur = () => {
    const numValue = Number.parseFloat(localHeight)

    if (isNaN(numValue)) {
      setLocalHeight(DEFAULT_HEIGHT.toString())
      if (userChangedHeight) {
        const widthValue = Number.parseFloat(localWidth)
        if (!isNaN(widthValue)) {
          validateAndUpdateSize(widthValue, DEFAULT_HEIGHT)
        }
      }
    } else if (userChangedHeight) {
      const widthValue = Number.parseFloat(localWidth)
      if (!isNaN(widthValue)) {
        validateAndUpdateSize(widthValue, numValue)
      }
    }

    setUserChangedHeight(false)
  }

  const handleWidthChange = (value: string) => {
    setLocalWidth(value)
    setUserChangedWidth(true)
  }

  const handleHeightChange = (value: string) => {
    setLocalHeight(value)
    setUserChangedHeight(true)
  }

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    type: 'width' | 'height',
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault()

      if (type === 'width') {
        setUserChangedWidth(true)
      } else {
        setUserChangedHeight(true)
      }

      const widthValue = Number.parseFloat(localWidth)
      const heightValue = Number.parseFloat(localHeight)

      if (!isNaN(widthValue) && !isNaN(heightValue)) {
        validateAndUpdateSize(widthValue, heightValue)
      }

      e.currentTarget.blur()
    }
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <input
            id="width"
            type="number"
            value={localWidth}
            onChange={(e) => handleWidthChange(e.target.value)}
            onFocus={() => setUserChangedWidth(false)}
            onBlur={handleWidthBlur}
            onKeyDown={(e) => handleKeyDown(e, 'width')}
            min={MIN_WIDTH}
            max={MAX_WIDTH}
            className="peer disable-animation-on-theme-change w-20 h-8 px-3 rounded-md border border-solid border-input bg-transparent hover:border-muted-foreground/50 hover:bg-background/60 text-muted-foreground hover:text-foreground transition-colors duration-200 font-bold text-sm shadow-sm focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 order-2 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
          />
          <TooltipProvider>
            <Tooltip delayDuration={1000}>
              <TooltipTrigger asChild>
                <Label
                  htmlFor="width"
                  className="text-[14px] font-bold whitespace-nowrap text-muted-foreground peer-hover:text-foreground peer-focus:text-foreground transition-colors duration-200 order-1"
                >
                  W
                </Label>
              </TooltipTrigger>
              <TooltipContent>
                <span>Width</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="height"
            type="number"
            value={localHeight}
            onChange={(e) => handleHeightChange(e.target.value)}
            onFocus={() => setUserChangedHeight(false)}
            onBlur={handleHeightBlur}
            onKeyDown={(e) => handleKeyDown(e, 'height')}
            min={MIN_HEIGHT}
            max={MAX_HEIGHT}
            className="peer disable-animation-on-theme-change w-20 h-8 px-3 rounded-md border border-solid border-input bg-transparent hover:border-muted-foreground/50 hover:bg-background/60 text-muted-foreground hover:text-foreground transition-colors duration-200 font-bold text-sm shadow-sm focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 order-2 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
          />
          <TooltipProvider>
            <Tooltip delayDuration={1000}>
              <TooltipTrigger asChild>
                <Label
                  htmlFor="height"
                  className="text-[14px] font-bold whitespace-nowrap text-muted-foreground peer-hover:text-foreground peer-focus:text-foreground transition-colors duration-200 order-1"
                >
                  H
                </Label>
              </TooltipTrigger>
              <TooltipContent>
                <span>Height</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  )
}
