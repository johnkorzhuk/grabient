import React, { Component } from 'react'
import styled from 'styled-components'
import deepEqual from 'deep-equal'

import Gradient from './../Gradient/Gradient'
import { AngleWheel } from './../../containers/index'

const Container = styled.div`
  position: relative;
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
`

const NoBlur = styled.div`
  height: 90%;
  width: 100%;
  z-index: 10;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 15px;
`

const Blurred = styled.div`
  filter: blur(20px);
  height: 92%;
  width: 98%;
  position: absolute;
  border-radius: 15px;
`

const flattenGradientData = gradient => {
  return Object.keys(gradient).reduce((aggr, curr) => {
    // order matters! Check generateColorStopsFromData in ./utils/gradient.js
    aggr[`${curr}Color`] = gradient[curr]
    aggr[`${curr}Stop`] = parseInt(curr, 10)
    return aggr
  }, {})
}

class GradientContainer extends Component {
  componentWillMount () {
    const { gradient } = this.props.gradient

    this.data = flattenGradientData(gradient)
  }

  componentWillReceiveProps (nextProps) {
    const { gradient } = this.props.gradient

    if (!deepEqual(gradient, nextProps.gradient.gradient)) {
      this.data = flattenGradientData(nextProps.gradient.gradient)
    }
  }

  shouldComponentUpdate (nextProps, nextState) {
    return (
      this.props.gradient !== nextProps.gradient ||
      this.props.angle !== nextProps.angle ||
      this.props.hovered !== nextProps.hovered ||
      this.props.editing !== nextProps.editing
    )
  }

  render () {
    const {
      gradientAnimationDuration,
      wheelAnimationDuration,
      id,
      angle,
      hovered,
      onMouseEnter,
      onMouseLeave,
      editing
    } = this.props

    return (
      <Container>
        <NoBlur
          onMouseEnter={e => onMouseEnter(e, 'main')}
          onMouseLeave={e => onMouseLeave(e, 'main')}
        >
          <Gradient
            angle={angle}
            data={this.data}
            transitionDuration={gradientAnimationDuration}
          />
        </NoBlur>

        <Blurred>
          <Gradient
            opacity={hovered || editing ? 0.8 : 0}
            angle={angle}
            data={this.data}
            transitionDuration={gradientAnimationDuration}
          />
        </Blurred>

        <AngleWheel
          angle={angle}
          id={id}
          transitionDuration={wheelAnimationDuration}
        />
      </Container>
    )
  }
}

export default GradientContainer
