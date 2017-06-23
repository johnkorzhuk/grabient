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
  cursor: grab;
  position: absolute;
  right: 0;
  z-index: ${({ active }) => (active ? 999 : 'auto')};
`

const Container = styled.div`
  display: flex;
  justify-content: center;
  position: absolute;
  height: ${SLIDER_ITEM_SIZE}rem;
  width: ${SLIDER_ITEM_SIZE}rem;
  bottom: 10px;
`

const StopText = styled.span`
  position: absolute;
  color: #606060;
  cursor: default;
  top: -15px;
  font-size: 1.2rem;

  transition: opacity 100ms linear;
  opacity: ${({ showText }) => (showText ? '1' : '0')};
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
    const isPickingColor = pickingColorStop === stop
    const shouldRenderColorPicker = isPickingColor && editingColor === id
    const shouldRenderPopover =
      hovered && !shouldRenderColorPicker && !sorting && !editing
    const mixed = mix(0.5, color, '#AFAFAF')
    const mixedTransparentized = transparentize(0.2, mix(0.5, color, '#AFAFAF'))
    const right = `calc(${100 - left}% - ${SLIDER_ITEM_SIZE / 2}rem)`

    return (
      <Container
        style={{
          right
        }}
      >
        {!editingColor &&
          <StopText showText={hovered && editing}>{stop}%</StopText>}
        {shouldRenderColorPicker &&
          <ColorPicker color={color} stop={stop} id={id} left={left} />}
        {shouldRenderPopover &&
          <Popover color={color} isPickingColor={isPickingColor} />}
        <Item
          onMouseEnter={this._handleMouseEnter}
          onMouseLeave={this._handleMouseLeave}
          mixedTransparentized={mixedTransparentized}
          color={color}
          style={{
            ...style,
            border: `1px solid ${mixed}`,
            backgroundColor: color
          }}
          active={active === stop && editing}
          {...props}
        />
      </Container>
    )
  }
}

export default SwatchItem
