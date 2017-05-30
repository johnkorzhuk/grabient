import React from 'react' // eslint-disable-line
import styled from 'styled-components'

const SwatchContainer = styled.div`
  position: absolute;
  display: flex;
  align-items: center;
  width: ${({ isMounted, stops }) => (stops ? `${stops * 30}px` : 'auto')};
  height: 100%;
  justify-content: center;
`

export default SwatchContainer
