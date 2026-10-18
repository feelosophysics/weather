import { outlookText, needsUpdate } from './outlook.js';
import { CITIES, CACHE_TTL, usableCache, cacheAge, condition, requestForecast } from './forecast.js';
import { MAX_PLACES, savedPlaces, findPlaces } from './places.js';

const content = document.querySelector('#weather-content');
const locationSelect = document.querySelector('#location');
const notice = document.querySelector('#data-notice');
const dateLabel = (date, options) => new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',...options}).format(date);
const escape = value => String(value).replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let view = 'today';
let month;
let loadError = false;
let installPrompt;
let cityId = 'seoul';
let regionName = '';
const forecasts = new Map();
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key,value) { try { localStorage.setItem(key,value); } catch { /* Settings work without storage. */ } }
};
let places = savedPlaces(storage.get('weather-places'),CITIES);
if (places.some(city => city.id === storage.get('weather-city'))) cityId = storage.get('weather-city');
else cityId = places[0].id;
regionName = storage.get('weather-region') || '';
const number = (value,suffix = '') => typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}${suffix}` : '—';
const timeLabel = time => dateLabel(new Date(time+'+09:00'),{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const city = () => places.find(item => item.id === cityId);
function icon(type) {
  const sun = '<circle cx="32" cy="32" r="12" fill="#f5ca70"/><path d="M32 5v6m0 42v6M5 32h6m42 0h6M13 13l4 4m30 30 4 4M13 51l4-4m30-30 4-4" stroke="#f5ca70" stroke-width="3" stroke-linecap="round"/>';
  const cloud = '<path d="M17 44a11 11 0 0 1-1-22 16 16 0 0 1 30 1 11 11 0 0 1 1 22Z" fill="#cbdad7"/>';
  const drawing = {sun,moon:'<path d="M42 8a24 24 0 1 0 14 36A25 25 0 0 1 42 8" fill="#f5d994"/>',cloud,
    rain:cloud+'<path d="m22 50-3 7m15-7-3 7m15-7-3 7" stroke="#78a9cc" stroke-width="3" stroke-linecap="round"/>',
    snow:cloud+'<g fill="#8fb1cf"><circle cx="20" cy="53" r="3"/><circle cx="32" cy="58" r="3"/><circle cx="44" cy="53" r="3"/></g>',
    storm:cloud+'<path d="m32 39-9 14h8l-3 10 14-17h-9l5-7" fill="#f5ca70"/>',unknown:'<text x="32" y="44" text-anchor="middle" font-size="40" fill="#91a59c">?</text>'}[type];
  return `<svg class="weather-symbol" viewBox="0 0 64 64" aria-hidden="true">${drawing}</svg>`;
}
function syncLocation() {
  const isMonth = view === 'month';
  document.querySelector('label[for="location"]').textContent = isMonth ? '전망 권역' : '저장된 동네';
  if (isMonth) {
    locationSelect.replaceChildren(...(month ? month.regions.map(region => new Option(region.name,region.name)) : [new Option('자료 확인 중','')]));
    if (month) {
      if (!month.regions.some(region => region.name === regionName)) regionName = month.regions.find(region => region.name.includes('서울'))?.name || month.regions[0].name;
      locationSelect.value = regionName;
    }
  } else {
    locationSelect.replaceChildren(...places.map(city => new Option(city.name + (city.admin2 ? ` · ${city.admin2}` : ''),city.id)));
    locationSelect.value = cityId;
  }
}
async function loadForecast(force = false) {
  const selected = city();
  let state = forecasts.get(selected.id);
  if (!state) {
    let cached;
    try { cached = JSON.parse(storage.get(`weather-forecast-${selected.id}`)); } catch { /* Ignore broken local cache. */ }
    state = {data:usableCache(cached,selected.id) ? cached : null,loading:false,error:false};
    forecasts.set(selected.id,state);
  }
  if (state.loading) { render(); return; }
  // A manual retry cannot repeatedly call the upstream API within one minute.
  const age = cacheAge(state.data);
  if (state.data && age < (force ? 60_000 : CACHE_TTL)) { render(); return; }
  state.loading = true; state.error = false; render();
  try {
    state.data = await requestForecast(selected);
    if (places.some(place=>place.id===selected.id)) storage.set(`weather-forecast-${selected.id}`,JSON.stringify(state.data));
  } catch { state.error = true; }
  finally { state.loading = false; if (cityId === selected.id && view !== 'month') render(); }
}

function monthView() {
  if (!month) return `<section class="card"><h1 class="section-title">${loadError ? '자료를 열지 못했어요' : '자료를 읽고 있어요'}</h1><p>${loadError ? '인터넷 연결을 확인한 뒤 다시 열어 주세요. 저장된 날씨 자료가 없을 수 있어요.' : '잠시만 기다려 주세요.'}</p><a href="https://www.weather.go.kr/w/climate/montr-prediction/month1.do" target="_blank" rel="noopener noreferrer">기상청 원문 보기</a></section>`;
  const region = month.regions.find(region => region.name === locationSelect.value) || month.regions[0];
  return `<section aria-labelledby="month-title"><div class="month-intro"><h1 id="month-title" class="section-title">한 달은 ‘주별 경향’으로</h1><p>날짜별 맑음·비가 아닌 한 주의 평균기온과 강수량 전망이에요. 강수량 확률은 ‘비 올 확률’과 달라요.</p></div>
    <section class="card issue-card" aria-label="자료 기준"><strong>${escape(month.issuedLabel)} 발표</strong><p>전망 기간 ${escape(month.period)}</p><p>다음 발표 예정 ${escape(month.nextIssueLabel)}</p><p class="caption">자료를 가져온 시각 ${escape(dateLabel(new Date(month.fetchedAt),{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))} · 아래 기온·강수량은 ${escape(region.name)} 기준</p>${needsUpdate(month) ? '<p class="stale-message">새 발표를 확인할 시각이 지났어요. 아래는 이전에 저장한 전망입니다.</p>' : ''}</section>
    <div class="card">${region.weeks.map((week,i) => `<article class="week"><h2 class="section-title">${i+1}주 차 <span class="week-period">${escape(week.period)}</span></h2>
      <p class="trend"><span class="badge">기온</span>${escape(outlookText(week.temperature.probabilities,'temperature'))}</p>
      <p class="probability">낮음 ${week.temperature.probabilities[0]}% · 비슷 ${week.temperature.probabilities[1]}% · 높음 ${week.temperature.probabilities[2]}%</p>
      <p class="caption">평년 주 평균기온 범위 ${escape(week.temperature.normalRange)}℃</p>
      <p class="trend"><span class="badge">강수량</span>${escape(outlookText(week.rainfall.probabilities,'rainfall'))}</p>
      <p class="probability">적음 ${week.rainfall.probabilities[0]}% · 비슷 ${week.rainfall.probabilities[1]}% · 많음 ${week.rainfall.probabilities[2]}%</p>
      <p class="caption">평년 주 강수량 범위 ${escape(week.rainfall.normalRange)}mm</p>
      <details><summary>전국 날씨 해설</summary><p class="review">${escape(month.nationalReviews[i])}</p><p class="caption">전국 해설은 선택한 권역의 전망과 다를 수 있어요.</p></details></article>`).join('')}</div></section>`;
}
function forecastView() {
  const state = forecasts.get(cityId);
  const data = state?.data;
  if (!data) return `<section class="card"><h1 class="section-title">${state?.error ? '날씨를 가져오지 못했어요' : '날씨를 가져오고 있어요'}</h1><p>${state?.error ? '인터넷 연결을 확인하고 다시 시도해 주세요.' : '잠시만 기다려 주세요.'}</p>${state?.error ? '<button class="secondary-button" data-refresh>다시 시도</button>' : ''}</section>`;
  const stale = cacheAge(data) >= CACHE_TTL || state.error;
  const summary = `<div class="forecast-meta"><p>기준 ${escape(timeLabel(data.current.time))} · 갱신 ${escape(dateLabel(new Date(data.fetchedAt),{hour:'2-digit',minute:'2-digit'}))}</p><button class="secondary-button" data-refresh ${state.loading ? 'disabled' : ''}>${state.loading ? '갱신 중' : '새로고침'}</button></div>${stale ? '<p class="stale-message">이전에 받은 자료예요. 기준 시각을 확인해 주세요.</p>' : ''}`;
  if (view === 'days') return `<section class="card"><h1 class="section-title">열흘 날씨</h1><p class="caption">${escape(city().name)} 대표 위치 · 먼 날짜의 예보는 달라질 수 있어요.</p>${summary}<ul class="forecast-list">${data.days.map(day => {
    const weather = condition(day.code);
    return `<li class="day-row"><div class="day-date">${escape(dateLabel(new Date(day.date+'T12:00:00+09:00'),{month:'numeric',day:'numeric'}))}<small>${escape(dateLabel(new Date(day.date+'T12:00:00+09:00'),{weekday:'long'}))}</small></div><span role="img" aria-label="${weather.text}">${icon(weather.icon)}</span><span class="rain" aria-label="하루 중 최대 강수확률 ${day.rain === null ? '정보 없음' : day.rain+'%'}">${number(day.rain,'%')}</span><div class="day-range"><span>${number(day.low,'°')}</span> / ${number(day.high,'°')}</div></li>`;
  }).join('')}</ul><p class="caption">파란 숫자는 하루 중 최대 강수확률, 기온은 최저 / 최고예요. ‘—’는 정보 없음입니다.</p></section>`;
  const current = data.current;
  const weather = condition(current.code,current.isDay);
  const today = data.days.find(day => day.date === current.time.slice(0,10));
  const nextHours = data.hours.filter(hour => hour.time >= current.time).slice(0,6);
  return `<section class="card hero" aria-labelledby="current-title"><h1 id="current-title" class="eyebrow">${escape(city().name)} 지금 · 모델 추정</h1><div class="hero-main"><div><p class="temperature">${number(current.temperature,'°')}</p><p class="weather-label">${weather.text}</p></div>${icon(weather.icon)}</div><p class="range">최저 ${number(today?.low,'°')} &nbsp; / &nbsp; 최고 ${number(today?.high,'°')}</p><p class="hero-note">체감 ${number(current.feelsLike,'°')} · ${escape(timeLabel(current.time))} 기준</p></section>
    ${summary}<section class="card"><h2 class="section-title">한눈에 보기</h2><div class="metrics"><div class="metric"><span>오늘 최대 강수확률</span><strong>${number(today?.rain,'%')}</strong></div><div class="metric"><span>습도</span><strong>${number(current.humidity,'%')}</strong></div><div class="metric"><span>바람</span><strong>${current.wind === null ? '—' : current.wind.toFixed(1)+'m/s'}</strong></div></div></section>
    <section class="card"><h2 class="section-title">앞으로의 시간별 날씨</h2><div class="hour-scroll"><div class="hours">${nextHours.map(hour => `<div class="hour"><span>${hour.time.slice(11,13)}시</span>${icon(condition(hour.code,hour.isDay).icon)}<strong>${number(hour.temperature,'°')}</strong><span>${number(hour.rain,'%')}</span></div>`).join('')}</div></div><p class="caption">시간별 강수확률 · 현재값은 관측소 실측이 아닌 모델 추정입니다.</p></section>`;
}
function render() {
  content.innerHTML = view === 'month' ? monthView() : forecastView();
  content.setAttribute('aria-busy',String(view !== 'month' && Boolean(forecasts.get(cityId)?.loading)));
  document.querySelectorAll('[data-view]').forEach(button => {
    if (button.dataset.view === view) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
  notice.textContent = view !== 'month' ? forecasts.get(cityId)?.data ? 'Open-Meteo 예보 · 대표 위치 기준' : 'Open-Meteo 날씨 확인 중' : month
    ? needsUpdate(month) ? '이전 발표 자료 · 새 전망 갱신이 필요해요' : '기상청 실제 자료 · 한 달 경향'
    : loadError ? '기상청 자료를 열지 못했어요' : '기상청 자료 확인 중';
  document.querySelector('#source-credit').innerHTML = view === 'month'
    ? '자료 출처: <a href="https://www.weather.go.kr/w/climate/montr-prediction/month1.do" target="_blank" rel="noopener noreferrer">기상청 1개월 전망</a> · 위치 추적 없음'
    : 'Weather data: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> · 한국어 표시·기온 반올림';
  connectionStatus();
}
const placesDialog = document.querySelector('#places-dialog');
const savedList = document.querySelector('#saved-places');
const searchList = document.querySelector('#place-results');
const searchStatus = document.querySelector('#place-search-status');
let results = [];
let searchVersion = 0;
function persistPlaces() {
  storage.set('weather-places',JSON.stringify(places));
  storage.set('weather-city',cityId);
}
function renderSaved() {
  savedList.innerHTML = places.map(place=>`<li><span>${escape(place.name)}<small>${escape([place.admin1,place.admin2].filter(Boolean).join(' '))}</small></span><button type="button" data-remove-place="${escape(place.id)}" ${places.length === 1 ? 'disabled' : ''} aria-label="${escape(place.name)} 삭제">삭제</button></li>`).join('');
}
document.querySelector('#manage-places').addEventListener('click',()=>{
  renderSaved(); placesDialog.showModal();
});
savedList.addEventListener('click',event=>{
  const button = event.target.closest('[data-remove-place]');
  if (!button || places.length <= 1) return;
  const removed = button.dataset.removePlace;
  places = places.filter(place=>place.id !== removed);
  forecasts.delete(removed);
  try {localStorage.removeItem(`weather-forecast-${removed}`);} catch { /* Local storage may be disabled. */ }
  if (cityId === removed) cityId = places[0].id;
  persistPlaces(); renderSaved(); syncLocation(); render();
  if (view !== 'month') loadForecast();
});
document.querySelector('#place-search').addEventListener('submit',async event=>{
  event.preventDefault();
  const query = document.querySelector('#place-query').value.trim();
  if (query.length < 2) {searchStatus.textContent = '두 글자 이상 입력해 주세요.'; return;}
  const version = ++searchVersion;
  searchList.replaceChildren(); results = [];
  searchStatus.textContent = '동네를 찾고 있어요…';
  try {
    const found = await findPlaces(query);
    if (version !== searchVersion) return;
    results = found;
    searchStatus.textContent = results.length ? '시·군·구를 확인하고 저장하세요.' : '찾지 못했어요. 동 이름만 검색하거나 시 이름에 ‘시’를 붙여 보세요. 일부 동네는 검색되지 않을 수 있어요.';
    searchList.innerHTML = results.map((place,i)=>`<li><div><strong>${escape(place.name)}</strong><small>${escape([place.admin1,place.admin2].filter(Boolean).join(' '))}</small>${place.providerName !== place.name ? `<small>검색 원문: ${escape(place.providerName)}</small>` : ''}</div><button type="button" data-save-place="${i}" aria-label="${escape(place.name)} ${escape(place.admin2)} 저장">저장</button></li>`).join('');
  } catch { if (version === searchVersion) searchStatus.textContent = '동네 검색에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.'; }
});
searchList.addEventListener('click',event=>{
  const button = event.target.closest('[data-save-place]');
  if (!button) return;
  const selected = results[Number(button.dataset.savePlace)];
  if (!selected) return;
  if (!places.some(place=>place.id===selected.id)) {
    if (places.length >= MAX_PLACES) {searchStatus.textContent = `최대 ${MAX_PLACES}곳까지 저장할 수 있어요. 먼저 다른 동네를 삭제해 주세요.`; return;}
    places.push(selected);
  }
  cityId = selected.id;
  persistPlaces();
  view = 'today'; syncLocation(); render(); placesDialog.close(); loadForecast();
});
document.querySelector('#today-date').textContent = dateLabel(new Date(),{month:'long',day:'numeric',weekday:'short'});
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click',() => {view = button.dataset.view; syncLocation(); render(); if (view !== 'month') loadForecast();}));
locationSelect.addEventListener('change',() => {
  if (view === 'month') {regionName = locationSelect.value; storage.set('weather-region',regionName); render();}
  else {cityId = locationSelect.value; storage.set('weather-city',cityId); loadForecast();}
});
content.addEventListener('click',event => { if (event.target.closest('[data-refresh]')) loadForecast(true); });
const sizeButton = document.querySelector('#text-size');
function applySize(large) {
  document.documentElement.classList.toggle('large-text',large);
  sizeButton.setAttribute('aria-pressed',String(large));
  sizeButton.textContent = large ? '기본 글씨로' : '글씨 더 크게';
}
applySize(storage.get('family-weather-large') === 'true');
sizeButton.addEventListener('click',() => {
  const large = !document.documentElement.classList.contains('large-text');
  applySize(large); storage.set('family-weather-large',String(large));
});
const installButton = document.querySelector('#install-button');
window.addEventListener('beforeinstallprompt',event => {event.preventDefault(); installPrompt = event; installButton.textContent = '홈 화면에 설치';});
installButton.addEventListener('click',async () => {
  if (installPrompt) {const prompt = installPrompt; installPrompt = null; await prompt.prompt(); installButton.textContent = '설치 안내';}
  else document.querySelector('#install-dialog').showModal();
});
const connectionStatus = () => {
  document.querySelector('#connection-status').textContent = navigator.onLine ? '기준 시각을 확인하세요 · 기기에 자료를 잠시 저장해요' : '인터넷 연결 없음 · 저장된 자료가 있다면 표시해요';
};
window.addEventListener('online',connectionStatus);
window.addEventListener('offline',connectionStatus);
syncLocation();
render();
loadForecast();
async function loadMonth() {
 try {
  const response = await fetch('./data/month.json',{cache:'no-cache'});
  if (!response.ok) throw new Error('Weather data unavailable');
  const data = await response.json();
  if (data.schemaVersion !== 1 || !data.regions?.length || !Number.isFinite(Date.parse(data.issuedAt)) || data.regions.some(region => region.weeks?.length !== 4)) throw new Error('Unexpected schema');
  month = data;
} catch { loadError = true; }
 if (view === 'month') {syncLocation(); render();}
}
loadMonth();
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('./sw.js').catch(() => {
  document.querySelector('#connection-status').textContent = '오프라인 저장을 사용하지 못했어요';
});
