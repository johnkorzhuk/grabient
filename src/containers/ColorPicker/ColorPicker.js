import React, { PureComponent } from 'react'
import { connect } from 'react-redux'
import styled from 'styled-components'
import { ChromePicker } from 'react-color'

import { updateStopColor } from './../../store/stops/actions'

const Container = styled.div`
  position: absolute;
  z-index: 1000;
  bottom: 30px;
  right: 1rem;
`

// const Container = styled.div`
//   position: absolute;
//   z-index: 1000;
//   top: 30px;
//   right: -100px;
// `

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
      </Container>
    )
  }
}

export default connect(undefined, { updateStopColor })(ColorPicker)
