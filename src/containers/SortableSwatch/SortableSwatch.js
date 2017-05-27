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
import { getStopsById, getStopsData } from './../../store/stops/selectors'

import { SwatchItem } from './../../components/index'
import SwatchContainer from './../../components/SwatchItem/Container'

const SlideBar = styled.div`
  height: 2px;
  width: 100%;
  background-color: #AFAFAF;
`

const SortableItem = SortableElement(props => <SwatchItem {...props} />)

const SortableList = SortableContainer(
  ({
    transitionDuration,
    onSortItemClick,
    style,
    stopKeys,
    editing,
    updating,
    stops,
    data,
    ...props
  }) => {
    return (
      <Animate
        data={data}
        duration={transitionDuration}
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

                return (
                  <SortableItem
                    {...props}
                    disabled={editing}
                    style={{
                      zIndex: updating === data[stop] ? 1000 : 0
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
  shouldComponentUpdate (nextProps, nextState) {
    return (
      this.props.colors !== nextProps.colors ||
      this.props.data !== nextProps.data ||
      this.props.editing !== nextProps.editing ||
      this.props.draggingItemMousePos !== nextProps.draggingItemMousePos ||
      this.props.stops !== nextProps.stops
    )
  }

  componentDidUpdate (prevProps) {
    if (this.props.editing !== prevProps.editing && !this.props.editing) {
      this.props.updateUpdatingStop(null)
    }
  }

  _handleEditInit = (e, stop) => {
    const { updateDraggedStopPos, updateUpdatingStop } = this.props

    updateUpdatingStop(stop)
    updateDraggedStopPos(e.nativeEvent.x)
  }

  _handleSortEnd = ({ oldIndex, newIndex }) => {
    const { swapStopsColors, id, colors } = this.props
    const newColorOrder = arrayMove(colors, oldIndex, newIndex)

    swapStopsColors(id, newColorOrder)
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

    return (
      colors &&
      <SortableList
        axis='x'
        lockAxis='x'
        onSortEnd={this._handleSortEnd}
        distance={5}
        lockToContainerEdges
        transitionDuration={transitionDuration}
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

const mapStateToProps = (state, { id }) => {
  const stops = getStopsById(state, id)
  const updating = state.stops.updating.stop
  const stopKeys = Object.keys(stops)
  const editing = state.stops.editing === id
  const containerDimenions = state.dimensions.swatch

  return {
    stops,
    stopKeys,
    editing,
    updating,
    colors: Object.values(stops),
    data: getStopsData(stopKeys, editing, containerDimenions)
  }
}

export default connect(mapStateToProps, {
  editStop,
  swapStopsColors,
  updateDraggedStopPos,
  updateUpdatingStop
})(Swatch)
