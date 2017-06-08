export { shiftConflictedStops, shiftStops }

function shiftConflictedStops (stops, stopConflict, tryUpFirst) {
  let newStops = { ...stops }
  let conflicts = [stopConflict]
  let canShiftUp = false
  let canShiftDown = false

  const adjustUp = () => {
    for (let adjustment = 1; stopConflict + adjustment <= 100; adjustment++) {
      if (!newStops[stopConflict + adjustment]) {
        canShiftUp = true
        break
      } else {
        conflicts.push(stopConflict + adjustment)
      }
    }

    if (canShiftUp) {
      conflicts.forEach(conflict => {
        newStops[conflict + 1] = stops[conflict]
      })
      delete newStops[stopConflict]
    } else {
      conflicts = [stopConflict]
    }
  }

  const adjustDown = () => {
    for (let adjustment = 1; stopConflict - adjustment >= 0; adjustment++) {
      if (!newStops[stopConflict - adjustment]) {
        canShiftDown = true
        break
      } else {
        conflicts.push(stopConflict - adjustment)
      }
    }

    if (canShiftDown) {
      conflicts.forEach(conflict => {
        newStops[conflict - 1] = stops[conflict]
      })
      delete newStops[stopConflict]
    } else {
      conflicts = [stopConflict]
    }
  }

  tryUpFirst ? adjustUp() : adjustDown()

  return newStops
}

function shiftStops (stops) {
  const stopKeys = Object.keys(stops)

  let newStops = stopKeys
    .map(stop => {
      stop = parseInt(stop, 10)
      return Math.floor(stop - stop / stopKeys.length)
    })
    .reduce((aggr, curr, index) => {
      aggr[curr] = stops[stopKeys[index]]
      return aggr
    }, {})
  newStops[100] = '#ffffff'

  return newStops
}
