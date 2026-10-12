import { TICKS_PER_SECOND } from './jellyfin.js';

// Decides what to recap. Prefers a session playing video right now; if there
// is none (the TV app may stop playback when a browser opens over it), falls
// back to the user's most recent resume point. sessionId is null for a resume
// point, since there is nothing live to pause.

export class NothingPlayingError extends Error {
  constructor(device) {
    super(device
      ? `Nothing is playing in Jellyfin on "${device}" right now.`
      : 'Nothing is playing in Jellyfin right now.');
    this.name = 'NothingPlayingError';
  }
}

function matchesDevice(session, device) {
  if (!device) return true;
  const needle = device.toLowerCase();
  return [session.DeviceName, session.Client].some(
    (value) => typeof value === 'string' && value.toLowerCase().includes(needle)
  );
}

const lastActive = (session) => Date.parse(session.LastActivityDate) || 0;
const isVideo = (item) => !!item && (!item.MediaType || item.MediaType === 'Video');
const ticksToSeconds = (ticks) => (Number(ticks) || 0) / TICKS_PER_SECOND;

export async function findNowPlaying(jellyfin, device) {
  const sessions = (await jellyfin.getSessions())
    .filter((s) => s.UserId && matchesDevice(s, device))
    .sort((a, b) => lastActive(b) - lastActive(a));

  const live = sessions.find((s) => isVideo(s.NowPlayingItem));
  if (live) {
    return {
      sessionId: live.Id,
      userId: live.UserId,
      item: await jellyfin.getItem(live.UserId, live.NowPlayingItem.Id),
      mediaSourceId: live.PlayState?.MediaSourceId || null,
      positionSeconds: ticksToSeconds(live.PlayState?.PositionTicks),
      fromResumePoint: false
    };
  }

  const recent = sessions[0];
  const resume = recent ? await jellyfin.getResumeItem(recent.UserId) : null;
  if (!resume) throw new NothingPlayingError(device);
  return {
    sessionId: null,
    userId: recent.UserId,
    // The resume list leaves out MediaSources and MediaStreams, so load the full item.
    item: await jellyfin.getItem(recent.UserId, resume.Id),
    mediaSourceId: null,
    positionSeconds: ticksToSeconds(resume.UserData?.PlaybackPositionTicks),
    fromResumePoint: true
  };
}
