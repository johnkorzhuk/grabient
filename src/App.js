import React, { Component } from 'react'
import { connect } from 'react-redux'
import styled from 'styled-components'

import {
  editStop,
  updateDraggedStopPos,
  updateUpdatingStop,
  updateActiveColorPicker,
  updateActiveStop,
  deleteActiveStop,
  editStopColor
} from './store/stops/actions'
import { toggleEditing, updatePage } from './store/gradients/actions'
import { toggleTrashIcon } from './store/icons/actions'
import { getGradients } from './store/gradients/selectors'

import { GradientDisplay, GradientList, Hero } from './components/index' // eslint-disable-line
import { ActionsGroup, Pagination } from './containers/index'
import { DashedBar } from './components/Common/index'

const ITEMS_PER_PAGE = 6

const Overlay = styled.div`
  position: fixed;
  z-index: 20;
  top: 0;
  right: 0;
  left: 0;
  bottom: 0;
`

const Dashed = DashedBar.extend`
  margin: 0 auto;
  max-width: 1060px;
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
      editStopColor,
      gradients,
      updatePage,
      currPage
    } = this.props

    if (e.type === 'keydown' || e.type === 'click') {
      const total = Math.ceil(Object.keys(gradients).length / ITEMS_PER_PAGE)

      if (e.which === 39) {
        const newPage = currPage + 1
        if (newPage <= total) {
          updateActiveStop(null)
          editStopColor(null)
          updateActiveColorPicker(null)
          toggleEditing(null)
          editStop(null)
          updatePage(newPage)
        }
      }

      if (e.which === 37) {
        const newPage = currPage - 1
        if (newPage >= 1) {
          updateActiveStop(null)
          editStopColor(null)
          updateActiveColorPicker(null)
          toggleEditing(null)
          editStop(null)
          updatePage(newPage)
        }
      }

      if (e.which === 27) {
        this.handleNoop(e)
        updateActiveStop(null)
        editStopColor(null)
        if (pickingColorStop) {
          updateActiveColorPicker(null)
        } else {
          toggleEditing(null)
          editStop(null)
        }
      }
      if ((e.which === 46 && e.metaKey) || (e.which === 8 && e.metaKey)) {
        deleteActiveStop()
      }
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
      if (this.props.passThreshold && this.props.renderDelete !== null) {
        this.props.toggleTrashIcon(null)
      }
    }
  }

  _handleWayPointEnter = render => {
    if (render) {
      this.props.renderMoreGradients(3)
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
      currPage
    } = this.props
    const editing = editingAngle || editingStop || pickingColorStop
    const start = (currPage - 1) * ITEMS_PER_PAGE
    const end = start + ITEMS_PER_PAGE

    const currGradients = Object.values(allGradients).slice(start, end)

    return (
      <main>
        <Hero />
        <Dashed />
        <ActionsGroup />
        <Pagination perPage={ITEMS_PER_PAGE} />
        <GradientDisplay>
          <GradientList gradients={currGradients} />
          {editing && <Overlay onClick={this._handleCancelEdits} />}
        </GradientDisplay>
        <Pagination perPage={ITEMS_PER_PAGE} bottom />
      </main>
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
    renderDelete: state.icons.deleteStop,
    passThreshold: state.stops.updating.passThreshold,
    currPage: state.gradients.page
  }),
  {
    updatePage,
    toggleEditing,
    editStop,
    updateDraggedStopPos,
    updateUpdatingStop,
    updateActiveColorPicker,
    updateActiveStop,
    deleteActiveStop,
    toggleTrashIcon,
    editStopColor
  }
)(App)
