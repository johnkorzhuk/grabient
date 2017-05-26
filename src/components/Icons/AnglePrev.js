import React, { PureComponent } from 'react'
import { Animate } from 'react-move'

class AnglePrev extends PureComponent {
  shouldComponentUpdate (nextProps) {
    return (
      this.props.angle !== nextProps.angle ||
      this.props.hovered !== nextProps.hovered ||
      this.props.editingAngle !== nextProps.editingAngle
    )
  }

  render () {
    const {
      angle,
      color,
      hovered,
      editingAngle,
      animationDuration
    } = this.props

    return (
      <Animate
        duration={animationDuration}
        data={{
          activeOpacity: editingAngle ? hovered ? 0 : 1 : hovered ? 1 : 0,
          inactiveOpacity: editingAngle ? hovered ? 1 : 0 : hovered ? 0 : 1
        }}
      >
        {data => {
          return (
            <svg
              width='20'
              height='20'
              viewBox='0 0 20 20'
              style={{
                transform: `rotate(${angle}deg)`
              }}
            >
              <path
                d='M10 20C4.47715 20 0 15.52285 0 10S4.47715 0 10 0s10 4.47715 10 10-4.47715 10-10 10zm1-18H9v7h2V2z'
                fillRule='nonzero'
                fill={color}
                fillOpacity={data.activeOpacity}
              />
              <path
                d='M9 2.0619C5.0537 2.554 2 5.92037 2 10c0 4.41828 3.58172 8 8 8s8-3.58172 8-8c0-4.07962-3.0537-7.446-7-7.9381V9H9V2.0619zM10 20C4.47715 20 0 15.52285 0 10S4.47715 0 10 0s10 4.47715 10 10-4.47715 10-10 10z'
                fillRule='nonzero'
                fill={color}
                fillOpacity={data.inactiveOpacity}
              />
            </svg>
          )
        }}
      </Animate>
    )
  }
}

export default AnglePrev
