import React from 'react'
import styled from 'styled-components'

import { ExpandEdit, Trash } from './../Icons/index'

const AddStopContainer = styled.div`
  position: absolute;
  left: 0;
  top: 10px;
`

const AddDeleteStop = ({
  renderDelete,
  renderDeleteInverted,
  animationDuration,
  hovered,
  color,
  title
}) => {
  if (renderDelete) {
    return (
      <Trash
        title={title}
        color={color}
        inverted={renderDeleteInverted}
        animationDuration={animationDuration}
      />
    )
  } else {
    return (
      <AddStopContainer title={title}>
        <ExpandEdit color={color} hovered={hovered} />
      </AddStopContainer>
    )
  }
}

export default AddDeleteStop
