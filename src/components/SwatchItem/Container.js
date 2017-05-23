import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'

const SwatchContainer = styled.div`
  position: absolute;
  display: flex;
  align-items: center;
  transition: ${({ duration }) => `width ${duration}ms linear`};
  width: ${({ isMounted, stops }) => (isMounted ? '100%' : `${stops * 30}px`)};
  height: 100%;
`

export default SwatchContainer
