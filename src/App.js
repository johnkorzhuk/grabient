import React, { Component } from 'react'
import { connect } from 'react-redux'
import styled from 'styled-components'
import Waypoint from 'react-waypoint'

import {
  editStop,
  updateDraggedStopPos,
  updateUpdatingStop,
  updateActiveColorPicker,
  updateActiveStop,
  deleteActiveStop,
  editStopColor
} from './store/stops/actions'
import { toggleEditing, renderMoreGradients } from './store/gradients/actions'
import { toggleTrashIcon } from './store/icons/actions'
import { getGradients } from './store/gradients/selectors'

import { GradientDisplay, GradientList } from './components/index'

const Overlay = styled.div`
  position: absolute;
  z-index: 20;
  top: 0;
  right: 0;
  left: 0;
  bottom: 0;
`

class App extends Component {
  componentDidMount () {
    document.addEventListener('keydown', this._handleCancelEdits)
    document.addEventListener('mousemove', this._handleDocumentMouseMove)
    document.addEventListener('mouseup', this._handleDocumentMouseUp)
  }

  componentWillUnmount () {
    document.removeEventListener('keydown')
    document.removeEventListener('mousemove')
    document.removeEventListener('mouseup')
  }

  _handleCancelEdits = e => {
    const {
      updateActiveColorPicker,
      toggleEditing,
      editStop,
      updateActiveStop,
      deleteActiveStop,
      pickingColorStop,
      editStopColor
    } = this.props

    if ((e.type === 'keydown' && e.which === 27) || e.type === 'click') {
      this.handleNoop(e)
      updateActiveStop(null)
      editStopColor(null)
      if (pickingColorStop) {
        updateActiveColorPicker(null)
      } else {
        toggleEditing(null)
        editStop(null)
      }
    } else if ((e.which === 46 && e.metaKey) || (e.which === 8 && e.metaKey)) {
      deleteActiveStop()
    }
  }

  _handleDocumentMouseMove = e => {
    if (this.props.editingStop) {
      if (this.props.editingStop && this.props.updating) {
        const { x } = e
        this.props.updateDraggedStopPos(x)
      }
    }
  }

  _handleDocumentMouseUp = e => {
    if (this.props.editingStop) {
      if (this.props.editingStop && this.props.updating) {
        this.props.updateUpdatingStop(null)
        this.props.updateDraggedStopPos(null)
      }
    }

    if (this.props.renderDelete) {
      if (this.props.renderDeleteInverted) {
        this.props.deleteActiveStop()
      } else {
        this.props.toggleTrashIcon()
      }
    }
  }

  handleNoop (e) {
    e.stopPropagation()
    e.preventDefault()
  }

  render () {
    const {
      editingAngle,
      editingStop,
      pickingColorStop,
      gradients: allGradients,
      renderMoreGradients,
      gradientsToRender
    } = this.props
    const editing = editingAngle || editingStop || pickingColorStop
    const gradients = Object.values(allGradients).slice(0, gradientsToRender)

    return (
      <GradientDisplay>
        <GradientList gradients={gradients} />
        {editing && <Overlay onClick={this._handleCancelEdits} />}
        <Waypoint onEnter={() => renderMoreGradients(6)} />
      </GradientDisplay>
    )
  }
}

export default connect(
  state => ({
    editingAngle: state.gradients.editingAngle.id !== null,
    editingStop: state.stops.editing !== null,
    updating: state.stops.updating.stop !== null,
    pickingColorStop: state.stops.updating.pickingColorStop !== null,
    gradients: getGradients(state),
    renderDelete: state.icons.deleteStop.render,
    renderDeleteInverted: state.icons.deleteStop.inverted,
    gradientsToRender: state.gradients.gradientsToRender
  }),
  {
    toggleEditing,
    editStop,
    updateDraggedStopPos,
    updateUpdatingStop,
    updateActiveColorPicker,
    updateActiveStop,
    deleteActiveStop,
    toggleTrashIcon,
    editStopColor,
    renderMoreGradients
  }
)(App)
