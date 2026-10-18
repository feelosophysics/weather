export const MAX_PLACES = 5;
export function validPlace(place) {
  return place && typeof place.id === 'string' && /^[a-z0-9-]{1,60}$/.test(place.id)
    && typeof place.name === 'string' && place.name.trim().length > 0 && place.name.length <= 50
    && Number.isFinite(place.latitude) && Math.abs(place.latitude) <= 90
    && Number.isFinite(place.longitude) && Math.abs(place.longitude) <= 180;
}
export function savedPlaces(text,fallback) {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [...fallback];
    const result = parsed.filter(validPlace).filter((place,i,all)=>all.findIndex(item=>item.id===place.id)===i).slice(0,MAX_PLACES);
    return result.length ? result : [...fallback];
  } catch { return [...fallback]; }
}
export function searchUrl(query) {
  const aliases = {서울:'서울특별시',부산:'부산광역시',인천:'인천광역시',수원:'수원시',대구:'대구광역시',대전:'대전광역시',광주:'광주광역시',제주:'제주시'};
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({name:aliases[query] || query,count:'8',language:'ko',countryCode:'KR'});
  return url;
}
export function searchResults(data,query) {
  return (data.results || []).filter(result=>result.country_code==='KR').map(result=>({
    id:`geo-${result.id}`,name:/[가-힣]/.test(result.name) ? result.name : query,
    providerName:result.name,admin1:result.admin1 || '',admin2:result.admin2 || '',
    latitude:result.latitude,longitude:result.longitude
  })).filter(validPlace);
}
export async function findPlaces(query) {
  const response = await fetch(searchUrl(query),{signal:AbortSignal.timeout(10000),credentials:'omit',referrerPolicy:'no-referrer'});
  if (!response.ok) throw new Error('지명 검색 실패');
  return searchResults(await response.json(),query);
}
