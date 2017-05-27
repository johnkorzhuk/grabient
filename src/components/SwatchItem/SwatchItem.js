import React from 'react'
import styled from 'styled-components'
import { mix } from 'polished'

// rem
const SLIDER_ITEM_SIZE = 2

const Item = styled.div`
  height: 2rem;
  width: 2rem;
  border-radius: 50%;
  cursor: pointer;
  position: absolute;
  border: ${({ mixedColor }) => `1px solid ${mixedColor}`};
  background-color: ${({ color }) => color};

  &:hover,
  &:active {
    z-index: 1000;
    box-shadow: ${({ mixedColor }) => '0px 3px 10px 1px ' + mixedColor};
  }
`

const SwatchItem = ({ color, left, animating, style, ...props }) => {
  const mixed = mix(0.5, color, '#AFAFAF')
  left = `calc(${left}% - ${SLIDER_ITEM_SIZE / 2}rem)`

  return (
    <Item
      {...props}
      mixedColor={mixed}
      color={color}
      style={{
        ...style,
        left
      }}
    />
  )
}

export default SwatchItem
