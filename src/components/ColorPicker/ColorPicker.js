import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'
import { ChromePicker } from 'react-color'

const Container = styled.div`
  position: absolute;
  z-index: 100;
`

const ColorPicker = () => {
  return (
    <Container>
      <ChromePicker disableAlpha />
    </Container>
  )
}

export default ColorPicker
