import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'
import { mix } from 'polished'

// rem
const SLIDER_ITEM_SIZE = 2

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

const SwatchItem = ({ color, left, ...props }) => {
  const mixed = mix(0.5, color, '#AFAFAF')

  return (
    <Item
      {...props}
      color={mixed}
      style={{
        border: `1px solid ${mixed}`,
        left: `calc(${left}% - ${SLIDER_ITEM_SIZE / 2}rem)`,
        backgroundColor: color
      }}
    />
  )
}

export default SwatchItem
