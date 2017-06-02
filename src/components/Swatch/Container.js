import React from 'react' // eslint-disable-line
import styled from 'styled-components'

const SwatchContainer = styled.div`
  position: absolute;
  display: flex;
  align-items: center;
  height: 100%;
  justify-content: center;
  z-index: ${({ editing }) => (editing ? 10 : 0)};
`

export default SwatchContainer
