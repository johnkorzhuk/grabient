import React, { Component } from 'react'
import { connect } from 'react-redux'
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
      if (isNaN(parseFloat(curr, 10))) console.log('yo')
      aggr[curr] = parseFloat(curr, 10)
    } else {
      aggr[curr] = parseInt((index + 1) / stops.length * 100, 10)
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

  componentWillReceiveProps (nextProps) {
    const { updateStopPos, stopsMap, id, draggingItemMousePos } = this.props
    const { editing } = this.state
    if (
      editing !== null &&
      draggingItemMousePos !== nextProps.draggingItemMousePos
    ) {
      if (nextProps.draggingItemMousePos !== null) {
        const { left, right } = this.getContainerEdges(this.container)
        const fromLeft = parseInt(nextProps.draggingItemMousePos, 10) - left
        const total = right - left
        let perc = (fromLeft / total * 100).toFixed(1)

        if (perc < 0) perc = 0
        else if (perc > 100) perc = 100

        this.setState({
          left: perc
        })
      }
    }

    if (
      (this.props.editing !== nextProps.editing && !nextProps.editing) ||
      (this.props.editing && nextProps.draggingItemMousePos === null)
    ) {
      const { editing, left } = this.state
      if (this.props.draggingItemMousePos) {
        updateStopPos(editing, left, stopsMap, id)
        this.clearState()
      }
    }
  }

  componentDidUpdate (prevProps) {
    if (this.props.editing !== prevProps.editing) {
      this.props.updateDraggedItemXPos(null)
    }
  }

  _handleEditInit = (e, stop) => {
    this.setState({
      editing: parseInt(stop, 10)
    })

    this.props.updateDraggedItemXPos(e.nativeEvent.x)
  }

  clearState () {
    this.setState({
      editing: null,
      left: null
    })
  }

  getContainerEdges (node) {
    // should memoize this, container is dynamic due to animation
    return {
      left: node.getClientRects()[0].left,
      right: node.getClientRects()[0].right
    }
  }

  render () {
    const { stopsMap, editing, transitionDuration, style } = this.props
    const stopsMapKeys = Object.keys(stopsMap)

    if (this.state.editing !== null) {
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

            return <SwatchItem key={stop} left={left} color={color} />
          })}
        </SwatchContainer>
      )
    } else {
      const data = getAnimationData(stopsMapKeys, editing)

      console.log(data)

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
                  // console.log(data)
                  let left = editing
                    ? parseInt(data[stop], 10) !== parseInt(stop, 10)
                        ? data[stop]
                        : stop
                    : data[stop]

                  // let left = parseInt(data[stop], 10) !== parseInt(stop, 10)
                  //   ? stop
                  //   : editing ? stop : data[stop]

                  return (
                    <SwatchItem
                      animating
                      key={stop}
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
