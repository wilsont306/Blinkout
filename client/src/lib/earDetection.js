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

export function averagePixelLuminance(imageData) {
  const { data } = imageData
  let sum = 0
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  return sum / (data.length / 4)
}
