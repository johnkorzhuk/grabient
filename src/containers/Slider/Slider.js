import Component from 'inferno-component'
import { connect } from 'inferno-redux'
import styled from 'styled-components'
import { Animate } from 'react-move'

// ms
const ANIMATION_DURATION = 300
// rem
// const SLIDER_ITEM_SIZE = 2

const Container = styled.div`
  position: relative;
  height: 25px;
  display: flex;
  align-items: center;
  align-self: flex-end;
  transition: ${({ duration }) => `transform ${duration}ms linear, width ${duration}ms linear`};
  width: ${({ isMounted, stops }) => (isMounted ? '100%' : `${stops * 35}px`)};
  transform: ${({ isMounted }) => (isMounted ? 'translateX(0)' : 'translateX(-65px)')};
`

const SlideBar = styled.div`
  height: 2px;
  width: 100%;
  box-shadow: 1px 2px 4px 2px rgba(0, 0, 0, 0.1);
`

const SlideBarItem = styled.div`
  height: 25px;
  width: 25px;
  border-radius: 50%;
  cursor: pointer;
  position: absolute;
  z-index: 20;
  box-shadow: ${({ isMounted }) => (isMounted ? '1px 2px 3px 1px rgba(0, 0, 0, 0.2)' : 'none')};
`

const getAnimationData = (stops, isMounted) => {
  let data = stops.reduce((aggr, curr, index) => {
    if (isMounted) {
      aggr[curr] = parseInt(curr, 10)
    } else {
      aggr[curr] = 100 / stops.length * (index + 1)
    }
    return aggr
  }, {})

  if (isMounted) {
    data.scale = 0.7
    data.barOpacity = 1
  } else {
    data.scale = 1
    data.barOpacity = 0
  }

  return data
}

// right: 65px for container
class Slider extends Component {
  render () {
    const { stopsMap, editing } = this.props
    const stopsMapKeys = Object.keys(stopsMap)
    const data = getAnimationData(stopsMapKeys, editing)

    return (
      <Animate data={data} duration={ANIMATION_DURATION}>
        {data => {
          return (
            <Container
              isMounted={editing}
              duration={ANIMATION_DURATION}
              stops={stopsMapKeys.length}
            >
              <SlideBar
                style={{
                  opacity: data.barOpacity
                }}
              />
              {stopsMapKeys.map((stop, index) => {
                const color = stopsMap[stop]

                return (
                  <SlideBarItem
                    isMounted={editing}
                    style={{
                      border: editing
                        ? '2px solid white'
                        : '1px solid rgba(0, 0, 0, 0.1)',
                      height: data.size,
                      width: data.size,
                      left: stop === '100'
                        ? editing
                            ? `calc(100% - ${data.size}px)`
                            : `${data[stop]}%`
                        : `${data[stop]}%`,
                      backgroundColor: `${color}`
                    }}
                  />
                )
              })}
            </Container>
          )
        }}
      </Animate>
    )
  }
}

export default connect((state, { id }) => ({
  stopsMap: state.stops.values[id],
  editing: state.stops.editing === id
}))(Slider)
