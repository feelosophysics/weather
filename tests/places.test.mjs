import test from 'node:test';
import assert from 'node:assert/strict';
import { savedPlaces, searchResults, searchUrl } from '../dist/places.js';
import { CITIES } from '../dist/forecast.js';

test('손상된 저장값·잘못된 좌표·중복 지역을 안전하게 처리한다',()=>{
  assert.deepEqual(savedPlaces('not-json',CITIES),CITIES);
  const rows = [CITIES[0],CITIES[0],{...CITIES[1],latitude:null},CITIES[2]];
  assert.deepEqual(savedPlaces(JSON.stringify(rows),CITIES).map(place=>place.id),['seoul','jeju']);
});
test('동명이인 지역의 시군구를 유지하고 다른 나라 결과를 제외한다',()=>{
  const result = searchResults({results:[
    {id:1,name:'테스트동',country_code:'KR',admin1:'서울특별시',admin2:'강남구',latitude:37.5,longitude:127.0},
    {id:2,name:'테스트동',country_code:'KR',admin1:'경기도',admin2:'다른시',latitude:37.4,longitude:127.2},
    {id:3,name:'테스트동',country_code:'US',latitude:40,longitude:-70}
  ]},'테스트동');
  assert.equal(result.length,2);
  assert.notEqual(result[0].id,result[1].id);
  assert.notEqual(result[0].admin2,result[1].admin2);
});
test('한국 검색어와 로마자 결과를 구분해 원문과 표시명을 모두 보존한다',()=>{
  const result=searchResults({results:[{id:1,name:'Example-dong',country_code:'KR',latitude:37.5,longitude:127.0}]},'예시동');
  assert.equal(result[0].name,'예시동');
  assert.equal(result[0].providerName,'Example-dong');
  const url=searchUrl('수원');
  assert.equal(url.searchParams.get('name'),'수원시');
  assert.equal(url.searchParams.get('countryCode'),'KR');
});
