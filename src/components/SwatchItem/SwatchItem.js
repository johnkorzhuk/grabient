import React, { PureComponent } from 'react'
import styled from 'styled-components'
import { mix, transparentize } from 'polished'

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
  box-shadow: ${({ mixedColor, active }) => (active ? '0px 3px 10px 1px ' + transparentize(0.2, mixedColor) : '0px 0px 0px 0px ' + mixedColor)};
  z-index: ${({ active }) => (active ? 99 : 'auto')};

  &:hover,
  &:active {
    z-index: 99;
    box-shadow: ${({ mixedColor }) => '0px 3px 10px 1px ' + transparentize(0.2, mixedColor)};
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

class SwatchItem extends PureComponent {
  shouldComponentUpdate (nextProps) {
    return (
      this.props.color !== nextProps.color ||
      this.props.left !== nextProps.left ||
      this.props.style !== nextProps.style ||
      this.props.isUpdating !== nextProps.isUpdating ||
      this.props.pickingColorStop !== nextProps.pickingColorStop ||
      this.props.editing !== nextProps.editing ||
      this.props.stop !== nextProps.stop ||
      this.props.active !== nextProps.active
    )
  }

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
      style,
      isUpdating,
      pickingColorStop,
      editing,
      stop,
      id,
      active,
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
        {shouldRenderColorPicker &&
          <ColorPicker color={color} stop={stop} id={id} />}
        <Item
          mixedColor={mixed}
          color={color}
          style={style}
          active={active === stop && editing}
          {...props}
        />
      </Container>
    )
  }
}

export default SwatchItem
