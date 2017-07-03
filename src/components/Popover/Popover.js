import React, { Component } from 'react';
import styled from 'styled-components';

import { Triangle } from './../Common/index';
import { TextSM } from './../Common/Typography';

const Container = styled.div`
  padding: 3px 8px 2px;
  position: absolute;
  right: 50%;
  bottom: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px 5px 0 5px;
  background-color: white;
  box-shadow: ${({ shadowColor }) => `0px 3px 10px 0px ${shadowColor}`};
  z-index: 100;
`;

const Text = TextSM.extend`
  color: #454545;
  text-transform: uppercase;
`;

class Popover extends Component {
  shouldComponentUpdate(nextProps) {
    return this.props.value !== nextProps.value || this.props.isPickingColor !== nextProps.isPickingColor;
  }

  render() {
    const { value, left, isPickingColor, shadow } = this.props;

    return (
      <Container className="target-el" left={left} shadowColor={shadow} isPickingColor={isPickingColor}>
        <Text>
          {value}
        </Text>
        <Triangle right />
      </Container>
    );
  }
}

export default Popover;
