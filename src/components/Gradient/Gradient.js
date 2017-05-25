import React from 'react'
import styled from 'styled-components'
import { Animate } from 'react-move'

import {
  generateColorStopsFromData,
  generateLinearGradientFromSchema
} from './../../utils/gradient'

const Container = styled.div`
  position: relative;
  height: 100%;
  width: 100%;
  border-radius: 15px;
`

const Gradient = ({
  gradient,
  transitionDuration,
  data,
  angle,
  opacity,
  children,
  editingStop
}) => {
  let newData = { ...data }
  const hasOpacity = !isNaN(opacity)
  if (hasOpacity) {
    newData.opacity = opacity
  }
  if (!editingStop) {
    // gradient wont update after messing with stops
    console.log(
      `linear-gradient(${angle}deg, ${generateColorStopsFromData(data)})`
    )
    return (
      <Animate data={newData} duration={transitionDuration}>
        {data => {
          return (
            <Container
              style={{
                backgroundImage: `linear-gradient(${angle}deg, ${generateColorStopsFromData(data)})`,
                opacity: hasOpacity ? data.opacity : 1
              }}
            >
              {children}
            </Container>
          )
        }}
      </Animate>
    )
  } else {
    return (
      <Animate
        data={{
          opacity: editingStop ? 0.8 : 0
        }}
        duration={transitionDuration}
      >
        {data => {
          return (
            <Container
              style={{
                backgroundImage: `linear-gradient(${generateLinearGradientFromSchema(gradient)})`,
                opacity: hasOpacity ? data.opacity : 1
              }}
            >
              {children}
            </Container>
          )
        }}
      </Animate>
    )
  }
}

export default Gradient
