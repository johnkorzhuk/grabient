import React, { PureComponent } from 'react'
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
  z-index: 1000;
`

const Text = styled.span`
  font-size: 1.2rem;
  color: #454545;
  text-transform: uppercase;
`

class Popover extends PureComponent {
  shouldComponentUpdate (nextProps) {
    return this.props.color !== nextProps.color
  }

  render () {
    const { color, left } = this.props
    const mixed = transparentize(0.4, mix(0.2, color, '#AFAFAF'))

    return (
      <Container className='target-el' left={left} shadowColor={mixed}>
        <Text>{color}</Text>
        <Triangle />
      </Container>
    )
  }
}

export default Popover
