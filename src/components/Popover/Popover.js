import React, { Component } from 'react'
import styled from 'styled-components'
import { mix, transparentize } from 'polished'

import { Triangle } from './../Common/index'
import { TextSM } from './../Common/Typography'

const Container = styled.div`
  padding: 3px 8px 2px;
  position: absolute;
  right: 50%;
  bottom: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px 5px 0 5px;
  background-color: white;
  box-shadow: ${({ shadowColor }) => `0px 3px 10px 0px ${shadowColor}`};
  z-index: 100;
`

const Text = TextSM.extend`
  color: #454545;
  text-transform: uppercase;
`

class Popover extends Component {
  shouldComponentUpdate (nextProps) {
    return (
      this.props.color !== nextProps.color ||
      this.props.isPickingColor !== nextProps.isPickingColor
    )
  }

  render () {
    const { color, left, isPickingColor } = this.props
    const mixed = transparentize(0.4, mix(0.2, color, '#AFAFAF'))

    return (
      <Container
        className='target-el'
        left={left}
        shadowColor={mixed}
        isPickingColor={isPickingColor}
      >
        <Text>{color}</Text>
        <Triangle right />
      </Container>
    )
  }
}

export default Popover
