import React from 'react';
import styled from 'styled-components';

import { GradientCard } from './../../containers/index';

const Container = styled.ul`
  display: flex;
  justify-content: center;
  flex-wrap: wrap;

  @media (min-width: 680px) {
    justify-content: flex-start;
  }
`;

const GradientList = ({ gradients }) =>
  <Container>
    {gradients.map((item, index) =>
      <GradientCard key={item.id} gradient={item} index={index} width="100%" id={item.id} />
    )}
  </Container>;

export default GradientList;
