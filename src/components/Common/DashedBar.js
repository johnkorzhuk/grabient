import React from 'react'
// import styled from 'styled-components'

import Container from './Container'

const Bar = Container.extend`
  background-image: linear-gradient(to right, #A7A7A7 40%, rgba(255, 255, 255, 0) 20%);
  background-position: top;
  background-size: 5px 1px;
  background-repeat: repeat-x;
  height: 1px;
`

const DashedBar = () => {
  return <Bar />
}

export default DashedBar
