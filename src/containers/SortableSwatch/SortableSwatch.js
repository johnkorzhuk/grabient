import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Animate } from 'react-move'
import styled from 'styled-components'
import {
  SortableContainer,
  SortableElement,
  arrayMove
} from 'react-sortable-hoc'

import { toggleEditing } from './../../store/gradients/actions'
import {
  editStop,
  swapStopsColors,
  updateDraggedStopPos,
  updateUpdatingStop,
  updateActiveColorPicker,
  updateActiveStop
} from './../../store/stops/actions'
import {
  getStopsById,
  getStopData,
  getEditingState
} from './../../store/stops/selectors'

import { SwatchItem, SwatchContainer } from './../../components/Swatch/index'

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
    updatingValue,
    editingAngle,
    stops,
    data,
    sorting,
    pickingColorStop,
    passThreshold,
    active,
    ...props
  }) => {
    const isUpdating = updatingValue !== null

    return (
      <Animate
        data={data}
        duration={animationDuration}
        ignore={isUpdating ? stopKeys : []}
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
                let style = sorting
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
                    editing={editing}
                    stop={stop}
                    pickingColorStop={pickingColorStop}
                    style={{
                      ...style
                    }}
                    isUpdating={isUpdating}
                    key={stop}
                    index={index}
                    sorting={sorting}
                    onMouseDown={e =>
                      onSortItemClick(
                        e,
                        stop,
                        editing,
                        sorting,
                        pickingColorStop
                      )}
                    onMouseUp={e => onSortItemClick(e, stop, editing, sorting)}
                    color={color}
                    left={left}
                    active={active}
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
    sorting: false
  }

  shouldComponentUpdate (nextProps, nextState) {
    return (
      this.props.colors !== nextProps.colors ||
      this.props.data !== nextProps.data ||
      this.props.editing !== nextProps.editing ||
      this.props.draggingItemMousePos !== nextProps.draggingItemMousePos ||
      this.props.stops !== nextProps.stops ||
      this.state.sorting !== nextState.sorting
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
    this.props.updateActiveStop(null)
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

  _handleSortItemClick = (e, stop, editing, sorting, pickingColorStop) => {
    if (e.type === 'mousedown') {
      this.props.toggleEditing(null)
      this.props.updateActiveColorPicker(stop, pickingColorStop)
      this.props.updateActiveStop(stop)
      if (editing) {
        this._handleEditInit(e, stop)
      }
    } else if (e.type === 'mouseup') {
      const { editStop, id } = this.props
      if (!editing && !sorting) {
        editStop(id)
      }
    }
  }

  render () {
    const { stops, editing, updatingValue, colors, ...props } = this.props
    const { sorting } = this.state

    return (
      colors &&
      <SortableList
        transitionDuration={300}
        axis='x'
        useWindowAsScrollContainer
        lockAxis='x'
        onSortStart={this._handleSortStart}
        onSortEnd={this._handleSortEnd}
        shouldCancelStart={() => editing || updatingValue !== null}
        distance={5}
        lockToContainerEdges
        sorting={sorting}
        onSortItemClick={this._handleSortItemClick}
        editing={editing}
        stops={stops}
        updatingValue={updatingValue}
        {...props}
      />
    )
  }
}

const mapStateToProps = (state, props) => {
  const stops = getStopsById(state, props)
  const updatingValue = state.stops.updating.stop
  const stopKeys = Object.keys(stops)
  const colors = Object.values(stops)
  const editing = getEditingState(state, props)

  return {
    stops,
    updatingValue,
    stopKeys,
    colors,
    editing,
    editingAngle: state.gradients.editingAngle.id !== null,
    data: getStopData(state, props),
    pickingColorStop: state.stops.updating.pickingColorStop,
    passThreshold: state.stops.updating.passThreshold,
    active: state.stops.updating.active
  }
}

export default connect(mapStateToProps, {
  editStop,
  swapStopsColors,
  updateDraggedStopPos,
  updateUpdatingStop,
  toggleEditing,
  updateActiveColorPicker,
  updateActiveStop
})(Swatch)
