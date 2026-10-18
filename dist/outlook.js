export function outlookText(probabilities, type) {
  const labels = type === 'temperature' ? ['낮을','비슷할','높을'] : ['적을','비슷할','많을'];
  const max = Math.max(...probabilities);
  const indices = probabilities.flatMap((value,i) => value === max ? [i] : []);
  if (indices.length > 1) return `평년과 비교해 ${indices.map(i=>labels[i]).join(' · ')} 확률 각각 ${max}%`;
  return `평년${indices[0] === 1 ? '과' : '보다'} ${labels[indices[0]]} 확률 ${max}%`;
}
export function needsUpdate(month, now = Date.now()) {
  return !Number.isFinite(Date.parse(month.nextIssueAt)) || now >= Date.parse(month.nextIssueAt);
}
