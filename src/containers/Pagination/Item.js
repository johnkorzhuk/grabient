import React, { Component } from 'react';
import { Animate } from 'react-move';
import { TextSM } from './../../components/Common/Typography';

const ItemLink = TextSM.extend`
  padding: 2px 5px;
  position: absolute;
  border-bottom: 1px solid transparent;
  user-select: none;
  cursor: pointer;
`;

class PaginationItem extends Component {
  componentWillReceiveProps(nextProps) {
    if (this.props.hovered !== nextProps.hovered && nextProps.hovered) {
      this.props.getWidth(this.item.getClientRects()[0].width);
    }
  }

  render() {
    const { left, item, active, hovered, onClick, onMouseEnter } = this.props;

    return (
      <Animate
        data={{
          color: active || hovered ? '#000000' : '#afafaf'
        }}
      >
        {data => {
          return (
            <ItemLink
              innerRef={node => {
                this.item = node;
              }}
              active={active || hovered}
              href="#"
              style={{
                left: `calc(${left} + 10px)`,
                color: data.color
              }}
              onMouseEnter={() => {
                onMouseEnter(item);
              }}
              onClick={e => {
                e.preventDefault();
                onClick(item);
              }}
            >
              {item}
            </ItemLink>
          );
        }}
      </Animate>
    );
  }
}

export default PaginationItem;
