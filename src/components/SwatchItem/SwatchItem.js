import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'
import { mix } from 'polished'

const Item = styled.div`
  height: 20px;
  width: 20px;
  border-radius: 50%;
  cursor: pointer;
  position: absolute;

  &:hover {
    boxShadow: ${({ color }) => '0px 3px 10px 1px' + color};
  }
`

const SwatchItem = ({ style, onClick }) => {
  const mixed = mix(0.5, style.backgroundColor, '#AFAFAF')

  return (
    <Item
      color={mixed}
      style={{
        ...style,
        border: `1px solid ${mixed}`
      }}
      onClick={onClick}
    />
  )
}

export default SwatchItem
