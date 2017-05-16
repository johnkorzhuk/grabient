import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import { Animate } from 'react-move'

import { AnglePrev } from './../Icons/index'

const AnglePreview = ({
  angle,
  styles,
  translateX,
  onClick,
  animationDuration,
  hovered
}) => {
  return (
    <Animate
      data={{
        scale: hovered ? 1.2 : 1
      }}
      duration={animationDuration}
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
