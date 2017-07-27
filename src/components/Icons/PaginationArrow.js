import React from 'react';

const PaginationArrow = ({ right = false, color, ...props }) =>
  <svg {...props} width="7" height="10" viewBox="0 0 7 10" xmlns="http://www.w3.org/2000/svg">
    <path d={right ? 'M1 9l4-4-4-4' : 'M6 9L2 5l4-4'} strokeWidth="2" stroke={color} fill="none" fillRule="evenodd" />
  </svg>;

export default PaginationArrow;
