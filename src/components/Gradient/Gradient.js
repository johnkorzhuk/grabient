import React, { PureComponent } from 'react'
import styled from 'styled-components'
import { Animate } from 'react-move'

import { generateColorStopsFromData } from './../../utils/gradient'

const Container = styled.div`
  position: relative;
  height: 100%;
  width: 100%;
  border-radius: 15px;
`

class Gradient extends PureComponent {
  shouldComponentUpdate (nextProps) {
    return (
      this.props.stopData !== nextProps.stopData ||
      this.props.angle !== nextProps.angle ||
      this.props.hovered !== nextProps.hovered ||
      this.props.editing !== nextProps.editing
    )
  }

  render () {
    const {
      stopData,
      transitionDuration,
      angle,
      opacity,
      hasOpacity,
      hovered,
      editing
    } = this.props

    let newData = { ...stopData }
    if (hasOpacity) newData.opacity = hovered || editing ? opacity : 0

    return (
      <Animate data={newData} duration={transitionDuration}>
        {data => {
          return (
            <Container
              style={{
                backgroundImage: `linear-gradient(${angle}deg, ${generateColorStopsFromData(data)})`,
                opacity: data.opacity,
                zIndex: hasOpacity ? -1 : 'auto'
              }}
            />
          )
        }}
      </Animate>
    )
  }
}

export default Gradient
