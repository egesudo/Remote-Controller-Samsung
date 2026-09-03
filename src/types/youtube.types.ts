/**
 * YouTube & Google Account Types
 * Modular capability layer decoupled from the core Samsung TV Controller
 */

export interface YouTubeVideo {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl: string;
  channelTitle?: string;
  duration?: string;
  publishedAt?: string;
  isCurated?: boolean;
}

export interface YouTubePlaylist {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl: string;
  itemCount?: number;
  channelTitle?: string;
}

export interface GoogleUserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export interface YouTubeAuthStatus {
  isAuthenticated: boolean;
  user: GoogleUserProfile | null;
  hasOAuthConfig: boolean;
  configuredClientId?: string;
  redirectUri?: string;
  authError?: string;
}

export interface YouTubeLaunchOptions {
  videoId?: string;
  playlistId?: string;
  searchQuery?: string;
  startTimeSeconds?: number;
}

export interface IYouTubeService {
  getAuthStatus(): Promise<YouTubeAuthStatus>;
  getAuthUrl(): Promise<string | null>;
  disconnect(): Promise<boolean>;
  getCuratedStreams(): YouTubeVideo[];
  searchVideos(query: string): Promise<YouTubeVideo[]>;
  getUserPlaylists(): Promise<YouTubePlaylist[]>;
  getLikedVideos(): Promise<YouTubeVideo[]>;
  extractVideoId(urlOrId: string): string | null;
  buildLaunchPayload(options: YouTubeLaunchOptions): string;
}
