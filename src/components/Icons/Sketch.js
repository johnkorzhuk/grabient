import React from 'react';

const Sketch = ({ color }) =>
  <svg width="17" height="14" viewBox="0 0 17 14" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12.071068 0l4.071068 5.0710678-8.071068 8.0710678L0 5.0710678 4.071068 0"
      fill={color}
      fillRule="evenodd"
    />
  </svg>;

export default Sketch;
