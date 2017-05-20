import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import { Animate } from 'react-move'

import { AnglePrev } from './../Icons/index'

const AnglePreview = ({
  angle,
  animationDuration,
  hovered,
  editingStop,
  children
}) => {
  return (
    <Animate
      data={{
        translateX: editingStop ? -60 : 0,
        opacity: editingStop ? 0 : 1
      }}
      duration={300}
    >
      {data => {
        return (
          <div
            style={{
              transform: `translateX(${data.translateX}px)`,
              opacity: data.opacity
            }}
          >
            <AnglePrev color='#AFAFAF' angle={angle} />
            {children}
          </div>
        )
      }}
    </Animate>
  )
}

export default AnglePreview
