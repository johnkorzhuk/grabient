import React from 'react'
import styled from 'styled-components'
import { mix, transparentize } from 'polished'

import { Triangle } from './../Common/index'

const Container = styled.div`
  padding: 6px 10px;
  position: absolute;
  left: 50%;
  bottom: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px 5px 5px 0;
  background-color: white;
  box-shadow: ${({ shadowColor }) => `0px 3px 10px 0px ${shadowColor}`};
`

const Text = styled.span`
  font-size: 1.2rem;
  color: #454545;
  text-transform: uppercase;
`

const Popover = ({ color, bgc, left, shadowColor }) => {
  return (
    <Container
      className='target-el'
      left={left}
      shadowColor={transparentize(0.5, mix(0.7, shadowColor, '#AFAFAF'))}
    >
      <Text>{color}</Text>
      <Triangle />
    </Container>
  )
}

export default Popover
