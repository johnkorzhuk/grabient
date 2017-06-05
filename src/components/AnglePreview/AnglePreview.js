import React from 'react'
import styled from 'styled-components'

import { AnglePrev } from './../Icons/index'

const Container = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
`

const AngleText = styled.span`
  font-size: 1.4rem;
  color: ${({ color }) => color};
  padding-left: 10px;
`

const AnglePreview = ({
  angle,
  animationDuration,
  iconAnimationDuration,
  hovered,
  editingStop,
  editingAngle,
  color
}) => {
  return (
    !editingStop &&
    <Container>
      <AnglePrev
        animationDuration={iconAnimationDuration}
        color={color}
        angle={angle}
        hovered={hovered}
        editingAngle={editingAngle}
      />

      <AngleText color={color}>
        {angle}°
      </AngleText>
    </Container>
  )
}

export default AnglePreview
