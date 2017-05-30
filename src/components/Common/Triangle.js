import React from 'react' // eslint-disable-line no-unused-vars
import styled from 'styled-components'

const Triangle = styled.span`
  position: absolute;
  width: 0;
  height: 0;
  border-top: 10px solid white;
  
  ${({ right }) => (right ? 'border-left: 10px solid transparent;' : 'border-right: 10px solid transparent;')}
  bottom: -8px;
  ${({ right }) => (right ? 'right: 0;' : 'left: 0;')}
`

export default Triangle
