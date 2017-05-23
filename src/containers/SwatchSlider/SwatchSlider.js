import Component from 'inferno-component'
import { connect } from 'inferno-redux'
import styled from 'styled-components'
import { Animate } from 'react-move'

import {
  updateDraggedItemXPos,
  updateStopPos
} from './../../store/stops/actions'

import { SwatchItem } from './../../components/index'
import SwatchContainer from './../../components/SwatchItem/Container'

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
      aggr[curr] = (index + 1) / stops.length * 100
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

class Slider extends Component {
  state = {
    editing: null,
    left: null
  }

  componentDidMount () {}

  componentWillReceiveProps (nextProps) {
    const { updateStopPos, stopsMap, id, draggingItemMousePos } = this.props

    const { editing } = this.state
    if (editing && draggingItemMousePos !== nextProps.draggingItemMousePos) {
      if (nextProps.draggingItemMousePos !== null) {
        const { left, right } = this.getContainerEdges(this.container)
        // const halfItemWidth = this.getItemWidth(this.item) / 2
        const fromLeft = nextProps.draggingItemMousePos - left
        const total = right - left
        let perc = (fromLeft / total * 100).toFixed(1)

        if (perc < 0) perc = 0
        else if (perc > 100) perc = 100
        // console.log(perc)
        this.setState({
          left: perc
        })
        // updateStopPos(this.state.editing, perc, stopsMap, id)
      }
    }
    if (this.props.editing !== nextProps.editing && !nextProps.editing) {
      this.setState({
        editing: null,
        left: null
      })
    }
  }

  componentWillUpdate (nextProps, nextState) {}

  componentDidUpdate (prevProps) {
    if (this.props.editing !== prevProps.editing) {
      this.props.updateDraggedItemXPos(null)
    }
  }

  _handleEditInit = (e, stop) => {
    this.setState({
      editing: parseInt(stop, 10)
    })

    this.props.updateDraggedItemXPos(e.x)
  }

  getContainerEdges (node) {
    // should memoize this, container is dynamic due to animation
    return {
      left: node.getClientRects()[0].left,
      right: node.getClientRects()[0].right
    }
  }

  getItemWidth (node) {
    if (!this.getItemWidth.width) {
      return (this.getItemWidth.width = node.getClientRects()[0].width)
    } else {
      return this.getItemWidth.width
    }
  }

  render () {
    const { stopsMap, editing, transitionDuration, style } = this.props
    const stopsMapKeys = Object.keys(stopsMap)

    if (this.state.editing) {
      return (
        <SwatchContainer
          innerRef={node => (this.container = node)}
          isMounted={editing}
          duration={transitionDuration}
          stops={stopsMapKeys.length}
          style={{
            ...style,
            zIndex: editing ? 10 : 0
          }}
        >
          <SlideBar />
          {stopsMapKeys.map((stop, index) => {
            const color = stopsMap[stop]
            const parsedStop = parseFloat(stop, 10)
            let left = parsedStop === this.state.editing
              ? this.state.left
              : parsedStop

            return (
              <SwatchItem
                innerRef={node => (this.item = node)}
                left={left}
                color={color}
              />
            )
          })}
        </SwatchContainer>
      )
    } else {
      const data = getAnimationData(stopsMapKeys, editing)

      return (
        <Animate data={data} duration={transitionDuration}>
          {data => {
            return (
              <SwatchContainer
                isMounted={editing}
                duration={transitionDuration}
                stops={stopsMapKeys.length}
                style={{
                  ...style,
                  zIndex: editing ? 10 : 0
                }}
              >
                <SlideBar
                  style={{
                    opacity: data.barOpacity
                  }}
                />
                {stopsMapKeys.map((stop, index) => {
                  const color = stopsMap[stop]
                  let left = data[stop]

                  return (
                    <SwatchItem
                      onMouseDown={e => this._handleEditInit(e, stop)}
                      color={color}
                      left={left}
                    />
                  )
                })}
              </SwatchContainer>
            )
          }}
        </Animate>
      )
    }
  }
}

export default connect(
  (state, { id }) => {
    return {
      stopsMap: state.stops.values[id],
      editing: state.stops.editing === id,
      draggingItemMousePos: state.stops.draggingItemMousePos
    }
  },
  { updateDraggedItemXPos, updateStopPos }
)(Slider)
