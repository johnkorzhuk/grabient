import React, { PureComponent } from 'react'
import { Animate } from 'react-move'

class ExpandEdit extends PureComponent {
  shouldComponentUpdate (nextProps) {
    return (
      this.props.hovered !== nextProps.hovered ||
      this.props.editingStop !== nextProps.editingStop ||
      this.props.pickingColorStop !== nextProps.pickingColorStop
    )
  }

  render () {
    const {
      hovered,
      color,
      editingStop,
      pickingColorStop,
      animationDuration,
      ...props
    } = this.props
    return (
      <Animate
        duration={animationDuration}
        data={{
          exitOpacity: hovered ? 1 : 0,
          addOpacity: hovered ? 0 : 1,
          rotation: editingStop || pickingColorStop ? 45 : 0
        }}
      >
        {data => {
          return (
            <svg
              {...props}
              width='20'
              height='20'
              style={{
                transform: `rotate(${data.rotation}deg)`
              }}
              viewBox='0 0 20 20'
              xmlns='http://www.w3.org/2000/svg'
            >
              <path
                d='M10 20C4.47715 20 0 15.52285 0 10S4.47715 0 10 0s10 4.47715 10 10-4.47715 10-10 10zm1-11V6H9v3H6v2h3v3h2v-3h3V9h-3z'
                fillRule='nonzero'
                fill={color}
                fillOpacity={data.exitOpacity}
              />
              <path
                d='M10 18c4.41828 0 8-3.58172 8-8s-3.58172-8-8-8-8 3.58172-8 8 3.58172 8 8 8zm0 2C4.47715 20 0 15.52285 0 10S4.47715 0 10 0s10 4.47715 10 10-4.47715 10-10 10zm1-11V6H9v3H6v2h3v3h2v-3h3V9h-3z'
                fillRule='nonzero'
                fill={color}
                fillOpacity={data.addOpacity}
              />
            </svg>
          )
        }}
      </Animate>
    )
  }
}

export default ExpandEdit
