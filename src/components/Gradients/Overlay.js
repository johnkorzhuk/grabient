import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'

const BluredBGC = styled.svg`
  width: 100%;
  height: 100%;
  z-index: 10;
  background-color: #fff;
  opacity: .5;
`

const Overlay = () => {
  return <BluredBGC />
}

export default Overlay
