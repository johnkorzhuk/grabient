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

const SwatchContainer = styled(Transition)`
  
`

const SwatchItem = styled.div`
  height: ${({ height }) => height + 'px'};
  display: inline-block;
`

const SortableItem = SortableElement(props => <SwatchItem {...props} />)

const SortableList = SortableContainer(
  ({ items, width, height, transitionDuration, sorting }) => {
    return (
      <SwatchContainer
        data={items}
        getKey={(item, index) => index}
        update={(item, index) => ({
          color: items[index],
          width
        })}
        enter={(item, index) => ({
          color: items[index - 1],
          width: 0
        })}
        leave={(item, index) => ({
          color: items[index - 1],
          width: 0
        })}
        duration={transitionDuration}
      >
        {data => (
          <div>
            {data.map((item, index) => {
              return (
                <SortableItem
                  key={item.key}
                  sorting={sorting}
                  index={index}
                  height={height}
                  style={{
                    // backgroundColor: item.state.color,
                    backgroundColor: sorting ? items[index] : item.state.color,
                    width: item.state.width + 'px'
                  }}
                />
              )
            })}
          </div>
        )}
      </SwatchContainer>
    )
  }
)

class Swatch extends Component {
  state = {
    colors: null,
    sorting: false
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

  _onSortStart = () => {
    this.setState({
      sorting: true
    })
  }

  _onSortEnd = ({ oldIndex, newIndex, collection }) => {
    const colors = arrayMove(this.state.colors, oldIndex, newIndex)
    const { updateColorStop, id } = this.props

    // hack so that SortableItem's bgc doesn't transition when sorting
    setTimeout(() => {
      this.setState({
        sorting: false
      })
    }, 300)

    this.setState({
      colors
    })

    updateColorStop(id, colors)
  }

  render () {
    const { height, width = height, transitionDuration } = this.props
    const { colors } = this.state
    return (
      colors &&
      <SortableList
        axis='x'
        lockAxis='x'
        transitionDuration={transitionDuration}
        items={this.state.colors}
        onSortStart={this._onSortStart}
        onSortEnd={this._onSortEnd}
        sorting={this.state.sorting}
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
