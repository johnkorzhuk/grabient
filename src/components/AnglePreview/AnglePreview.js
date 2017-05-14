import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import { Animate } from 'react-move'

const AnglePreview = ({
  angle,
  styles,
  translateX,
  transitionDuration,
  onClick,
  duration,
  hovered
}) => {
  return (
    <Animate
      data={{
        scale: hovered ? 1.2 : 1
      }}
      duration={duration}
    >
      {data => {
        return (
          <svg
            style={{
              transform: `rotate(${angle}deg) scale(${data.scale})`
            }}
            width='26'
            height='26'
            viewBox='0 0 26 26'
            xmlns='http://www.w3.org/2000/svg'
          >
            <g
              transform='translate(-4.787 -4.787)'
              fill='none'
              fill-rule='evenodd'
            >
              <circle
                stroke='#AFAFAF'
                stroke-width='2.5'
                transform='rotate(-45 18.167 18.167)'
                cx='18.16667'
                cy='18.16667'
                r='11.25'
              />
              <path fill='#AFAFAF' d='M16.95346 6.66667h2.5v12h-2.5z' />
            </g>
          </svg>
        )
      }}
    </Animate>
  )
}

//  <Arrow
//       onClick={onClick}
//       style={{
//         transform: `rotate(${angle + 90}deg) translateX(${translateX}px)`,
//         ...styles
//       }}
//     />

export default AnglePreview
