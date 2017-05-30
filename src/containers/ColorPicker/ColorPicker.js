import React, { PureComponent } from 'react'
import { connect } from 'react-redux'
import styled from 'styled-components'
import { ChromePicker } from 'react-color'

import { updateStopColor } from './../../store/stops/actions'

import { Triangle } from './../../components/Common/index'

const Container = styled.div`
  position: absolute;
  z-index: 1000;
  bottom: 30px;
  right: 1rem;
`

class ColorPicker extends PureComponent {
  shouldComponentUpdate (nextProps) {
    return (
      this.props.color !== nextProps.color || this.props.stop !== nextProps.stop
    )
  }

  _handleColorChange = ({ hex }) => {
    const { updateStopColor, stop, id } = this.props

    updateStopColor(stop, hex, id)
  }

  render () {
    const { color } = this.props

    return (
      <Container>
        <ChromePicker
          disableAlpha
          color={color}
          onChange={this._handleColorChange}
        />
        <Triangle right />
      </Container>
    )
  }
}

export default connect(undefined, { updateStopColor })(ColorPicker)
