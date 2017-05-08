import Component from 'inferno-component'
import styled from 'styled-components'
import { connect } from 'inferno-redux'
import { Transition } from 'react-move'
import {
  SortableContainer,
  SortableElement,
  arrayMove
} from 'react-sortable-hoc'

import { getColors } from './../../store/gradients/selectors'
import { updateColorStop } from './../../store/gradients/actions'

const TRANSITION_DURATION = 400

const SwatchContainer = styled(Transition)`
  
`

const SwatchItem = styled.div`
  height: ${({ height }) => height + 'px'};
  display: inline-block;
`

const SortableItem = SortableElement(props => <SwatchItem {...props} />)

const SortableList = SortableContainer(({ items, width, height }) => {
  return (
    <SwatchContainer
      data={items}
      getKey={(item, index) => index}
      update={(item, index) => ({
        translate: 1,
        color: items[index],
        width
      })}
      enter={(item, index) => ({
        translate: 0,
        color: items[index - 1],
        width: 0
      })}
      leave={(item, index) => ({
        translate: 0,
        color: items[index - 1],
        width: 0
      })}
      duration={TRANSITION_DURATION}
    >
      {data => (
        <div>
          {data.map((item, index) => {
            return (
              <SortableItem
                key={item.key}
                index={index}
                height={height}
                style={{
                  backgroundColor: item.state.color,
                  width: item.state.width + 'px'
                }}
              />
            )
          })}
        </div>
      )}
    </SwatchContainer>
  )
})

class Swatch extends Component {
  state = {
    colors: null
  }

  componentDidMount () {
    this.setState({
      colors: this.props.colors
    })
  }

  componentWillReceiveProps (nextProps) {
    if (this.props.colors !== nextProps.colors) {
      this.setState({
        colors: nextProps.colors
      })
    }
  }

  _onSortEnd = ({ oldIndex, newIndex, collection }) => {
    const colors = arrayMove(this.state.colors, oldIndex, newIndex)
    const { updateColorStop, id } = this.props

    this.setState({
      colors
    })

    updateColorStop(id, colors)
  }

  render () {
    const { height, width = height } = this.props
    const { colors } = this.state
    return (
      colors &&
      <SortableList
        axis='x'
        lockAxis='x'
        transitionDuration={TRANSITION_DURATION}
        items={this.state.colors}
        onSortEnd={this._onSortEnd}
        width={width}
        height={height}
      />
    )
  }
}

export default connect(
  state => ({
    colors: getColors(state)
  }),
  {
    updateColorStop
  }
)(Swatch)
