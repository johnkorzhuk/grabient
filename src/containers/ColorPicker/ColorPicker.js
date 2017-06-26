import React, { Component } from 'react'
import { connect } from 'react-redux'
import styled from 'styled-components'
import { ChromePicker } from 'react-color'

import {
  updateStopColor,
  updateActiveColorPicker,
  editStopColor
} from './../../store/stops/actions'

import { Triangle } from './../../components/Common/index'

const Container = styled.div`
  position: absolute;
  z-index: 25;
  bottom: 30px;
  ${({ right }) => (right ? 'left: 1rem;' : 'right: 1rem;')}
`

class ColorPicker extends Component {
  state = {
    renderRight: false
  }

  componentDidMount () {
    if (this.container.getClientRects()[0].left < 0) {
      this.setState({
        renderRight: true
      })
    }
  }

  componentWillReceiveProps (nextProps) {
    if (
      // eslint-disable-next-line eqeqeq
      nextProps.left == nextProps.stop &&
      this.container.getClientRects()[0].left < 0
    ) {
      this.setState({
        renderRight: true
      })
    }
  }

  shouldComponentUpdate (nextProps, nextState) {
    return (
      this.props.color !== nextProps.color ||
      this.props.stop !== nextProps.stop ||
      this.props.left !== nextProps.left ||
      this.props.left === nextProps.left ||
      this.state.renderRight !== nextState.renderRight
    )
  }

  _handleColorChange = ({ hex }) => {
    const { updateStopColor, stop, id } = this.props

    updateStopColor(stop, hex, id)
  }

  _handleKeyEnter = e => {
    if (e.which === 13) {
      this.props.updateActiveColorPicker(null)
      this.props.editStopColor(null)
    }
  }

  render () {
    const { color } = this.props
    const { renderRight } = this.state

    return (
      <Container
        right={renderRight}
        onKeyDown={this._handleKeyEnter}
        innerRef={node => {
          if (node) {
            this.container = node
          }
        }}
      >
        <ChromePicker
          disableAlpha
          color={color}
          onChange={this._handleColorChange}
        />
        <Triangle right={!renderRight} />
      </Container>
    )
  }
}

export default connect(undefined, {
  updateStopColor,
  updateActiveColorPicker,
  editStopColor
})(ColorPicker)
