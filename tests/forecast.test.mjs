import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, normalizeForecast, usableCache, CACHE_TTL, condition, forecastUrl } from '../dist/forecast.js';

function response() {
  return {timezone:'Asia/Seoul',utc_offset_seconds:32400,
    current_units:{temperature_2m:'°C',wind_speed_10m:'m/s'},
    current:{time:'2026-10-18T23:45',temperature_2m:0,relative_humidity_2m:null,apparent_temperature:-1,weather_code:0,is_day:0,wind_speed_10m:0},
    daily:{time:Array.from({length:10},(_,i)=>`2026-10-${18+i}`),weather_code:Array(10).fill(0),temperature_2m_max:Array(10).fill(4),temperature_2m_min:Array(10).fill(-3),precipitation_probability_max:Array(10).fill(null)},
    hourly:{time:['2026-10-18T23:00','2026-10-19T00:00'],temperature_2m:[0,-2],weather_code:[0,3],precipitation_probability:[0,null],is_day:[0,0]}};
}
test('영도·강수확률 0과 누락값을 구별하고 자정 이후 시간을 보존한다',() => {
  const data = normalizeForecast(response(),CITIES[0],'2026-10-18T15:00:00Z');
  assert.equal(data.current.temperature,0);
  assert.equal(data.current.humidity,null);
  assert.equal(data.days[0].rain,null);
  assert.equal(data.hours[0].rain,0);
  assert.equal(data.hours[1].rain,null);
  assert.equal(data.hours[1].time,'2026-10-19T00:00');
  assert.equal(data.current.time,'2026-10-18T23:45');
});
test('단위나 길이가 잘못된 날씨를 그럴듯한 숫자로 표시하지 않는다',() => {
  const badLength = response(); badLength.daily.temperature_2m_max.pop();
  assert.throws(()=>normalizeForecast(badLength,CITIES[0]),/길이/);
  const badUnit = response(); badUnit.current_units.wind_speed_10m = 'km/h';
  assert.throws(()=>normalizeForecast(badUnit,CITIES[0]),/단위/);
  const reversed = response(); reversed.daily.temperature_2m_min[0] = 10;
  assert.throws(()=>normalizeForecast(reversed,CITIES[0]),/뒤바뀌/);
});
test('다른 도시·미래 수집 시각·오래된 캐시는 재사용하지 않는다',() => {
  const now = Date.parse('2026-10-18T15:00:00Z');
  const data = normalizeForecast(response(),CITIES[0],new Date(now).toISOString());
  assert.equal(usableCache(data,'seoul',now+CACHE_TTL),true);
  assert.equal(usableCache(data,'busan',now),false);
  assert.equal(usableCache(data,'seoul',now-1),false);
  assert.equal(usableCache(data,'seoul',now+7*86400000),false);
});
test('날씨 코드 누락을 맑음으로 바꾸지 않으며 밤의 맑음은 달로 표시한다',() => {
  assert.equal(condition(null).text,'정보 없음');
  assert.equal(condition(999).text,'정보 없음');
  assert.equal(condition(0,false).icon,'moon');
});
test('현재값·시간별·열흘 요청은 동일한 도시와 한국 시각을 사용한다',() => {
  const url = forecastUrl(CITIES[0]);
  assert.equal(url.origin,'https://api.open-meteo.com');
  assert.equal(url.searchParams.get('timezone'),'Asia/Seoul');
  assert.equal(url.searchParams.get('forecast_days'),'10');
  assert.equal(url.searchParams.get('models'),'best_match');
  assert.equal(url.searchParams.get('latitude'),'37.5665');
  assert.equal(url.searchParams.has('apikey'),false);
});
