// MediaPipe FaceMesh 468-landmark eye indices (from PRD section 4.1.1)
// EAR formula: (‖p2−p6‖ + ‖p3−p5‖) / (2 × ‖p1−p4‖)
// p1=leftmost, p2=upper-inner, p3=upper-outer, p4=rightmost, p5=lower-outer, p6=lower-inner
const LEFT_EYE  = [33,  159, 160, 133, 144, 145]
const RIGHT_EYE = [362, 386, 387, 263, 374, 373]

function dist(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function eyeAspectRatio(landmarks, indices) {
  const [i1, i2, i3, i4, i5, i6] = indices
  const p1 = landmarks[i1], p2 = landmarks[i2], p3 = landmarks[i3]
  const p4 = landmarks[i4], p5 = landmarks[i5], p6 = landmarks[i6]
  const denom = 2 * dist(p1, p4)
  if (denom === 0) return 0.3
  return (dist(p2, p6) + dist(p3, p5)) / denom
}

export function computeEAR(landmarks) {
  return (eyeAspectRatio(landmarks, LEFT_EYE) + eyeAspectRatio(landmarks, RIGHT_EYE)) / 2
}

// Full eye-contour sets give tighter, more accurate bounding boxes
const LEFT_EYE_CONTOUR  = [33, 133, 246, 161, 160, 159, 158, 157, 173, 155, 154, 153, 145, 144, 163]
const RIGHT_EYE_CONTOUR = [362, 263, 466, 388, 387, 386, 385, 384, 398, 382, 381, 380, 374, 373, 390]

export function computeEyeBoxes(landmarks, padding = 0.016) {
  const box = (indices) => {
    const pts = indices.map(i => landmarks[i]).filter(Boolean)
    if (!pts.length) return null
    const xs = pts.map(p => p.x)
    const ys = pts.map(p => p.y)
    return {
      x: Math.min(...xs) - padding,
      y: Math.min(...ys) - padding,
      w: Math.max(...xs) - Math.min(...xs) + padding * 2,
      h: Math.max(...ys) - Math.min(...ys) + padding * 2,
    }
  }
  return [box(LEFT_EYE_CONTOUR), box(RIGHT_EYE_CONTOUR)].filter(Boolean)
}

export function averagePixelLuminance(imageData) {
  const { data } = imageData
  let sum = 0
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  return sum / (data.length / 4)
}
