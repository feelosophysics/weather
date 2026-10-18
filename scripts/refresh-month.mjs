import { mkdir, writeFile, rename, rm, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseMonth } from './month-parser.mjs';

const guideUrl = 'https://www.weather.go.kr/w/pop/rss-guide.do';
const destination = new URL('../dist/data/month.json', import.meta.url);
const temporary = new URL('../dist/data/month.json.tmp', import.meta.url);
const previous = await readFile(destination,'utf8').then(JSON.parse).catch(() => null);
if (!process.argv.includes('--force') && previous?.schemaVersion === 1 && Date.now() - Date.parse(previous.fetchedAt) < 3_600_000) {
  console.log(`최근 수집 자료 재사용: ${previous.issuedLabel} 발표`);
  process.exit(0);
}
async function request(url) {
  const response = await fetch(url,{ signal:AbortSignal.timeout(20000), redirect:'error', headers:{Accept:'text/html, application/xml'} });
  if (!response.ok) throw new Error(`기상청 응답 오류 (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 1_000_000) throw new Error('기상청 응답 크기 초과');
  const head = new TextDecoder().decode(bytes.slice(0,160));
  const encoding = head.match(/encoding\s*=\s*["']([^"']+)/i)?.[1] || 'utf-8';
  return new TextDecoder(encoding).decode(bytes);
}
try {
  const guide = await request(guideUrl);
  const links = [...guide.matchAll(/href\s*=\s*["']([^"']*fct_mon1rss_108_\d{8}\.xml)["']/gi)];
  const candidates = links.map(match => new URL(match[1],guideUrl)).filter(url => ['www.kma.go.kr','www.weather.go.kr'].includes(url.hostname)
    && /^\/repositary\/xml\/fct\/mon\/img\/fct_mon1rss_108_\d{8}\.xml$/.test(url.pathname))
    .sort((a,b) => b.pathname.localeCompare(a.pathname));
  if (!candidates.length) throw new Error('공식 안내에서 1개월 전망 주소를 찾지 못했습니다.');
  const url = candidates[0];
  url.protocol = 'https:';
  const month = parseMonth(await request(url),{sourceUrl:url.href});
  if (Date.parse(month.issuedAt) > Date.now() + 3_600_000) throw new Error('미래 발표 자료입니다. 갱신하지 않았습니다.');
  if (previous && Date.parse(month.issuedAt) < Date.parse(previous.issuedAt)) throw new Error('이전 발표 자료가 반환되어 기존 파일을 유지합니다.');
  await mkdir(new URL('../dist/data/', import.meta.url),{recursive:true});
  await writeFile(temporary,JSON.stringify(month,null,2)+'\n','utf8');
  await rename(temporary,destination);
  console.log(`기상청 실제 자료 저장: ${month.issuedLabel} 발표 / ${month.period} / ${month.regions.length}개 권역`);
  console.log(fileURLToPath(destination));
} catch (error) {
  await rm(temporary,{force:true});
  console.error(`갱신 실패. 기존 자료는 유지합니다. ${error.message}`);
  process.exitCode = 1;
}
