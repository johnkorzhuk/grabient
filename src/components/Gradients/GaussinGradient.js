import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'

const Svg = styled.svg`
  width: 100%;
  height: 100%;
  position: absolute;
  padding: 40px 50px 60px 50px
`

const GuassinGradient = ({ opacity, lines, stops, id }) => {
  const { x1, y1, x2, y2 } = lines
  const gradientId = `linearGradient-${id}`

  return (
    <Svg>
      <defs>
        <linearGradient x1={x1} y1={y1} x2={x2} y2={y2} id={gradientId}>
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
        <g id='Desktop-HD' fill={`url(#${gradientId})`}>
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
