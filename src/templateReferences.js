// Official source references are separate from generated results. Viewing them
// never calls the generation endpoint or reserves Studio tokens.
export const TEMPLATE_REFERENCES = Object.freeze({
  'parents-store': { videoId: 'Bk4JjtbNaRs', title: 'Dr. Rick — Let It Out', credit: 'Progressive • Dr. Rick', sourcePage: 'https://www.progressive.com/commercials-campaigns/dr-rick/' },
  'parents-neighbor': { videoId: '9rcgh4MjNk8', title: 'Dr. Rick — The Plan', credit: 'Progressive • Dr. Rick', sourcePage: 'https://www.progressive.com/commercials-campaigns/dr-rick/' },
  'lobby-music-video': { videoId: 'x9yop0nYR9g', title: 'Quavo & Takeoff — HOTEL LOBBY | A COLORS SHOW', credit: 'Quavo & Takeoff • COLORS', sourcePage: 'https://www.youtube.com/watch?v=x9yop0nYR9g' },
  'dead-fresh-lifestyle-video': { videoId: 'PXxbEfhtDiM', title: 'Lil Baby — Dead Fresh (Official Video)', credit: 'Lil Baby • Dead Fresh', sourcePage: 'https://www.youtube.com/watch?v=PXxbEfhtDiM' }
});
export function referenceThumbnail(reference) {
  return reference?.videoId ? `https://i.ytimg.com/vi/${reference.videoId}/hqdefault.jpg` : null;
}
export function referenceWatchUrl(reference) {
  if (!Object.values(TEMPLATE_REFERENCES).some(item => item.videoId === reference?.videoId)) return null;
  const url = new URL('https://www.youtube.com/watch');
  url.searchParams.set('v', reference.videoId);
  return url.toString();
}
