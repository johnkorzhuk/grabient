import React from 'react'
import { Animate } from 'react-move'

import { AnglePrev } from './../Icons/index'

const AnglePreview = ({
  angle,
  animationDuration,
  hovered,
  editingStop,
  editingAngle,
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
          data.opacity !== 0 &&
          <div
            style={{
              transform: `translateX(${data.translateX}px)`,
              opacity: data.opacity,
              height: 20
            }}
          >
            <AnglePrev
              color='#AFAFAF'
              angle={angle}
              hovered={hovered}
              editingAngle={editingAngle}
            />
            {children}
          </div>
        )
      }}
    </Animate>
  )
}

export default AnglePreview
