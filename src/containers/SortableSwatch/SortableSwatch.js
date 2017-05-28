import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Animate } from 'react-move'
import styled from 'styled-components'
import {
  SortableContainer,
  SortableElement,
  arrayMove
} from 'react-sortable-hoc'

import {
  editStop,
  swapStopsColors,
  updateDraggedStopPos,
  updateUpdatingStop
} from './../../store/stops/actions'
import {
  getStopsById,
  getStopData,
  getEditingState
} from './../../store/stops/selectors'

import { SwatchItem } from './../../components/index'
import SwatchContainer from './../../components/SwatchItem/Container'

const UPDATE_STOP_THRESHOLD = 5

const SlideBar = styled.div`
  height: 2px;
  width: 100%;
  background-color: #AFAFAF;
`

const SortableItem = SortableElement(props => <SwatchItem {...props} />)

const SortableList = SortableContainer(
  ({
    animationDuration,
    onSortItemClick,
    style,
    stopKeys,
    editing,
    updating,
    stops,
    data,
    sorting,
    ...props
  }) => {
    return (
      <Animate
        data={data}
        duration={animationDuration}
        ignore={updating !== null ? stopKeys : []}
      >
        {data => {
          return (
            <SwatchContainer
              style={{
                ...style,
                zIndex: editing ? 10 : 0,
                width: data.width
              }}
            >
              <SlideBar
                style={{
                  opacity: data.barOpacity
                }}
              />
              {stopKeys.map((stop, index) => {
                const color = stops[stop]
                let left = data[stop]
                // bug with react-sortable-hoc
                const style = sorting
                  ? {}
                  : {
                    transform: 'none',
                    transitionDuration: '0ms'
                  }
                // handling bug where data[stop] = NaN best way I know how to. A transition wont happen, the stop will just jump if the bug occurs.
                // To force it to happen: spam click the stop when editing and have cursor off the stop on mouse up. Weird!
                if (isNaN(left)) {
                  editing
                    ? (left = stop)
                    : (left = parseFloat(
                        (index + 1) / stopKeys.length * 100,
                        10
                      ))
                }

                return (
                  <SortableItem
                    {...props}
                    disabled={editing}
                    style={{
                      zIndex: updating === data[stop] ? 1000 : 0,
                      ...style
                    }}
                    key={stop}
                    index={index}
                    onMouseDown={e => onSortItemClick(e, stop, editing)}
                    onMouseUp={e => onSortItemClick(e, stop, editing)}
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
)

class Swatch extends Component {
  state = {
    sorting: false,
    enableUpdateStop: false
  }

  shouldComponentUpdate (nextProps, nextState) {
    return (
      this.props.colors !== nextProps.colors ||
      this.props.data !== nextProps.data ||
      this.props.editing !== nextProps.editing ||
      this.props.draggingItemMousePos !== nextProps.draggingItemMousePos ||
      this.props.stops !== nextProps.stops ||
      this.state.sorting !== nextState.sorting ||
      this.state.enableUpdateStop !== nextState.enableUpdateStop
    )
  }

  componentDidUpdate (prevProps) {
    if (this.props.editing !== prevProps.editing && !this.props.editing) {
      this.props.updateUpdatingStop(null)
    }
  }

  _handleSortStart = () => {
    this.setState({
      sorting: true
    })
  }

  _handleSortEnd = ({ oldIndex, newIndex }) => {
    const { swapStopsColors, id, colors } = this.props
    const newColorOrder = arrayMove(colors, oldIndex, newIndex)

    swapStopsColors(id, newColorOrder)

    this.setState({
      sorting: false
    })
  }

  _handleEditInit = (e, stop) => {
    const { updateDraggedStopPos, updateUpdatingStop } = this.props

    updateUpdatingStop(stop, e.nativeEvent.x)
    updateDraggedStopPos(e.nativeEvent.x)
  }

  _handleSortItemClick = (e, stop, editing) => {
    if (e.type === 'mousedown') {
      if (editing) {
        this._handleEditInit(e, stop)
      }
    } else if (e.type === 'mouseup') {
      const { editStop, id } = this.props
      if (!editing) {
        editStop(id)
      }
    }
  }

  render () {
    const {
      stops,
      editing,
      transitionDuration,
      style,
      data,
      updating,
      colors,
      stopKeys
    } = this.props
    const { sorting } = this.state

    return (
      colors &&
      <SortableList
        transitionDuration={300}
        axis='x'
        lockAxis='x'
        onSortStart={this._handleSortStart}
        onSortEnd={this._handleSortEnd}
        shouldCancelStart={() => editing || updating !== null}
        distance={5}
        lockToContainerEdges
        sorting={sorting}
        animationDuration={transitionDuration}
        data={data}
        onSortItemClick={this._handleSortItemClick}
        style={style}
        stopKeys={stopKeys}
        editing={editing}
        stops={stops}
        updating={updating}
      />
    )
  }
}

const mapStateToProps = (state, props) => {
  const stops = getStopsById(state, props)
  const updating = state.stops.updating.stop
  const stopKeys = Object.keys(stops)
  const editing = getEditingState(state, props)

  return {
    stops,
    stopKeys,
    editing,
    updating,
    colors: Object.values(stops),
    data: getStopData(state, props)
  }
}

export default connect(mapStateToProps, {
  editStop,
  swapStopsColors,
  updateDraggedStopPos,
  updateUpdatingStop
})(Swatch)
