import React, { Component } from 'react'
import styled from 'styled-components'
import { mix, transparentize } from 'polished'

import { Popover } from './../index'
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
  box-shadow: ${({ mixedTransparentized, active }) => (active ? '0px 3px 10px 1px ' + mixedTransparentized : '0px 0px 0px 0px ' + mixedTransparentized)};
  z-index: ${({ active }) => (active ? 99 : 'auto')};

  &:hover,
  &:active {
    z-index: 99;
    box-shadow: ${({ mixedTransparentized }) => '0px 3px 10px 1px ' + mixedTransparentized};
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
  state = {
    hovered: false
  }

  shouldComponentUpdate (nextProps, nextState) {
    return (
      this.props.color !== nextProps.color ||
      this.props.left !== nextProps.left ||
      this.props.style !== nextProps.style ||
      this.props.isUpdating !== nextProps.isUpdating ||
      this.props.pickingColorStop !== nextProps.pickingColorStop ||
      this.props.editing !== nextProps.editing ||
      this.props.stop !== nextProps.stop ||
      this.props.active !== nextProps.active ||
      this.props.sorting !== nextProps.sorting ||
      this.state.hovered !== nextState.hovered
    )
  }

  _handleMouseEnter = () => {
    this.setState({
      hovered: true
    })
  }

  _handleMouseLeave = () => {
    this.setState({
      hovered: false
    })
  }

  render () {
    const {
      color,
      left,
      style,
      isUpdating,
      pickingColorStop,
      editing,
      editingColor,
      stop,
      id,
      active,
      sorting,
      ...props
    } = this.props
    const { hovered } = this.state
    // const shouldRenderColorPicker = true
    const shouldRenderColorPicker =
      pickingColorStop === stop && editingColor === id && !isUpdating
    const shouldRenderPopover =
      hovered && !shouldRenderColorPicker && !sorting && !editing && !active

    // const shouldRenderPopover = true
    const mixed = mix(0.5, color, '#AFAFAF')
    const mixedTransparentized = transparentize(0.2, mix(0.5, color, '#AFAFAF'))
    const right = `calc(${100 - left}% - ${SLIDER_ITEM_SIZE / 2}rem)`

    return (
      <Container
        style={{
          right
        }}
      >
        {shouldRenderColorPicker &&
          <ColorPicker color={color} stop={stop} id={id} left={left} />}
        {shouldRenderPopover && <Popover color={color} />}
        <Item
          onMouseEnter={this._handleMouseEnter}
          onMouseLeave={this._handleMouseLeave}
          mixedColor={mixed}
          mixedTransparentized={mixedTransparentized}
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
