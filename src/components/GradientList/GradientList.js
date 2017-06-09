import React from 'react'
import styled from 'styled-components'

import { GradientCard } from './../../containers/index'

const Container = styled.ul`
  display: flex;
  justify-content: center;
  flex-wrap: wrap;

  @media (min-width: 680px) {
    justify-content: flex-start;
  }
`

const GradientList = ({ gradients }) => {
  return (
    <Container>
      {gradients.map((gradient, index) => {
        return (
          <GradientCard
            gradient={gradient}
            index={index}
            width='33.33%'
            id={gradient.id}
            key={gradient.id}
          />
        )
      })}
    </Container>
  )
}

export default GradientList
