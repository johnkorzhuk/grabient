export const angleToLines = direction => {
  const convertToPerc = val => Math.round(val * 100) + '%'
  const pointOfAngle = a => {
    return {
      x: Math.cos(a),
      y: Math.sin(a)
    }
  }

  const degreesToRadians = d => {
    return d * Math.PI / 180
  }

  const eps = Math.pow(2, -52)
  const angle = direction % 360
  let startPoint = pointOfAngle(degreesToRadians(180 - angle))
  let endPoint = pointOfAngle(degreesToRadians(360 - angle))

  if (startPoint.x <= 0 || Math.abs(startPoint.x) <= eps) startPoint.x = 0

  if (startPoint.y <= 0 || Math.abs(startPoint.y) <= eps) startPoint.y = 0

  if (endPoint.x <= 0 || Math.abs(endPoint.x) <= eps) endPoint.x = 0

  if (endPoint.y <= 0 || Math.abs(endPoint.y) <= eps) endPoint.y = 0

  // orig. seems to be wrong
  return {
    x1: convertToPerc(startPoint.x),
    y1: convertToPerc(startPoint.y),
    x2: convertToPerc(endPoint.x),
    y2: convertToPerc(endPoint.y)
  }

  // return {
  //   x1: convertToPerc(endPoint.y),
  //   y1: convertToPerc(endPoint.x),
  //   x2: convertToPerc(startPoint.y),
  //   y2: convertToPerc(startPoint.x)
  // }
}
