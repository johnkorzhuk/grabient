import React, { Component } from 'react'
import { connect } from 'react-redux'
import styled from 'styled-components'
import debounce from 'lodash/debounce'

import {
  toggleEditing,
  updateEditingAngle
} from './../../store/gradients/actions'
import {
  editStop,
  updateActiveColorPicker,
  addColorStop,
  editStopColor
} from './../../store/stops/actions'
import { updateSwatchDimensions } from './../../store/dimensions/actions'
import { copyCSS } from './../../store/icons/actions'
import { getGradientById } from './../../store/gradients/selectors'
import { getStopsById } from './../../store/stops/selectors'

import {
  AnglePreview,
  GradientContainer,
  AddDeleteStop
} from './../../components/index'
import { AddColor } from './../../components/Icons/index'
import { SortableSwatch } from './../index'
import { Button } from './../../components/Common/index'

// units = ms
const GRADIENT_ANIMATION_DURATION = 500
const ANGLE_WHEEL_ANIMATION_DURATION = 300
const ANGLE_PREVIEW_ANIMATION_DURATION = 200
// also used for icon opacity transition duration
const SLIDER_ANIMATION_DURATION = 300

const ICON_COLOR = '#afafaf'

const getOrder = (index, columns) => {
  if (index % columns === 0) return index
  if (index % columns === 1) return index - 2
  if (index % columns === 2) return index - 3
  return index
}

const Container = styled.li`
  width: 85%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 0 2% 30px;
  position: relative;
  transition: width 400ms linear;

  @media (min-width: 420px) {
    width: 100%;
  }
`

const GradientItem = Container.extend`
  order: ${({ index }) => index};
  z-index: ${({ editing }) => (editing ? 21 : 'auto')};

  @media (min-width: 680px) {
    width: ${({ expanded }) => (expanded ? '100%' : '50%')};
    order: ${({ index, expanded }) => (expanded ? getOrder(index, 2) : index)};
  }

  @media (min-width: 970px) {
    width: ${({ expanded }) => (expanded ? '100%' : '33.33%')};
    order: ${({ index, expanded }) => (expanded ? getOrder(index, 3) : index)};
  }
`

const AngleContainer = Button.extend`
  margin-right: auto;
  position: absolute;
  height: 40px;
  width: 60px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  z-index: 10;
`

const InfoContainer = styled.div`
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  z-index: 10;
  margin-top: 15px;
`

const SwatchSliderContainer = styled.div`
  position: relative;
  width: 100%;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  height: 40px;
  margin-right: 4rem;
  margin-left: 4rem;
`

const AddColorButton = Button.extend`
  position: absolute;
  right: 0;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 25px;
`

const addEvent = function (object, type, callback) {
  if (object == null || typeof object === 'undefined') return
  if (object.addEventListener) {
    object.addEventListener(type, debounce(callback, 100), false)
  } else if (object.attachEvent) {
    object.attachEvent('on' + type, debounce(callback, 100))
  } else {
    object['on' + type] = debounce(callback, 100)
  }
}

class GradientCard extends Component {
  state = {
    hovered: {
      arrowPrev: false,
      addColor: false,
      main: false,
      expandContract: false
    },
    wasEditing: false
  }

  componentDidMount () {
    addEvent(window, 'resize', this._handleWindowResize)
  }

  componentWillUnmount () {
    window.removeEventListener('resize')
  }

  componentWillReceiveProps (nextProps) {
    const { editingAngle, editingStop, updateSwatchDimensions } = this.props
    if (editingAngle !== nextProps.editingAngle) {
      this.setState({ wasEditing: !nextProps.editingAngle })
    }

    if (editingStop !== nextProps.editingStop) {
      updateSwatchDimensions(this.sliderContainer.getClientRects())
    }
  }

  _handleWindowResize = e => {
    if (this.props.editingStop) {
      this.props.updateSwatchDimensions(this.sliderContainer.getClientRects())
    }
  }

  _handleMouseEnter = (e, items) => {
    if (!this.state.wasEditing) {
      this.setItemHoveredState(items, true, false)
    }
  }

  _handleMouseLeave = (e, items) => {
    this.setItemHoveredState(items, false, true)
  }

  _handleAddCancelColorStop = () => {
    const {
      editingStop,
      editStop,
      updateActiveColorPicker,
      id,
      pickingColorStop,
      editStopColor
    } = this.props
    if (pickingColorStop) {
      editStopColor(null)
      return updateActiveColorPicker(null)
    }

    if (editingStop) {
      editStop(null)
    } else if (!pickingColorStop) {
      editStop(id)
    }
  }

  _handleLeftIconClick = () => {
    const {
      toggleEditing,
      updateEditingAngle,
      updateActiveColorPicker,
      pickingColorStop,
      id,
      angle,
      editingStop,
      addColorStop
    } = this.props
    if (!editingStop) {
      if (pickingColorStop) {
        updateActiveColorPicker(null)
      }
      toggleEditing(id)
      updateEditingAngle(angle)
    } else {
      addColorStop(id)
    }
  }

