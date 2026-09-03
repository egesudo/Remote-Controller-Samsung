/**
 * Modular YouTube Service
 * 
 * Provides YouTube deep linking, video search, playlist retrieval, and
 * Google OAuth integration while remaining decoupled from the raw Samsung TV WebSocket controller.
 */

import {
  IYouTubeService,
  YouTubeAuthStatus,
  YouTubeLaunchOptions,
  YouTubePlaylist,
  YouTubeVideo,
} from '../../types/youtube.types.ts';

export const CURATED_YOUTUBE_STREAMS: YouTubeVideo[] = [
  {
    id: 'LXb3EKWsInQ',
    title: 'Samsung TV 4K HDR Demo - Vibrant Colors & Deep Contrast',
    description: 'High dynamic range showcase tailored for Samsung Crystal UHD & QLED screens.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=60',
    channelTitle: 'Ultra HD Showcase',
    duration: '4:12',
    isCurated: true,
  },
  {
    id: 'fJ9rUzIMcZQ',
    title: 'Bohemian Rhapsody (Live Aid 1985) - Queen Remastered',
    description: 'Legendary live performance with full audio dynamics for TV speakers & soundbars.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=60',
    channelTitle: 'Queen Official',
    duration: '21:05',
    isCurated: true,
  },
  {
    id: 'jfKfPfyJRdk',
    title: 'lofi hip hop radio - beats to relax/study to',
    description: 'Continuous 24/7 relaxing lo-fi beats, ideal background ambience on your TV screen.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=500&auto=format&fit=crop&q=60',
    channelTitle: 'Lofi Girl',
    duration: 'Live Stream',
    isCurated: true,
  },
  {
    id: 'Bey4XXJAqS8',
    title: 'Nature in 4K UHD - Costa Rica Rainforest & Wildlife',
    description: 'Crystal-clear nature documentary in 60fps testing motion smoothing & color gamut.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=500&auto=format&fit=crop&q=60',
    channelTitle: 'Jacob + Katie Schwarz',
    duration: '5:16',
    isCurated: true,
  },
  {
    id: '9bZkp7q19f0',
    title: 'PSY - GANGNAM STYLE (강남스타일) M/V',
    description: 'Classic high-energy music video to test stereo panning and latency.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=60',
    channelTitle: 'officialpsy',
    duration: '4:13',
    isCurated: true,
  },
  {
    id: 'M7lc1UVf-VE',
    title: 'YouTube on Smart TV Setup & Remote Guide',
    description: 'Official introduction to YouTube on Smart TVs, navigation, and second-screen pairing.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=500&auto=format&fit=crop&q=60',
    channelTitle: 'YouTube Help',
    duration: '3:04',
    isCurated: true,
  },
];

export class YouTubeService implements IYouTubeService {
  /**
   * Retrieves current Google account authentication status from server
   */
  public async getAuthStatus(): Promise<YouTubeAuthStatus> {
    try {
      const res = await fetch('/api/auth/google/status', {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        return {
          isAuthenticated: false,
          user: null,
          hasOAuthConfig: false,
        };
      }
      return (await res.json()) as YouTubeAuthStatus;
    } catch {
      return {
        isAuthenticated: false,
        user: null,
        hasOAuthConfig: false,
      };
    }
  }

  /**
   * Fetches Google OAuth authorization URL to open in popup
   */
  public async getAuthUrl(): Promise<string | null> {
    try {
      const res = await fetch('/api/auth/google/url');
      if (!res.ok) return null;
      const data = await res.json();
      return data.url || null;
    } catch {
      return null;
    }
  }

  /**
   * Disconnects linked Google account
   */
  public async disconnect(): Promise<boolean> {
    try {
      const res = await fetch('/api/auth/google/disconnect', { method: 'POST' });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Returns curated 4K test streams specifically tailored for Samsung Smart TVs
   */
  public getCuratedStreams(): YouTubeVideo[] {
    return [...CURATED_YOUTUBE_STREAMS];
  }

  /**
   * Searches for YouTube videos via server proxy or client fallback
   */
  public async searchVideos(query: string): Promise<YouTubeVideo[]> {
    const q = query.trim();
    if (!q) return this.getCuratedStreams();

    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.videos) && data.videos.length > 0) {
          return data.videos;
        }
      }
    } catch {
      // Graceful fallback to client filtering
    }

    // Filter curated or synthesize query video item
    const matches = CURATED_YOUTUBE_STREAMS.filter(
      (v) =>
        v.title.toLowerCase().includes(q.toLowerCase()) ||
        (v.description && v.description.toLowerCase().includes(q.toLowerCase()))
    );

    if (matches.length > 0) {
      return matches;
    }

    // Check if user entered a direct video ID or URL
    const extracted = this.extractVideoId(q);
    if (extracted) {
      return [
        {
          id: extracted,
          title: `Direct YouTube Video (${extracted})`,
          description: 'User specified YouTube Video ready to launch on Samsung TV.',
          thumbnailUrl: `https://img.youtube.com/vi/${extracted}/hqdefault.jpg`,
          channelTitle: 'YouTube',
          duration: 'Direct Stream',
        },
      ];
    }

    return [];
  }

  /**
   * Fetches authenticated user's YouTube playlists
   */
  public async getUserPlaylists(): Promise<YouTubePlaylist[]> {
    try {
      const res = await fetch('/api/youtube/playlists');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.playlists)) {
          return data.playlists;
        }
      }
    } catch {
      // ignore
    }
    return [];
  }

  /**
   * Fetches authenticated user's liked YouTube videos
   */
  public async getLikedVideos(): Promise<YouTubeVideo[]> {
    try {
      const res = await fetch('/api/youtube/liked');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.videos)) {
          return data.videos;
        }
      }
    } catch {
      // ignore
    }
    return [];
  }

  /**
   * Extracts a YouTube Video ID from standard YouTube URLs, Shorts, Embeds, or raw IDs.
   * Handles:
   * - https://www.youtube.com/watch?v=LXb3EKWsInQ
   * - https://youtu.be/LXb3EKWsInQ
   * - https://www.youtube.com/shorts/LXb3EKWsInQ
   * - https://www.youtube.com/embed/LXb3EKWsInQ
   * - LXb3EKWsInQ (11 character ID)
   */
  public extractVideoId(urlOrId: string): string | null {
    if (!urlOrId) return null;
    const trimmed = urlOrId.trim();

    // Direct 11-char video ID (e.g. LXb3EKWsInQ)
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }

    // Standard youtube.com/watch?v=...
    const vParamMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (vParamMatch && vParamMatch[1]) {
      return vParamMatch[1];
    }

    // Short links youtu.be/...
    const youtuBeMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (youtuBeMatch && youtuBeMatch[1]) {
      return youtuBeMatch[1];
    }

    // Shorts /embed/...
    const pathMatch = trimmed.match(/(?:shorts|embed)\/([a-zA-Z0-9_-]{11})/);
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1];
    }

    return null;
  }

  /**
   * Builds the formatted payload expected by Samsung TV Tizen / DIAL protocols
   * for YouTube video deep linking.
   */
  public buildLaunchPayload(options: YouTubeLaunchOptions): string {
    if (options.videoId) {
      const cleanId = options.videoId.trim();
      return `v=${encodeURIComponent(cleanId)}`;
    }
    if (options.playlistId) {
      const cleanList = options.playlistId.trim();
      return `list=${encodeURIComponent(cleanList)}`;
    }
    if (options.searchQuery) {
      return `q=${encodeURIComponent(options.searchQuery.trim())}`;
    }
    return '';
  }
}

export const youTubeService = new YouTubeService();
