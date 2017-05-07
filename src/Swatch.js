import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'

const SwatchContainer = styled.div`
  
`

const SwatchItem = styled.div`
  height: ${({ height }) => height};
  width: ${({ width }) => width};
  display: inline-block;
  background-color: ${({ color }) => color};
`

const Swatch = ({ height, width = height, colors }) => {
  return (
    <SwatchContainer>
      {colors.map((color, i) => (
        <SwatchItem height={height} width={width} color={color} key={i} />
      ))}
    </SwatchContainer>
  )
}

export default Swatch
