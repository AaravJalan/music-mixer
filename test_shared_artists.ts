import { findSharedTopArtists } from './backend/src/math/sharedArtists';

const listA = [
  { id: '1wRPtKGflJrBx9BmLsOkza', name: 'Pritam', imageUrl: '' },
  { id: '4YRxDV8wROuPEcgv2g0PI1', name: 'Arijit Singh', imageUrl: '' }
];
const listB = [
  { id: '1wRPtKGflJrBx9BmLsOkza', name: 'Pritam', imageUrl: '' },
  { id: '4YRxDV8wROuPEcgv2g0PI1', name: 'Arijit Singh', imageUrl: '' }
];

console.log(findSharedTopArtists([listA, listB]));
