import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'
import { Transition } from 'react-move'

const TRANSITION_DURATION = 400

const SwatchContainer = styled(Transition)`
  
`

const SwatchItem = styled.div`
  height: ${({ height }) => height + 'px'};
  display: inline-block;
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
        color: colors[index - 1],
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
                height={height}
                style={{
                  backgroundColor: item.state.color,
                  width: item.state.width + 'px',
                  translateX: item.state.translate * 100 + 'px'
                }}
              />
            )
          })}
        </div>
      )}
    </SwatchContainer>
  )
}

export default Swatch
