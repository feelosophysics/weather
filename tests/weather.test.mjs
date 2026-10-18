import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseMonth } from '../scripts/month-parser.mjs';
import { outlookText, needsUpdate } from '../dist/outlook.js';

// Deliberately small source fixture with distinct temperature/rainfall values.
function xml({rainName = '서울', probability = 50} = {}) {
  const weeks = Array.from({length:4},(_,i) => `<week${i+1}_period>12.28.~01.03.</week${i+1}_period><week${i+1}_weather_review><![CDATA[첫 줄<br>둘째 줄]]></week${i+1}_weather_review>`).join('');
  const values = type => Array.from({length:4},(_,i) => {
    const prefix = `week${i+1}_local_${type}_`;
    return `<${prefix}similarRange>${type === 'ta' ? '-2.1~0.3' : '1.0~5.0'}</${prefix}similarRange><${prefix}minVal>10</${prefix}minVal><${prefix}similarVal>40</${prefix}similarVal><${prefix}maxVal>${probability}</${prefix}maxVal>`;
  }).join('');
  return `<rss version="2.0"><date>2026년 12월 28일 ~ 2027년 1월 24일</date><ydate>2026년 12월 17일 11시</ydate><next_ydate>2026년 12월 24일 11시</next_ydate>${weeks}<local_ta><local_ta_name><![CDATA[서울]]></local_ta_name>${values('ta')}</local_ta><local_rn><local_rn_name>${rainName}</local_rn_name>${values('rn')}</local_rn></rss>`;
}
test('발표 시각과 연말 기간을 현재 날짜로 바꾸지 않고 보존한다',() => {
  const data = parseMonth(xml());
  assert.equal(data.issuedAt,'2026-12-17T11:00:00+09:00');
  assert.equal(data.period,'2026년 12월 28일 ~ 2027년 1월 24일');
  assert.equal(data.regions[0].weeks[0].temperature.normalRange,'-2.1~0.3');
  assert.equal(data.regions[0].weeks[0].rainfall.normalRange,'1.0~5.0');
  assert.equal(data.nationalReviews[0],'첫 줄\n둘째 줄');
});
test('지역이 다른 강수량이나 잘못된 확률을 현재 지역 자료처럼 처리하지 않는다',() => {
  assert.throws(() => parseMonth(xml({rainName:'제주'})),/강수량 지역 누락/);
  assert.throws(() => parseMonth(xml({probability:60})),/확률 합계/);
  assert.throws(() => parseMonth(xml().replace('<week2_period>','<missing>')),/필드 누락/);
  assert.throws(() => parseMonth('<!DOCTYPE rss>'+xml()),/형식/);
});
test('동률 확률을 한 가지 전망으로 단정하지 않는다',() => {
  assert.equal(outlookText([20,40,40],'rainfall'),'평년과 비교해 비슷할 · 많을 확률 각각 40%');
  assert.equal(outlookText([10,40,50],'temperature'),'평년보다 높을 확률 50%');
  assert.equal(outlookText([20,50,30],'rainfall'),'평년과 비슷할 확률 50%');
});
test('다음 발표 시각부터 저장된 자료의 갱신 필요를 표시한다',() => {
  const month = {nextIssueAt:'2026-10-22T11:00:00+09:00'};
  assert.equal(needsUpdate(month,Date.parse('2026-10-22T10:59:59+09:00')),false);
  assert.equal(needsUpdate(month,Date.parse('2026-10-22T11:00:00+09:00')),true);
});
test('실제 저장된 자료의 모든 권역이 네 주의 기온·강수 확률을 갖는다',async () => {
  const month = JSON.parse(await readFile(new URL('../dist/data/month.json',import.meta.url),'utf8'));
  assert.equal(month.source,'기상청');
  assert.ok(month.sourceUrl.startsWith('https://www.kma.go.kr/'));
  assert.ok(month.regions.some(region => region.name.includes('서울')));
  assert.ok(month.regions.some(region => region.name.includes('제주')));
  for (const region of month.regions) {
    assert.equal(region.weeks.length,4);
    for (const week of region.weeks) for (const variable of ['temperature','rainfall']) {
      assert.equal(week[variable].probabilities.reduce((a,b)=>a+b,0),100);
      assert.ok(week[variable].probabilities.every(value => value >= 0 && value <= 100));
    }
  }
});
