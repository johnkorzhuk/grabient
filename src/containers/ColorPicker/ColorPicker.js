import React from 'react'
import { connect } from 'react-redux'
import styled from 'styled-components'
import { ChromePicker } from 'react-color'

const Container = styled.div`
  position: absolute;
  z-index: 1000;
  bottom: 30px;
  right: 11px;
`

const ColorPicker = ({ color }) => {
  return (
    <Container>
      <ChromePicker disableAlpha color={color} />
    </Container>
  )
}

export default connect()(ColorPicker)
