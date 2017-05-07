import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'
import { Transition } from 'react-move'

const TRANSITION_DURATION = 400

const SwatchContainer = styled(Transition)`
  
`

const SwatchItem = styled.div`
  height: ${({ height }) => height + 'px'};
  width: ${({ width }) => width + 'px'};
  display: inline-block;
  transform: ${({ translateX }) => translateX + 'px'}
  background-color: ${({ color }) => color};

  transition: background-color ${TRANSITION_DURATION}ms linear
`

const Swatch = ({ height, width = height, colors }) => {
  return (
    <SwatchContainer
      data={colors}
      getKey={(item, index) => index}
      update={(item, index) => ({
        translate: 1,
        color: colors[index],
        width
      })}
      enter={(item, index) => ({
        translate: 0,
        color: colors[index + 1],
        width: 0
      })}
      leave={(item, index) => ({
        translate: 0,
        color: colors[index - 1],
        width: 0
      })}
      duration={TRANSITION_DURATION}
    >
      {data => (
        <div>
          {data.map((item, index) => {
            return (
              <SwatchItem
                key={item.key}
                color={item.state.color}
                width={item.state.width}
                height={height}
                translateX={item.state.translate * 100}
              />
            )
          })}
        </div>
      )}
    </SwatchContainer>
  )
}

// {colors.map((color, i) => (
// <SwatchItem height={height} width={width} color={color} key={i} />
// ))}

export default Swatch
