export function shiftConflictedStops(stops, stopConflict, tryUpFirst) {
  const newStops = { ...stops };
  let conflicts = [stopConflict];
  let canShiftUp = false;
  let canShiftDown = false;

  const adjustUp = () => {
    // eslint-disable-next-line no-plusplus
    for (let adjustment = 1; stopConflict + adjustment <= 100; adjustment++) {
      if (!newStops[stopConflict + adjustment]) {
        canShiftUp = true;
        break;
      } else {
        conflicts.push(stopConflict + adjustment);
      }
    }

    if (canShiftUp) {
      conflicts.forEach(conflict => {
        newStops[conflict + 1] = stops[conflict];
      });
      delete newStops[stopConflict];
    } else {
      conflicts = [stopConflict];
    }
  };

  const adjustDown = () => {
    // eslint-disable-next-line no-plusplus
    for (let adjustment = 1; stopConflict - adjustment >= 0; adjustment++) {
      if (!newStops[stopConflict - adjustment]) {
        canShiftDown = true;
        break;
      } else {
        conflicts.push(stopConflict - adjustment);
      }
    }

    if (canShiftDown) {
      conflicts.forEach(conflict => {
        newStops[conflict - 1] = stops[conflict];
      });
      delete newStops[stopConflict];
    } else {
      conflicts = [stopConflict];
    }
  };

  if (tryUpFirst) {
    adjustUp();
  } else {
    adjustDown();
  }

  return newStops;
}

export function shiftStops(stops) {
  const stopKeys = Object.keys(stops);

  const newStops = stopKeys
    .map(stop => {
      let s = stop;
      s = parseInt(s, 10);
      return Math.floor(s - s / stopKeys.length);
    })
    .reduce((aggr, curr, index) => {
      const newAggr = { ...aggr };
      newAggr[curr] = stops[stopKeys[index]];
      return newAggr;
    }, {});
  newStops[100] = '#ffffff';

  return newStops;
}
