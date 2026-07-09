import { runSandboxCollision } from './backend/src/services/collision/engine';
import { getGhostProfile } from './backend/src/services/sandbox/ghostProfiles';
import { findSharedTopArtists } from './backend/src/math/sharedArtists';

// test ghost profiles
const ghost = getGhostProfile('ghost-bollywood-buff');
console.log("Ghost top artists:", ghost?.topArtists?.length);
