import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import { Animate } from 'react-move'

import { AnglePrev } from './../Icons/index'

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
        return <AnglePrev color='#AFAFAF' scale={data.scale} angle={angle} />
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
