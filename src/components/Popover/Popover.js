import React from 'react'
import styled from 'styled-components'
import { mix, transparentize } from 'polished'

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

const Triangle = styled.span`
  position: absolute;
  width: 0;
  height: 0;
  border-top: 10px solid white;
  border-right: 10px solid transparent;
  bottom: -8px;
  left: 0;
`

const Text = styled.span`
  font-size: 1.4rem;
  color: #454545;
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
