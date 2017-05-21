import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'

const SwatchContainer = styled.div`
  right: 30px;
  position: absolute;
  display: flex;
  align-items: center;
  transition: ${({ duration }) => `width ${duration}ms linear`};
  width: ${({ isMounted, stops }) => (isMounted ? 'calc(100% - 30px)' : `${stops * 30}px`)};
  height: 40px;
`

export default SwatchContainer