  setItemHoveredState (items, hovered, resetWasEditing) {
    const newState = { ...this.state }
    items.forEach(item => {
      newState.hovered[item] = hovered
    })

    if (resetWasEditing) newState.wasEditing = false

    this.setState(newState)
  }

  render () {
    const { hovered: { arrowPrev, addColor, main } } = this.state
    const {
      id,
      angle,
      editingAngleData,
      editingStop,
      index,
      stopData,
      pickingColorStop,
      expanded,
      editingColor,
      renderDelete,
      renderDeleteInverted,
      copyCSS,
      style,
      copiedId
    } = this.props

    const editingAngle = id === editingAngleData.id
    const editing = editingStop || editingAngle || editingColor
    const actualAngle = editingAngle ? editingAngleData.angle : angle

    return (
      <GradientItem
        index={index}
        expanded={expanded}
        editing={editing}
        style={style}
      >
        <GradientContainer
          onCopyCSS={copyCSS}
          stopData={stopData}
          actualAngle={actualAngle}
          onMouseEnter={this._handleMouseEnter}
          onMouseLeave={this._handleMouseLeave}
          gradientAnimationDuration={GRADIENT_ANIMATION_DURATION}
          wheelAnimationDuration={ANGLE_WHEEL_ANIMATION_DURATION}
          id={id}
          hovered={main}
          editingAngle={editingAngle}
          editingStop={editingStop}
          editingColor={editingColor}
          pickingColorStop={pickingColorStop}
          copiedId={copiedId}
        />

        <InfoContainer>
          <AngleContainer
            title={
              editingStop
                ? renderDelete ? 'Delete' : 'Add'
                : editingAngle ? 'Exit' : 'Edit Angle'
            }
            onClick={this._handleLeftIconClick}
            onMouseEnter={e => this._handleMouseEnter(e, ['arrowPrev'])}
            onMouseLeave={e => this._handleMouseLeave(e, ['arrowPrev'])}
          >
            <AddDeleteStop
              editingStop={editingStop}
              animationDuration={ANGLE_PREVIEW_ANIMATION_DURATION}
              hovered={arrowPrev}
              color={ICON_COLOR}
              renderDelete={renderDelete}
              renderDeleteInverted={renderDeleteInverted}
            />
            <AnglePreview
              editingAngle={editingAngle}
              editingStop={editingStop}
              angle={actualAngle}
              animationDuration={ANGLE_PREVIEW_ANIMATION_DURATION}
              iconAnimationDuration={SLIDER_ANIMATION_DURATION}
              hovered={arrowPrev}
              color={ICON_COLOR}
            />
          </AngleContainer>

          <SwatchSliderContainer
            innerRef={node => {
              this.sliderContainer = node
            }}
          >
            <SortableSwatch
              id={id}
              animationDuration={SLIDER_ANIMATION_DURATION}
            />
          </SwatchSliderContainer>

          <AddColorButton
            title={editing ? 'Exit' : 'Edit'}
            onMouseEnter={e => this._handleMouseEnter(e, ['addColor'])}
            onMouseLeave={e => this._handleMouseLeave(e, ['addColor'])}
            onClick={this._handleAddCancelColorStop}
          >
            <AddColor
              pickingColorStop={pickingColorStop}
              editingStop={editingStop}
              animationDuration={SLIDER_ANIMATION_DURATION}
              hovered={addColor}
              color={ICON_COLOR}
            />
          </AddColorButton>
        </InfoContainer>
      </GradientItem>
    )
  }
}

const mapStateToProps = (state, props) => {
  const gradient = getGradientById(props.id)(state)
  // eslint-disable-next-line eqeqeq
  const editingStop = props.id == state.stops.editing
  const stopData = getStopsById(state, props)

  return {
    stopData,
    draggingItemMousePos: state.stops.draggingItemMousePos,
    // eslint-disable-next-line eqeqeq
    editingAngleData: state.gradients.editingAngle,
    editingStop,
    // eslint-disable-next-line eqeqeq
    angle: gradient.angle,
    pickingColorStop: state.stops.updating.pickingColorStop !== null,
    editingColor: props.id === state.stops.editingColor,
    expanded: state.gradients.expanded === props.id,
    renderDelete: state.icons.deleteStop.render &&
      editingStop &&
      Object.keys(stopData).length > 2,
    renderDeleteInverted: state.icons.deleteStop.inverted,
    copiedId: state.icons.copied
  }
}

export default connect(mapStateToProps, {
  toggleEditing,
  editStop,
  editStopColor,
  updateEditingAngle,
  updateSwatchDimensions,
  updateActiveColorPicker,
  addColorStop,
  copyCSS
})(GradientCard)
