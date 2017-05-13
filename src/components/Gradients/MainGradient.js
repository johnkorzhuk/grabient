import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'

import { angleToLines } from './../../utils/angle'

const Svg = styled.svg`
  width: 100%;
  height: 100%;
  z-index: 10;
`

const MainGradient = ({ gradient, angle }) => {
  const stopKeys = Object.keys(gradient)
  const { x1, y1, x2, y2 } = angleToLines(angle)

  return (
    <Svg>
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
      </defs>
      <g
        id='Gradients'
        stroke='none'
        stroke-width='1'
        fill='none'
        fill-rule='evenodd'
      >
        <g id='Desktop-HD' fill='url(#linearGradient-1)'>
          <rect id='Rectangle-Copy' width='100%' height='100%' rx='10' />
        </g>
      </g>
    </Svg>
  )
}

export default MainGradient
