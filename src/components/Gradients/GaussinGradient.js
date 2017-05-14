import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'

const Svg = styled.svg`
  width: 100%;
  height: 100%;
  position: absolute;
  padding: ${({ padding }) => `40px ${padding} 80px  ${padding}`};
`

const GuassinGradient = ({ padding, opacity, lines, stops }) => {
  const { x1, y1, x2, y2 } = lines

  return (
    <Svg padding={padding}>
      <defs>
        <linearGradient x1={x1} y1={y1} x2={x2} y2={y2} id='linearGradient-1'>
          {stops}
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
            rx='15'
          />
        </g>
      </g>
    </Svg>
  )
}

export default GuassinGradient
