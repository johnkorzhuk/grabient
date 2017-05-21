import Component from 'inferno-component'
import { connect } from 'inferno-redux'
import styled from 'styled-components'
import { Animate } from 'react-move'

import { SwatchItem } from './../../components/index'

import SwatchContainer from './../../components/SwatchItem/Container'

// rem
const SLIDER_ITEM_SIZE = 2

const SlideBar = styled.div`
  height: 2px;
  width: 100%;
  background-color: #AFAFAF;
`

const getAnimationData = (stops, isMounted) => {
  let data = stops.reduce((aggr, curr, index) => {
    if (isMounted) {
      aggr[curr] = parseInt(curr, 10)
    } else {
      aggr[curr] = index / stops.length * 100
    }
    return aggr
  }, {})

  if (isMounted) {
    data.barOpacity = 1
  } else {
    data.barOpacity = 0
  }

  return data
}

// right: 65px for container
class Slider extends Component {
  render () {
    const { stopsMap, editing, transitionDuration, style } = this.props
    const stopsMapKeys = Object.keys(stopsMap)
    const data = getAnimationData(stopsMapKeys, editing)

    return (
      <Animate data={data} duration={transitionDuration}>
        {data => {
          return (
            // when active this width = 100% - 30px
            (
              <SwatchContainer
                isMounted={editing}
                duration={transitionDuration}
                stops={stopsMapKeys.length}
                style={style}
              >
                <SlideBar
                  style={{
                    opacity: data.barOpacity
                  }}
                />
                {stopsMapKeys.map((stop, index) => {
                  const color = stopsMap[stop]
                  let left = `${data[stop]}%`
                  if (stop === '100') {
                    left = `calc(100% - ${SLIDER_ITEM_SIZE}rem)`
                  }

                  return (
                    <SwatchItem
                      style={{
                        left,
                        backgroundColor: `${color}`,
                        marginLeft: 0,
                        position: 'absolute'
                      }}
                    />
                  )
                })}
              </SwatchContainer>
            )
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

// <Animate data={data} duration={ANIMATION_DURATION}>
//         {data => {
//           return (
//             <Container
//               isMounted={editing}
//               duration={ANIMATION_DURATION}
//               stops={stopsMapKeys.length}
//             >
//               <SlideBar
//                 style={{
//                   opacity: data.barOpacity
//                 }}
//               />
//               {stopsMapKeys.map((stop, index) => {
//                 const color = stopsMap[stop]

//                 return (
//                   <SwatchItem
//                     style={{
//                       left: stop === '100'
//                         ? editing
//                             ? `calc(100% - ${SLIDER_ITEM_SIZE}rem)`
//                             : `${data[stop]}%`
//                         : `${data[stop]}%`,
//                       backgroundColor: `${color}`,
//                       marginLeft: 0,
//                       position: 'absolute'
//                     }}
//                   />
//                 )
//               })}
//             </Container>
//           )
//         }}
//       </Animate>
