// eslint-disable-next-line no-unused-vars
import React from 'react';
import styled from 'styled-components';

const GroupContainer = styled.div`
  margin-top: 25px;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-right: 0;

  &:last-child {
    margin-right: 0;
  }

  @media (max-width: 620px) {
    ${({ orderSM }) => (orderSM ? `order: ${orderSM}` : null)};
  }
`;

export default GroupContainer;
