import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'

import { angleToLines } from './../../utils/angle'

const Svg = styled.svg`
  width: 100%;
  height: 100%;
  position: absolute;
  padding: ${({ padding }) => padding};
`

const GuassinGradient = ({ gradient, padding, opacity, angle }) => {
  const stopKeys = Object.keys(gradient)
  const { x1, y1, x2, y2 } = angleToLines(angle)

  return (
    <Svg padding={padding}>
      <defs>
        <linearGradient x1={x1} y1={y1} x2={x2} y2={y2} id='linearGradient-1'>
          {stopKeys.map(stopKey => (
            <stop
              key={stopKey}
              stop-color={gradient[stopKey].color}
              offset={gradient[stopKey].stop + '%'}
            />
          ))}
        </linearGradient>
        <filter
          x='-24.6%'
          y='-24.6%'
          width='149.3%'
          height='149.3%'
          filterUnits='objectBoundingBox'
          id='filter-2'
        >
          <feGaussianBlur stdDeviation='24.6428571' in='SourceGraphic' />
        </filter>
      </defs>
      <g
        id='Gradients'
        stroke='none'
        stroke-width='1'
        fill='none'
        fill-rule='evenodd'
        opacity={opacity}
      >
        <g id='Desktop-HD' fill='url(#linearGradient-1)'>
          <rect
            id='Rectangle'
            filter='url(#filter-2)'
            width='100%'
            height='100%'
            rx='10'
          />
        </g>
      </g>
    </Svg>
  )
}

export default GuassinGradient
