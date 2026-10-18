// Read only known scalar tags from the official fixed XML schema.
// No XML entities, external resources, scripts or HTML are executed.
export function plainText(value) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  if (!match) throw new Error(`기상청 XML 필드 누락: ${name}`);
  return plainText(match[1]);
}
function issueDate(text) {
  const match = text.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(\d{1,2})시/);
  if (!match) throw new Error('기상청 발표 시각을 해석하지 못했습니다.');
  return `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}T${match[4].padStart(2,'0')}:00:00+09:00`;
}
function outlook(block, index, type) {
  const prefix = `week${index}_local_${type}_`;
  const probabilities = ['minVal','similarVal','maxVal'].map(key => {
    const text = tag(block,prefix + key);
    if (!/^\d{1,3}$/.test(text)) throw new Error('기상청 확률 값이 올바르지 않습니다.');
    return Number(text);
  });
  if (probabilities.some(value => value > 100) || probabilities.reduce((a,b) => a+b,0) !== 100) throw new Error('기상청 확률 합계가 100이 아닙니다.');
  return { normalRange: tag(block,prefix+'similarRange'), probabilities };
}
export function parseMonth(xml, {sourceUrl, fetchedAt = new Date().toISOString()} = {}) {
  if (xml.length > 1_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || !xml.includes('<rss version="2.0">')) throw new Error('예상한 기상청 XML 형식이 아닙니다.');
  const issuedLabel = tag(xml,'ydate');
  const nextIssueLabel = tag(xml,'next_ydate');
  const periods = Array.from({length:4},(_,i) => tag(xml,`week${i+1}_period`));
  const nationalReviews = periods.map((_,i) => tag(xml,`week${i+1}_weather_review`));
  const temperatures = [...xml.matchAll(/<local_ta>([\s\S]*?)<\/local_ta>/g)].map(match => match[1]);
  const rainfall = [...xml.matchAll(/<local_rn>([\s\S]*?)<\/local_rn>/g)].map(match => match[1]);
  if (temperatures.length === 0) throw new Error('기상청 지역 자료가 없습니다.');
  const regions = temperatures.map(block => {
    const name = tag(block,'local_ta_name');
    const rain = rainfall.find(other => tag(other,'local_rn_name') === name);
    if (!rain) throw new Error(`강수량 지역 누락: ${name}`);
    return { name, weeks: periods.map((period,i) => ({ period, temperature: outlook(block,i+1,'ta'), rainfall: outlook(rain,i+1,'rn') })) };
  });
  return { schemaVersion:1, source:'기상청', sourceUrl, fetchedAt, issuedAt:issueDate(issuedLabel), issuedLabel,
    nextIssueAt:issueDate(nextIssueLabel), nextIssueLabel, period:tag(xml,'date'), nationalReviews, regions };
}
