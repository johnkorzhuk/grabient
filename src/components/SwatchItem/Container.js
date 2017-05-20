import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'

const SwatchContainer = styled.div`
  right: 25px;
  position: absolute;
  height: 25px;
  display: flex;
  align-items: center;
  align-self: flex-end;
  transition: ${({ duration }) => `width ${duration}ms linear`};
  width: ${({ isMounted, stops }) => (isMounted ? 'calc(100% - 25px)' : `${stops * 35}px`)};
`

export default SwatchContainer
