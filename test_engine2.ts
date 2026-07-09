import { findSharedTopArtists } from './backend/src/math/sharedArtists';
import { getGhostProfile } from './backend/src/services/sandbox/ghostProfiles';
import { ghostToProfileArtists } from './backend/src/services/sandbox/ghostProfiles';

const ghost = getGhostProfile('ghost-bollywood-buff');
const ghostArtists = ghostToProfileArtists(ghost!);

// Simulate real user's top artists from Spotify containing Pritam
const userArtists = [
  { id: '1wRPtKGflJrBx9BmLsOkza', name: 'Pritam', imageUrl: '' },
  { id: '4YRxDV8wROuPEcgv2g0PI1', name: 'Arijit Singh', imageUrl: '' }
];

const shared = findSharedTopArtists([userArtists, ghostArtists], 15);
console.log("Shared artists:", shared);
