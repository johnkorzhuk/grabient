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
  updateDraggedItemXPos,
  updateStopPos
} from './../../store/stops/actions'
import {
  getStopsById,
  getStopColors,
  getStopsData
} from './../../store/stops/selectors'

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
    pickingColor,
    style,
    stopsMapKeys,
    editing,
    stopsMap,
    data,
    ...props
  }) => {
    return (
      <Animate data={data} duration={transitionDuration}>
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
              {stopsMapKeys.map((stop, index) => {
                const color = stopsMap[stop]
                let left = data[stop]
                return (
                  <SortableItem
                    {...props}
                    disabled={pickingColor || editing}
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
    colors: null,
    editing: null,
    left: null,
    data: this.props.data
  }

  componentDidMount () {
    this.setState({
      colors: this.props.colors
    })
  }

  componentWillReceiveProps (nextProps) {
    const { updateStopPos, stopsMap, id, draggingItemMousePos } = this.props
    const { editing } = this.state
    if (
      editing !== null &&
      draggingItemMousePos !== nextProps.draggingItemMousePos
    ) {
      if (nextProps.draggingItemMousePos !== null) {
        const { left, right } = this.props.containerDimenions
        const fromLeft = parseInt(nextProps.draggingItemMousePos, 10) - left
        const total = right - left
        let perc = (fromLeft / total * 100).toFixed(1)

        if (perc < 0) perc = 0
        else if (perc > 100) perc = 100

        let data = { ...this.props.data }
        delete data[this.state.editing]
        const val = Math.round(perc)
        data[val] = val

        this.setState({
          left: perc,
          data
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

    if (this.props.editing !== nextProps.editing) {
      let data = { ...nextProps.data }
      data['barOpacity'] = nextProps.editing === false ? 0 : 1
      this.setState({
        data
      })
    }
    // update state.colors when a gradient stop is added
    if (this.props.colors.length !== nextProps.colors.length) {
      this.setState({
        colors: nextProps.colors
      })
    }
  }

  componentDidUpdate (prevProps) {
    if (this.props.editing !== prevProps.editing && !this.props.editing) {
      this.props.updateDraggedItemXPos(null)
    }
  }

  _handleEditInit = (e, stop) => {
    this.setState({
      editing: parseInt(stop, 10)
    })

    this.props.updateDraggedItemXPos(e.nativeEvent.x)
  }

  _onSortEnd = ({ oldIndex, newIndex }) => {
    const colors = arrayMove(this.state.colors, oldIndex, newIndex)
    const { swapStopsColors, id } = this.props
    this.setState({
      colors
    })

    swapStopsColors(id, colors)
  }

  _handleSortItemClick = (e, stop, editing) => {
    if (editing && e.type === 'mousedown') {
      this._handleEditInit(e, stop)
    } else if (e.type === 'mouseup') {
      this.props.editStop(this.props.id)
    }
  }

  clearState () {
    this.setState({
      editing: null,
      left: null
    })
  }

  render () {
    const {
      stopsMap,
      editing,
      transitionDuration,
      style,
      containerDimenions
    } = this.props
    const stopsMapKeys = Object.keys(stopsMap)
    const { pickingColor, colors } = this.state
    if (this.state.editing !== null) {
      return (
        <SwatchContainer
          isMounted={editing}
          stops={stopsMapKeys.length}
          style={{
            ...style,
            zIndex: editing ? 10 : 0,
            width: containerDimenions.width
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
      return (
        colors &&
        <SortableList
          axis='x'
          data={this.state.data}
          lockAxis='x'
          pickingColor={pickingColor}
          transitionDuration={transitionDuration}
          onSortItemClick={this._handleSortItemClick}
          onSortStart={this._onSortStart}
          onSortEnd={this._onSortEnd}
          style={style}
          distance={5}
          lockToContainerEdges
          stopsMapKeys={stopsMapKeys}
          editing={editing}
          stopsMap={stopsMap}
        />
      )
    }
  }
}

export default connect(
  (state, { id, containerDimenions }) => ({
    editing: state.stops.editing === id,
    stops: getStopsById(state, id),
    colors: getStopColors(id)(state),
    data: getStopsData(id, containerDimenions)(state),
    stopsMap: state.stops.values[id],
    draggingItemMousePos: state.stops.draggingItemMousePos
  }),
  { editStop, swapStopsColors, updateDraggedItemXPos, updateStopPos }
)(Swatch)
