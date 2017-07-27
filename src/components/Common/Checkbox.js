import React from 'react';

const Unchecked = ({ color }) =>
  <svg width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M3 1c-1.1045695 0-2 .8954305-2 2v8c0 1.1045695.8954305 2 2 2h8c1.1045695 0 2-.8954305 2-2V3c0-1.1045695-.8954305-2-2-2H3z"
      stroke={color}
      strokeWidth="2"
      fill="none"
      fillRule="evenodd"
    />
  </svg>;

const Checked = ({ color }) =>
  <svg width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M13.470156 1.29706627C12.928909.51346207 12.024417 0 11 0H3C1.3431458 0 0 1.34314575 0 3v8c0 1.6568542 1.3431458 3 3 3h8c1.656854 0 3-1.3431458 3-3V3.86185l-7.5710721 7.0978801-4.1107134-4.7471424 1.688434-1.46207292 2.5897492 2.99069947 6.8737583-6.44414798z"
      fill={color}
      fillRule="evenodd"
    />
  </svg>;

const Checkbox = ({ checked, color }) => (checked ? <Checked color={color} /> : <Unchecked color={color} />);

export default Checkbox;
