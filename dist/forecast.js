// Keep provider requests/normalization separate from the parent's simple UI.
export const CITIES = [
  { id:'seoul', name:'서울', latitude:37.5665, longitude:126.9780 },
  { id:'busan', name:'부산', latitude:35.1796, longitude:129.0756 },
  { id:'jeju', name:'제주시', latitude:33.4996, longitude:126.5312 }
];
export const CACHE_TTL = 20 * 60 * 1000;
export const CACHE_LIMIT = 7 * 24 * 60 * 60 * 1000;
export function forecastUrl(city) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({ latitude:city.latitude, longitude:city.longitude,
    current:'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m',
    hourly:'temperature_2m,weather_code,precipitation_probability,is_day',
    daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone:'Asia/Seoul',wind_speed_unit:'ms',forecast_days:'10',models:'best_match' });
  return url;
}
const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const probability = value => { const number = numeric(value); return number !== null && number >= 0 && number <= 100 ? number : null; };
const validTime = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'+09:00'));
function series(data,field,count) {
  if (!Array.isArray(data[field]) || data[field].length !== count) throw new Error('날씨 데이터 길이가 맞지 않습니다.');
  return data[field];
}
export function normalizeForecast(data,city,fetchedAt = new Date().toISOString()) {
  if (data.error || data.timezone !== 'Asia/Seoul' || data.utc_offset_seconds !== 32400 || !validTime(data.current?.time)
    || !Array.isArray(data.daily?.time) || data.daily.time.length !== 10 || !Array.isArray(data.hourly?.time)) throw new Error('날씨 응답 형식이 올바르지 않습니다.');
  if (data.current_units?.temperature_2m !== '°C' || data.current_units?.wind_speed_10m !== 'm/s') throw new Error('예상한 날씨 단위가 아닙니다.');
  const daily = data.daily;
  const hourly = data.hourly;
  for (const field of ['weather_code','temperature_2m_max','temperature_2m_min','precipitation_probability_max']) series(daily,field,10);
  for (const field of ['temperature_2m','weather_code','precipitation_probability','is_day']) series(hourly,field,hourly.time.length);
  const days = daily.time.map((date,i) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('날짜 형식이 올바르지 않습니다.');
    const high = numeric(daily.temperature_2m_max[i]), low = numeric(daily.temperature_2m_min[i]);
    if (high !== null && low !== null && high < low) throw new Error('최고기온과 최저기온이 뒤바뀌었습니다.');
    return {date,code:numeric(daily.weather_code[i]),high,low,rain:probability(daily.precipitation_probability_max[i])};
  });
  const hours = hourly.time.map((time,i) => {
    if (!validTime(time)) throw new Error('시간 형식이 올바르지 않습니다.');
    return { time, temperature:numeric(hourly.temperature_2m[i]),code:numeric(hourly.weather_code[i]),rain:probability(hourly.precipitation_probability[i]),isDay:hourly.is_day[i] === 1 };
  });
  return {schemaVersion:2,cityId:city.id,source:'Open-Meteo',providerMode:'best_match',fetchedAt,
    current:{time:data.current.time,temperature:numeric(data.current.temperature_2m),humidity:probability(data.current.relative_humidity_2m),
      feelsLike:numeric(data.current.apparent_temperature),code:numeric(data.current.weather_code),isDay:data.current.is_day === 1,wind:numeric(data.current.wind_speed_10m)},days,hours};
}
export function cacheAge(data,now = Date.now()) { return now - Date.parse(data?.fetchedAt); }
export function usableCache(data,cityId,now = Date.now()) {
  const age = cacheAge(data,now);
  return data?.schemaVersion === 2 && data.cityId === cityId && data.source === 'Open-Meteo' && data.providerMode === 'best_match'
    && age >= 0 && age < CACHE_LIMIT && validTime(data.current?.time) && data.days?.length === 10 && Array.isArray(data.hours);
}
export function condition(code,isDay = true) {
  if (code === 0) return {text:'맑음',icon:isDay ? 'sun' : 'moon'};
  if (code === 1) return {text:'대체로 맑음',icon:isDay ? 'sun' : 'moon'};
  if (code === 2) return {text:'구름 많음',icon:'cloud'};
  if (code === 3) return {text:'흐림',icon:'cloud'};
  if ([45,48].includes(code)) return {text:'안개',icon:'cloud'};
  if ([51,53,55,56,57].includes(code)) return {text:'이슬비',icon:'rain'};
  if ([61,63,65,66,67].includes(code)) return {text:'비',icon:'rain'};
  if ([71,73,75,77,85,86].includes(code)) return {text:'눈',icon:'snow'};
  if ([80,81,82].includes(code)) return {text:'소나기',icon:'rain'};
  if ([95,96,99].includes(code)) return {text:'뇌우',icon:'storm'};
  return {text:'정보 없음',icon:'unknown'};
}
export async function requestForecast(city) {
  const response = await fetch(forecastUrl(city),{signal:AbortSignal.timeout(12000),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  if (!response.ok) throw new Error(`날씨 서비스 응답 오류 (${response.status})`);
  return normalizeForecast(await response.json(),city);
}
