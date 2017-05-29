import React, { Component } from 'react'
import styled from 'styled-components'
import { mix } from 'polished'

import { ColorPicker } from './../../containers/index'

// rem
const SLIDER_ITEM_SIZE = 2

const Item = styled.div`
  height: ${SLIDER_ITEM_SIZE}rem;
  width: ${SLIDER_ITEM_SIZE}rem;
  border-radius: 50%;
  cursor: pointer;
  position: absolute;
  border: ${({ mixedColor }) => `1px solid ${mixedColor}`};
  background-color: ${({ color }) => color};

  &:hover,
  &:active {
    z-index: 99;
    box-shadow: ${({ mixedColor }) => '0px 3px 10px 1px ' + mixedColor};
  }
`

const Container = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: flex-end;
  position: absolute;
  height: ${SLIDER_ITEM_SIZE}rem;
  width: ${SLIDER_ITEM_SIZE}rem;
  bottom: 10px;
`

class SwatchItem extends Component {
  _handleClick = () => {
    this.props.toggleEditing(null)
    this.setState(prevState => ({
      pickingColor: !prevState.pickingColor
    }))
  }

  render () {
    const {
      color,
      left,
      animating,
      style,
      isUpdating,
      pickingColorStop,
      editing,
      stop,
      ...props
    } = this.props

    const shouldRenderColorPicker =
      pickingColorStop === stop && editing && !isUpdating
    const mixed = mix(0.5, color, '#AFAFAF')
    const right = `calc(${100 - left}% - ${SLIDER_ITEM_SIZE / 2}rem)`

    return (
      <Container
        mixedColor={mixed}
        color={color}
        style={{
          right
        }}
      >
        {shouldRenderColorPicker && <ColorPicker color={color} />}
        <Item mixedColor={mixed} color={color} style={style} {...props} />
      </Container>
    )
  }
}

export default SwatchItem
