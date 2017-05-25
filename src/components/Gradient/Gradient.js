import React from 'react'
import styled from 'styled-components'
import { Animate } from 'react-move'

import {
  generateColorStopsFromData
  // generateLinearGradientFromSchema
} from './../../utils/gradient'

const Container = styled.div`
  position: relative;
  height: 100%;
  width: 100%;
  border-radius: 15px;
`

const Gradient = ({
  stopData,
  transitionDuration,
  data,
  angle,
  opacity,
  children,
  editingStop
}) => {
  let newData = { ...stopData }
  const hasOpacity = !isNaN(opacity)
  if (hasOpacity) {
    newData.opacity = opacity
  }

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
}

export default Gradient
