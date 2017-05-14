import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'

const Svg = styled.svg`
  width: 100%;
  height: 100%;
  z-index: 10;
`

const MainGradient = ({ lines, stops }) => {
  const { x1, y1, x2, y2 } = lines
  console.log(x1, y1, x2, y2)
  return (
    <Svg>
      <defs>
        <linearGradient x1={x1} y1={y1} x2={x2} y2={y2} id='linearGradient-1'>
          {stops}
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
          <rect id='Rectangle-Copy' width='100%' height='100%' rx='15' />
        </g>
      </g>
    </Svg>
  )
}

export default MainGradient
