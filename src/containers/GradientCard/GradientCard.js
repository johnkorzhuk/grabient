import React, { Component } from 'react'
import { connect } from 'react-redux'
import styled from 'styled-components'

import {
  toggleEditing,
  updateEditingAngle
} from './../../store/gradients/actions'
import { editStop, updateActiveColorPicker } from './../../store/stops/actions'
import { getGradientById } from './../../store/gradients/selectors'
import { getStopsById } from './../../store/stops/selectors'
import { updateSwatchDimensions } from './../../store/dimensions/actions'

import { AnglePreview, GradientContainer } from './../../components/index'
import { AddColor } from './../../components/Icons/index'
import { SortableSwatch } from './../index'
import { Button } from './../../components/Common/index'

// units = ms
const GRADIENT_ANIMATION_DURATION = 500
const ANGLE_WHEEL_ANIMATION_DURATION = 300
const ANGLE_PREVIEW_ANIMATION_DURATION = 200
// also used for icon opacity transition duration
const SLIDER_ANIMATION_DURATION = 300

const Container = styled.div`
  width: 33.33%;
  height: 35vw;
  max-height: 420px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 30px 3% 10px;
  position: relative;
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

const AngleText = styled.span`
  font-size: 1.6rem;
  color: #AFAFAF;
  padding-left: 10px;
  position: absolute;
  top: 2px;
`

const InfoContainer = styled.div`
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  z-index: 10;
  bottom: 15px;
`

const SwatchSliderContainer = styled.div`
  position: relative;
  width: 100%;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  height: 40px;
  margin: 0 4rem 0 1rem;
`

const AddColorContainer = Button.extend`
  position: absolute;
  right: 0;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 25px;
`

// todo slider container's dimnestions needs to be regrabbed on resize / width change
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

  componentWillReceiveProps (nextProps) {
    const { editingAngle, editingStop } = this.props
    if (editingAngle !== nextProps.editingAngle) {
      this.setState({ wasEditing: !nextProps.editingAngle })
    }

    if (editingStop !== nextProps.editingStop) {
      if (nextProps.editingStop) {
        this.props.updateSwatchDimensions(this.sliderContainer.getClientRects())
      }
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
    const { editingStop, editStop, updateActiveColorPicker, id } = this.props

    if (editingStop) {
      editStop(null)
      updateActiveColorPicker(null)
    } else {
      editStop(id)
    }
  }

  _handleAngleEditToggle = () => {
    const {
      toggleEditing,
      updateEditingAngle,
      updateActiveColorPicker,
      pickingColorStop,
      id,
      angle
    } = this.props
    if (pickingColorStop) {
      updateActiveColorPicker(null)
    }
    toggleEditing(id)
    updateEditingAngle(angle)
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
      pickingColorStop
    } = this.props
    const editingAngle = id === editingAngleData.id
    const actualAngle = editingAngle ? editingAngleData.angle : angle

    return (
      <Container
        style={{
          order: index
        }}
      >
        <GradientContainer
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
          pickingColorStop={pickingColorStop}
        />

        <InfoContainer>

          <AngleContainer
            onClick={this._handleAngleEditToggle}
            onMouseEnter={e => this._handleMouseEnter(e, ['arrowPrev'])}
            onMouseLeave={e => this._handleMouseLeave(e, ['arrowPrev'])}
          >
            <AnglePreview
              editingAngle={editingAngle}
              editingStop={editingStop}
              angle={actualAngle}
              animationDuration={ANGLE_PREVIEW_ANIMATION_DURATION}
              iconAnimationDuration={SLIDER_ANIMATION_DURATION}
              hovered={arrowPrev}
            >
              <AngleText>{actualAngle}°</AngleText>
            </AnglePreview>
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

          <AddColorContainer
            onMouseEnter={e => this._handleMouseEnter(e, ['addColor'])}
            onMouseLeave={e => this._handleMouseLeave(e, ['addColor'])}
            onClick={this._handleAddCancelColorStop}
          >
            <AddColor
              editingStop={editingStop}
              animationDuration={SLIDER_ANIMATION_DURATION}
              hovered={addColor}
              color='#AFAFAF'
            />
          </AddColorContainer>
        </InfoContainer>
      </Container>
    )
  }
}

const mapStateToProps = (state, props) => {
  const gradient = getGradientById(props.id)(state)

  return {
    stopData: getStopsById(state, props),
    draggingItemMousePos: state.stops.draggingItemMousePos,
    // eslint-disable-next-line eqeqeq
    editingAngleData: state.gradients.editingAngle,
    // eslint-disable-next-line eqeqeq
    editingStop: props.id == state.stops.editing,
    // eslint-disable-next-line eqeqeq
    angle: gradient.angle,
    pickingColorStop: state.stops.updating.pickingColorStop !== null
  }
}

export default connect(mapStateToProps, {
  toggleEditing,
  editStop,
  updateEditingAngle,
  updateSwatchDimensions,
  updateActiveColorPicker
})(GradientCard)
