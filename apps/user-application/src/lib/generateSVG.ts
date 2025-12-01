type PaletteStyle =
  | 'linearGradient'
  | 'linearSwatches'
  | 'angularGradient'
  | 'angularSwatches'

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return [0, 0, 0]
  return [
    parseInt(result[1]!, 16),
    parseInt(result[2]!, 16),
    parseInt(result[3]!, 16),
  ]
}

export function generateSVG(
  hexColors: string[],
  type: PaletteStyle = 'linearGradient',
  angle: number = 90,
  creditProps?: { seed: string; searchString: string },
  width: number = 800,
  height: number = 400,
): string {
  const getUniqueId = (baseId: string) => `${baseId}_${Math.random().toString(36).substr(2, 9)}`

  const getRgbString = (rgb: [number, number, number]) =>
    `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`

  const buildCreditUrl = () => {
    if (!creditProps) return ''
    const params = new URLSearchParams()
    if (type !== 'linearGradient') params.set('style', type)
    if (angle !== 90) params.set('angle', angle.toString())
    const queryString = params.toString()
    return `<!-- https://grabient.com/${creditProps.seed}${queryString ? `?${queryString}` : ''}${creditProps.searchString} -->`
  }

  const creditComment = buildCreditUrl()

  const rgbColors = hexColors.map(hexToRgb)

  if (rgbColors.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    ${creditComment}
    </svg>`
  }

  if (rgbColors.length === 1 && rgbColors[0]) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      ${creditComment}
      <rect x="0" y="0" width="${width}" height="${height}" fill="rgb(${getRgbString(rgbColors[0])})"/>
    </svg>`
  }

  switch (type) {
    case 'linearGradient': {
      const normalizedAngle = ((angle % 360) + 360) % 360
      const radians = (normalizedAngle * Math.PI) / 180
      const adjustedRadians = radians - Math.PI / 2

      const x1 = (0.5 - 0.5 * Math.cos(adjustedRadians)).toFixed(3)
      const y1 = (0.5 - 0.5 * Math.sin(adjustedRadians)).toFixed(3)
      const x2 = (0.5 + 0.5 * Math.cos(adjustedRadians)).toFixed(3)
      const y2 = (0.5 + 0.5 * Math.sin(adjustedRadians)).toFixed(3)

      let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        ${creditComment}
        <defs>
          <linearGradient id="${getUniqueId('gradient')}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">`

      rgbColors.forEach((color, index) => {
        const position = (index / (rgbColors.length - 1)).toFixed(3)
        svgContent += `<stop offset="${position}" stop-color="rgb(${getRgbString(color)})" />`
      })

      svgContent += `</linearGradient>
        </defs>
        <rect x="0" y="0" width="${width}" height="${height}" fill="url(#${getUniqueId('gradient')})" />
      </svg>`

      return svgContent
    }

    case 'linearSwatches': {
      const normalizedAngle = ((angle % 360) + 360) % 360

      let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        ${creditComment}
        <defs>
          <clipPath id="${getUniqueId('bounds')}">
            <rect x="0" y="0" width="${width}" height="${height}" />
          </clipPath>
        </defs>
        <g clip-path="url(#${getUniqueId('bounds')})">`

      const radians = (normalizedAngle * Math.PI) / 180
      const adjustedRadians = radians - Math.PI / 2

      const dx = Math.cos(adjustedRadians)
      const dy = Math.sin(adjustedRadians)

      const centerX = width / 2
      const centerY = height / 2

      let gradientLength: number

      if (Math.abs(dx) < 1e-10) {
        gradientLength = height
      } else if (Math.abs(dy) < 1e-10) {
        gradientLength = width
      } else {
        const corners = [
          {x: 0, y: 0},
          {x: width, y: 0},
          {x: width, y: height},
          {x: 0, y: height}
        ]

        let minProjection = Infinity
        let maxProjection = -Infinity

        corners.forEach(corner => {
          const relativeX = corner.x - centerX
          const relativeY = corner.y - centerY
          const projection = relativeX * dx + relativeY * dy
          minProjection = Math.min(minProjection, projection)
          maxProjection = Math.max(maxProjection, projection)
        })

        gradientLength = maxProjection - minProjection
      }

      const gradientStartX = centerX - (gradientLength / 2) * dx
      const gradientStartY = centerY - (gradientLength / 2) * dy

      rgbColors.forEach((color, index) => {
        const startPercent = index / rgbColors.length
        const endPercent = (index + 1) / rgbColors.length

        const segmentStart = startPercent * gradientLength
        const segmentEnd = endPercent * gradientLength

        const startX = gradientStartX + segmentStart * dx
        const startY = gradientStartY + segmentStart * dy
        const endX = gradientStartX + segmentEnd * dx
        const endY = gradientStartY + segmentEnd * dy

        const perpX = -dy
        const perpY = dx

        const perpExtension = Math.max(width, height) * 2

        const x1 = startX + perpX * perpExtension
        const y1 = startY + perpY * perpExtension
        const x2 = startX - perpX * perpExtension
        const y2 = startY - perpY * perpExtension
        const x3 = endX - perpX * perpExtension
        const y3 = endY - perpY * perpExtension
        const x4 = endX + perpX * perpExtension
        const y4 = endY + perpY * perpExtension

        const pathData = `M ${x1.toFixed(3)},${y1.toFixed(3)} L ${x2.toFixed(3)},${y2.toFixed(3)} L ${x3.toFixed(3)},${y3.toFixed(3)} L ${x4.toFixed(3)},${y4.toFixed(3)} Z`

        svgContent += `<path d="${pathData}" fill="rgb(${getRgbString(color)})" />`
      })

      svgContent += `</g>
      </svg>`

      return svgContent
    }

    case 'angularGradient': {
      let colorStops: string[] = []

      rgbColors.forEach((color, index) => {
        const position = (
          (index / (rgbColors.length - 1)) *
          360
        ).toFixed(6)
        colorStops.push(`rgba(${getRgbString(color)}, 1) ${position}deg`)
      })

      const conicGradient = `conic-gradient(from ${angle}deg,${colorStops.join(',')})`

      const centerX = width / 2
      const centerY = height / 2
      const diagonal = Math.sqrt(width * width + height * height)
      const canvasSize = Math.ceil(diagonal * 1.5)
      const canvasHalf = canvasSize / 2
      const canvasX = centerX - canvasHalf
      const canvasY = centerY - canvasHalf

      const clipId = getUniqueId('clip_bounds')

      return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
        ${creditComment}
        <g clip-path="url(#${clipId})">
          <foreignObject x="${canvasX}" y="${canvasY}" width="${canvasSize}" height="${canvasSize}">
            <div xmlns="http://www.w3.org/1999/xhtml" style="background:${conicGradient};width:100%;height:100%;"></div>
          </foreignObject>
        </g>
        <defs>
          <clipPath id="${clipId}">
            <rect width="${width}" height="${height}"/>
          </clipPath>
        </defs>
      </svg>`
    }

    case 'angularSwatches': {
      let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        ${creditComment}
        <defs>
          <clipPath id="${getUniqueId('squareClip')}">
            <rect x="0" y="0" width="${width}" height="${height}" />
          </clipPath>
        </defs>
        <g clip-path="url(#${getUniqueId('squareClip')})">`

      const centerX = (width / 2).toFixed(3)
      const centerY = (height / 2).toFixed(3)
      const diagonal = Math.sqrt(width * width + height * height)
      const radius = (diagonal / 2).toFixed(3)
      const startingAngle = angle - 90
      const segmentSize = (360 / rgbColors.length).toFixed(3)

      rgbColors.forEach((color, index) => {
        const segmentStartAngle = (
          startingAngle +
          index * Number(segmentSize)
        ).toFixed(3)
        const segmentEndAngle = (
          startingAngle +
          (index + 1) * Number(segmentSize)
        ).toFixed(3)

        const startRad = (Number(segmentStartAngle) * Math.PI) / 180
        const endRad = (Number(segmentEndAngle) * Math.PI) / 180

        const startX = (
          Number(centerX) +
          Number(radius) * Math.cos(startRad)
        ).toFixed(3)
        const startY = (
          Number(centerY) +
          Number(radius) * Math.sin(startRad)
        ).toFixed(3)
        const endX = (
          Number(centerX) +
          Number(radius) * Math.cos(endRad)
        ).toFixed(3)
        const endY = (
          Number(centerY) +
          Number(radius) * Math.sin(endRad)
        ).toFixed(3)

        const largeArcFlag =
          Number(segmentEndAngle) - Number(segmentStartAngle) > 180 ? 1 : 0

        const pathData = `M ${centerX},${centerY} L ${startX},${startY} A ${radius},${radius} 0 ${largeArcFlag} 1 ${endX},${endY} Z`

        svgContent += `<path d="${pathData}" fill="rgb(${getRgbString(color)})" />`
      })

      svgContent += `</g>
      </svg>`

      return svgContent
    }

    default:
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        ${creditComment}
      </svg>`
  }
}
